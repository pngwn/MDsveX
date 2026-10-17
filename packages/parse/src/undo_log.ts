import type { NodeBuffer } from './utils.js';

const NONE = 0xffffffff;

/** sentinel: the attribute key did not exist before this write. */
export const ATTR_DID_NOT_EXIST: unique symbol = Symbol('ATTR_DID_NOT_EXIST');

// biome-ignore lint/suspicious/no-const-enum: matches project convention
export const enum UndoEntryKind {
	AttrSet = 0,
	AttrDelete = 1,
	TypeChange = 2,
	WrapInner = 3,
	Prepend = 4,
	Append = 5,
	WrapFrom = 6,
	CloseWrapper = 7,
	State = 8,
	Count = 9,
	Warn = 10,
	Data = 11,
}

/** the dispatcher owns the redirect links, so undoing a wrap or a close goes through it */
export interface RedirectHost {
	/** a wrapper is about to be unwrapped, its link and any wait for a close go */
	unlink(buf: NodeBuffer, wrapper: number): void;
	/** a close is undone, see UndoEntryCloseWrapper for links */
	reopen(buf: NodeBuffer, links: number[]): void;
}

/** the dispatcher keeps the data of plugins, a revoke takes a write back through it */
export interface DataHost {
	revoke_data(bag: object, key: string, owner: number): void;
}

export interface UndoEntryAttrSet {
	kind: UndoEntryKind.AttrSet;
	/** buffer index of the node that was actually mutated. */
	target: number;
	key: string;
	prior_value: any;
}

export interface UndoEntryAttrDelete {
	kind: UndoEntryKind.AttrDelete;
	target: number;
	key: string;
	prior_value: any;
}

export interface UndoEntryTypeChange {
	kind: UndoEntryKind.TypeChange;
	target: number;
	prior_kind: number;
}

export interface UndoEntryWrapInner {
	kind: UndoEntryKind.WrapInner;
	/** the parent node that was wrapped. */
	parent: number;
	/** the synthetic wrapper node. */
	wrapper: number;
	/** prior first child of parent (before wrapping). */
	prior_first_child: number;
	/** prior last child of parent (before wrapping). */
	prior_last_child: number;
}

export interface UndoEntryPrepend {
	kind: UndoEntryKind.Prepend;
	parent: number;
	/** the synthetic node that was prepended. */
	created: number;
	/** prior first child of parent. */
	prior_first_child: number;
}

export interface UndoEntryAppend {
	kind: UndoEntryKind.Append;
	parent: number;
	/** the synthetic node that was appended. */
	created: number;
	/** prior last child of parent. */
	prior_last_child: number;
}

export interface UndoEntryWrapFrom {
	kind: UndoEntryKind.WrapFrom;
	/** the synthetic wrapper node */
	wrapper: number;
}

export interface UndoEntryCloseWrapper {
	kind: UndoEntryKind.CloseWrapper;
	/**
	 * the links the close removed, outermost first, three numbers each, the
	 * parent, its wrapper, and 1 when the close ended that wrap_from wrapper
	 */
	links: number[];
}

export interface UndoEntryState {
	kind: UndoEntryKind.State;
	/** the state object of a directive scope, behind its proxy */
	state: Record<string | symbol, any>;
	key: string | symbol;
	/** what the key held before this write, or before the earlier writes undone since */
	prior_value: any;
	/** the writes of the same key around this one, in order */
	prev: UndoEntryState | null;
	next: UndoEntryState | null;
}

export interface UndoEntryCount {
	kind: UndoEntryKind.Count;
	/** the handler runs of a directive scope */
	counts: Int32Array;
	slot: number;
}

export interface UndoEntryWarn {
	kind: UndoEntryKind.Warn;
	/** the warnings of the document, in the order they were reported */
	list: object[];
	warning: object;
}

