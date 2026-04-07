import type { node_buffer } from "./utils";

const NONE = 0xffffffff;

/** sentinel: the attribute key did not exist before this write. */
export const ATTR_DID_NOT_EXIST: unique symbol = Symbol("ATTR_DID_NOT_EXIST");

// biome-ignore lint/suspicious/no-const-enum: matches project convention
export const enum UndoEntryKind {
	AttrSet = 0,
	AttrDelete = 1,
	TypeChange = 2,
	WrapInner = 3,
	Prepend = 4,
	Append = 5,
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

export type UndoEntry =
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
function _unlink_child(buf: node_buffer, parent: number, child: number): void {
	const prev = buf._prev_siblings[child];
	const next = buf._next_siblings[child];

	if (prev !== NONE) {
		buf._next_siblings[prev] = next;
	} else if (buf._children_starts[parent] === child) {
		buf._children_starts[parent] = next !== NONE && buf._parents[next] === parent ? next : NONE;
	}

	if (next !== NONE && buf._parents[next] === parent) {
		buf._prev_siblings[next] = prev;
	}

	if (buf._children_ends[parent] === child) {
		buf._children_ends[parent] = prev !== NONE ? prev : NONE;
	}

	buf._parents[child] = NONE;
	buf._next_siblings[child] = NONE;
	buf._prev_siblings[child] = NONE;
}

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
	private logs: Map<number, UndoEntry[]> = new Map();

	/**
	 * the buffer index of the node whose handler is currently running.
	 * set by the dispatcher before calling handlers. all record* calls
	 * attribute their entries to this node.
	 */
	private active_node: number = NONE;

	/** called by dispatcher before invoking plugin handlers for a node. */
	set_active_node(index: number): void {
		this.active_node = index;
	}

	/** called by dispatcher after handlers complete. */
	clear_active_node(): void {
		this.active_node = NONE;
	}


	record_attr_set(target: number, key: string, prior_value: any): void {
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
		prior_last_child: number,
	): void {
		this._append({
			kind: UndoEntryKind.WrapInner,
			parent,
			wrapper,
			prior_first_child,
			prior_last_child,
		});
	}

	record_prepend(
		parent: number,
		created: number,
		prior_first_child: number,
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
		prior_last_child: number,
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
		let log = this.logs.get(node);
		if (log === undefined) {
			log = [];
			this.logs.set(node, log);
		}
		log.push(entry);
	}


	/**
	 * revoke all mutations attributed to the given handler node.
	 * walks the undo log in reverse order, restoring prior state.
	 */
	revoke(handler_node: number, buf: node_buffer): void {
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
					const meta = buf.metadata_at(entry.target) ?? {};
					meta[entry.key] = entry.prior_value;
					buf.set_metadata(entry.target, meta);
					break;
				}

				case UndoEntryKind.TypeChange: {
					buf._kinds[entry.target] = entry.prior_kind;
					break;
				}

				case UndoEntryKind.WrapInner: {
					// unwrap: reparent wrapper's CURRENT children back to
					// parent (not just the originals, new children may have
					// arrived via redirect since the wrap) and remove wrapper.
					const parent = entry.parent;
					const wrapper = entry.wrapper;
					buf.unwrap_node(wrapper);
					buf._parents[wrapper] = NONE;
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
					_unlink_child(buf, parent, created);
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
		this.logs.delete(handler_node);
	}

	/** check whether a node has any recorded mutations. */
	has(handler_node: number): boolean {
		return this.logs.has(handler_node);
	}

	/** get undo entries for a node (for redirect detection). */
	get_entries(handler_node: number): UndoEntry[] | undefined {
		return this.logs.get(handler_node);
	}

	/** discard all logs. */
	clear(): void {
		this.logs.clear();
		this.active_node = NONE;
	}
}