export interface UndoEntryData {
	kind: UndoEntryKind.Data;
	host: DataHost;
	/** the data of one plugin name */
	bag: object;
	key: string;
	/** the node that wrote, every write it made under the key goes */
	owner: number;
}

export type UndoEntry =
	| UndoEntryData
	| UndoEntryState
	| UndoEntryCount
	| UndoEntryWarn
	| UndoEntryWrapFrom
	| UndoEntryCloseWrapper
	| UndoEntryAttrSet
	| UndoEntryAttrDelete
	| UndoEntryTypeChange
	| UndoEntryWrapInner
	| UndoEntryPrepend
	| UndoEntryAppend;

/**
 * unlink a child node from its parent's sibling chain and orphan it.
 * unlike unwrap_node, this does NOT reparent the child's own children,
 * the entire subtree is detached.
 */
export function unlink_child(
	buf: NodeBuffer,
	parent: number,
	child: number
): void {
	const prev = buf.prev_at(child);
	const next = buf.next_at(child);

	if (prev !== NONE) {
		buf.set_next(prev, next);
	} else if (buf.first_child_at(parent) === child) {
		buf.set_first_child(
			parent,
			next !== NONE && buf.parent_at(next) === parent ? next : NONE
		);
	}

	if (next !== NONE && buf.parent_at(next) === parent) {
		buf.set_prev(next, prev);
	}

	if (buf.last_child_at(parent) === child) {
		buf.set_last_child(parent, prev !== NONE ? prev : NONE);
	}

	buf.set_parent(child, NONE);
	buf.set_next(child, NONE);
	buf.set_prev(child, NONE);
}

/** never written, every write swaps in a map of its own first */
const NO_LOGS: Map<number, UndoEntry[]> = new Map();

/**
 * per-node undo log for plugin mutations.
 *
 * mutations are keyed by the handler node's buffer index, not the
 * node being mutated. this ensures cross-node mutations (a handler
 * modifying its parent) are attributed correctly for revocation.
 *
 * the log is only allocated when a handler actually mutates, so
 * nodes without plugin activity pay nothing.
 */
export class UndoLog {
	/** per-handler-node logs. maps buffer index -> append-only entry array. */
	// a shared empty map until the first entry, most documents record none
	private logs: Map<number, UndoEntry[]> = NO_LOGS;

	/**
	 * the buffer index of the node whose handler is currently running.
	 * set by the dispatcher before calling handlers. all record* calls
	 * attribute their entries to this node.
	 */
	private active_node: number = NONE;

	/** every node with a log is below this index, read only while a log exists */
	top = 0;

	/**
	 * the last write of each key of a scope state, weak as a state goes with
	 * its directive, made at the first write
	 */
	private state_tails: WeakMap<
		object,
		Map<string | symbol, UndoEntryState>
	> | null = null;

	/**
	 * buffer index and prior kind of every kind rewrite, recorded or not, in
	 * order, so the first entry of an index holds its kind at open
	 */
	kind_changes: number[] | null = null;

	log_kind(target: number, prior_kind: number): void {
		const log = this.kind_changes;
		if (log === null) this.kind_changes = [target, prior_kind];
		else log.push(target, prior_kind);
	}

	/** called by dispatcher before invoking plugin handlers for a node. */
	set_active_node(index: number): void {
		this.active_node = index;
	}

	/** called by dispatcher after handlers complete. */
	clear_active_node(): void {
		this.active_node = NONE;
	}

	/** false while nothing would keep an entry */
	get recording(): boolean {
		return this.active_node !== NONE;
	}

	record_attr_set(target: number, key: string, prior_value: any): void {
		if (this.active_node === NONE) return;
		this._append({
			kind: UndoEntryKind.AttrSet,
			target,
			key,
			prior_value,
		});
	}

	record_attr_delete(target: number, key: string, prior_value: any): void {
		this._append({
			kind: UndoEntryKind.AttrDelete,
			target,
			key,
			prior_value,
		});
	}

	record_type_change(target: number, prior_kind: number): void {
		this.log_kind(target, prior_kind);
		if (this.active_node === NONE) return;
		this._append({
			kind: UndoEntryKind.TypeChange,
			target,
			prior_kind,
		});
	}

	record_wrap_inner(
		parent: number,
		wrapper: number,
		prior_first_child: number,
		prior_last_child: number
	): void {
		this._append({
			kind: UndoEntryKind.WrapInner,
			parent,
			wrapper,
			prior_first_child,
			prior_last_child,
		});
	}

	record_wrap_from(wrapper: number): void {
		this._append({ kind: UndoEntryKind.WrapFrom, wrapper });
	}

	record_close_wrapper(links: number[]): void {
		this._append({ kind: UndoEntryKind.CloseWrapper, links });
	}

	/**
	 * a write to the state of a directive scope, ATTR_DID_NOT_EXIST for a new
	 * key, every write joins the chain of its key, one made while nothing
	 * records is never undone and keeps an earlier undo from reaching past it
	 */
	record_state(
		state: Record<string | symbol, any>,
		key: string | symbol,
		prior_value: any
	): void {
		let all = this.state_tails;
		if (all === null) all = this.state_tails = new WeakMap();
		let tails = all.get(state);
		if (tails === undefined) {
			tails = new Map();
			all.set(state, tails);
		}
		const prev = tails.get(key) ?? null;
		const entry: UndoEntryState = {
			kind: UndoEntryKind.State,
			state,
			key,
			prior_value,
			prev,
			next: null,
		};
		if (prev !== null) prev.next = entry;
		tails.set(key, entry);
		if (this.active_node !== NONE) this._append(entry);
	}

	/**
	 * revokes come in any order, a tight list revokes its paragraphs first to
	 * last, so only the last write of a key puts the value back, an earlier
	 * one hands what it replaced to the write after it
	 */
	private undo_state(entry: UndoEntryState): void {
		const prev = entry.prev;
		const next = entry.next;
		if (next !== null) {
			next.prior_value = entry.prior_value;
			next.prev = prev;
		} else {
			if (entry.prior_value === ATTR_DID_NOT_EXIST) {
				delete entry.state[entry.key];
			} else {
				entry.state[entry.key] = entry.prior_value;
			}
			const tails = this.state_tails?.get(entry.state);
			if (tails !== undefined) {
				if (prev !== null) tails.set(entry.key, prev);
				else tails.delete(entry.key);
			}
		}
		if (prev !== null) prev.next = next;
	}

	/** a bound handler ran, its index goes back with the node it ran for */
	record_count(counts: Int32Array, slot: number): void {
		if (this.active_node === NONE) return;
		this._append({ kind: UndoEntryKind.Count, counts, slot });
	}

	/** a handler reported a warning, it is dropped with the node it ran for */
	record_warn(list: object[], warning: object): void {
		if (this.active_node === NONE) return;
		this._append({ kind: UndoEntryKind.Warn, list, warning });
	}

	/** a write to the data of a plugin, taken back with the node that made it */
	record_data(host: DataHost, bag: object, key: string, owner: number): void {
		if (this.active_node === NONE) return;
		this._append({ kind: UndoEntryKind.Data, host, bag, key, owner });
	}

	record_prepend(
		parent: number,
		created: number,
		prior_first_child: number
	): void {
		this._append({
			kind: UndoEntryKind.Prepend,
			parent,
			created,
			prior_first_child,
		});
	}

	record_append(
		parent: number,
		created: number,
		prior_last_child: number
	): void {
		this._append({
			kind: UndoEntryKind.Append,
			parent,
			created,
			prior_last_child,
		});
	}

	private _append(entry: UndoEntry): void {
		const node = this.active_node;
		if (node === NONE) return;
		let logs = this.logs;
		if (logs === NO_LOGS) logs = this.logs = new Map();
		let log = logs.get(node);
		if (log === undefined) {
			log = [];
			if (logs.size === 0 || node >= this.top) this.top = node + 1;
			logs.set(node, log);
		}
		log.push(entry);
	}

	/**
	 * revoke all mutations attributed to the given handler node.
	 * walks the undo log in reverse order, restoring prior state.
	 */
	revoke(handler_node: number, buf: NodeBuffer, host?: RedirectHost): void {
		const log = this.logs.get(handler_node);
		if (log === undefined) return;

		for (let i = log.length - 1; i >= 0; i--) {
			const entry = log[i];
			switch (entry.kind) {
				case UndoEntryKind.AttrSet: {
					const meta = buf.metadata_at(entry.target);
					if (meta) {
						if (entry.prior_value === ATTR_DID_NOT_EXIST) {
							delete meta[entry.key];
						} else {
							meta[entry.key] = entry.prior_value;
						}
						buf.set_metadata(entry.target, meta);
					}
					break;
				}

				case UndoEntryKind.AttrDelete: {
					// a delete keeps the object, so none means a repair dropped it since
					const meta = buf.metadata_at(entry.target);
					if (meta) {
						meta[entry.key] = entry.prior_value;
						buf.set_metadata(entry.target, meta);
					}
					break;
				}

				case UndoEntryKind.TypeChange: {
					buf.set_kind(entry.target, entry.prior_kind);
					break;
				}

				case UndoEntryKind.WrapInner: {
					// unwrap: reparent wrapper's CURRENT children back to
					// parent (not just the originals, new children may have
					// arrived via redirect since the wrap) and remove wrapper.
					const wrapper = entry.wrapper;
					if (host !== undefined) host.unlink(buf, wrapper);
					buf.unwrap_node(wrapper);
					buf.set_parent(wrapper, NONE);
					break;
				}

				case UndoEntryKind.WrapFrom: {
					// the wrapped node and every sibling that joined it since go
					// back to the parent of the wrapper, in its place
					const wrapper = entry.wrapper;
					// an earlier undo already took it out of the tree
					if (buf.parent_at(wrapper) === NONE) break;
					if (host !== undefined) host.unlink(buf, wrapper);
					buf.unwrap_node(wrapper);
					buf.set_parent(wrapper, NONE);
					break;
				}

				case UndoEntryKind.CloseWrapper: {
					if (host !== undefined) host.reopen(buf, entry.links);
					break;
				}

				case UndoEntryKind.State: {
					this.undo_state(entry);
					break;
				}

				case UndoEntryKind.Count: {
					entry.counts[entry.slot]--;
					break;
				}

				case UndoEntryKind.Warn: {
					const at = entry.list.lastIndexOf(entry.warning);
					if (at !== -1) entry.list.splice(at, 1);
					break;
				}

				case UndoEntryKind.Data: {
					entry.host.revoke_data(entry.bag, entry.key, entry.owner);
					break;
				}

				case UndoEntryKind.Prepend:
				case UndoEntryKind.Append: {
					// unlink the synthetic node from wherever it currently
					// sits in the sibling chain. new siblings may have been
					// inserted after the original mutation, so we cannot
					// blindly restore snapshot pointers.
					const parent = entry.parent;
					const created = entry.created;
					unlink_child(buf, parent, created);
					break;
				}
			}
		}

		this.logs.delete(handler_node);
	}

	/**
	 * commit a node, discard its undo log, making mutations permanent.
	 */
	commit(handler_node: number): void {
		if (this.logs.size !== 0) this.logs.delete(handler_node);
	}

	/** true when no node holds a mutation that a revoke would undo */
	get empty(): boolean {
		return this.logs.size === 0;
	}

	/** check whether a node has any recorded mutations. */
	has(handler_node: number): boolean {
		return this.logs.has(handler_node);
	}

	/** discard all logs. */
	clear(): void {
		this.logs.clear();
		this.kind_changes = null;
		this.active_node = NONE;
	}
}
