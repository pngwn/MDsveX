import {
	type NodeBuffer,
	NodeField,
	NodeKind,
	kind_to_string,
	string_to_kind,
} from './utils';
import { UndoLog, UndoEntryKind } from './undo_log';
import {
	NodeView,
	ViewCache,
	type TextSource,
	SourceTextSource,
	WireTextSource,
} from './node_view';
import type {
	ParsePlugin,
	NodeHandler,
	ComposedHandler,
	PluginContext,
} from './plugin_types';

const NONE = 0xffffffff;

/** total number of node kinds in the enum. */
const NODE_KIND_COUNT = 35;

/** first synthetic id. high bit flag partitions id space from parser ids. */
const SYNTHETIC_ID_BASE = 0x40000000;

/** single handler: no wrapper needed, just normalize return type. */
function compose_1(h: NodeHandler): ComposedHandler {
	const parse = h.parse;
	return function handler_1(
		view: NodeView,
		ctx: PluginContext
	): (() => void)[] | null {
		const cb = parse(view, ctx);
		if (cb) return [cb];
		return null;
	};
}

/** two handlers: unrolled, both call sites monomorphic. */
function compose_2(a: NodeHandler, b: NodeHandler): ComposedHandler {
	const pa = a.parse;
	const pb = b.parse;
	return function handler_2(
		view: NodeView,
		ctx: PluginContext
	): (() => void)[] | null {
		const ca = pa(view, ctx);
		const cb = pb(view, ctx);
		if (ca) {
			if (cb) return [ca, cb];
			return [ca];
		}
		if (cb) return [cb];
		return null;
	};
}

/** three handlers: unrolled. */
function compose_3(
	a: NodeHandler,
	b: NodeHandler,
	c: NodeHandler
): ComposedHandler {
	const pa = a.parse;
	const pb = b.parse;
	const pc = c.parse;
	return function handler_3(
		view: NodeView,
		ctx: PluginContext
	): (() => void)[] | null {
		const ca = pa(view, ctx);
		const cb = pb(view, ctx);
		const cc = pc(view, ctx);
		let result: (() => void)[] | null = null;
		if (ca) {
			result = [ca];
		}
		if (cb) {
			result ? result.push(cb) : (result = [cb]);
		}
		if (cc) {
			result ? result.push(cc) : (result = [cc]);
		}
		return result;
	};
}

/** four or more handlers: loop fallback. */
function compose_n(handlers: NodeHandler[]): ComposedHandler {
	const parses = handlers.map((h) => h.parse);
	const len = parses.length;
	return function handler_n(
		view: NodeView,
		ctx: PluginContext
	): (() => void)[] | null {
		let result: (() => void)[] | null = null;
		for (let i = 0; i < len; i++) {
			const cb = parses[i](view, ctx);
			if (cb) {
				result ? result.push(cb) : (result = [cb]);
			}
		}
		return result;
	};
}

function compose(handlers: NodeHandler[]): ComposedHandler {
	switch (handlers.length) {
		case 1:
			return compose_1(handlers[0]);
		case 2:
			return compose_2(handlers[0], handlers[1]);
		case 3:
			return compose_3(handlers[0], handlers[1], handlers[2]);
		default:
			return compose_n(handlers);
	}
}

/** 35 slots, one per NodeKind. null means no handlers. */
type HandlersTable = (ComposedHandler | null)[];

interface RegistrationResult {
	fused: HandlersTable;
	sequential: { plugin: ParsePlugin; handlers: HandlersTable }[];
	has_handler: Uint32Array;
	/** 1 for each kind with a fused handler, shared, never written */
	open_wants: Uint8Array;
}

/** open_wants once a redirect exists: any open may need retargeting */
const ALL_WANTS = new Uint8Array(64).fill(1);

function register_plugins(plugins: ParsePlugin[]): RegistrationResult {
	const fused_plugins: ParsePlugin[] = [];
	const sequential_plugins: ParsePlugin[] = [];

	for (const p of plugins) {
		if (p.sequential) {
			sequential_plugins.push(p);
		} else {
			fused_plugins.push(p);
		}
	}

	// build per-kind handler lists for fused plugins
	const per_kind: (NodeHandler[] | null)[] = new Array(NODE_KIND_COUNT).fill(
		null
	);

	for (const plugin of fused_plugins) {
		for (const key of Object.keys(plugin)) {
			if (key === 'sequential') continue;
			const kind = string_to_kind(key);
			if (kind === undefined) continue;
			const entry = plugin[key];
			if (!entry || typeof entry !== 'object' || !('parse' in entry)) continue;
			if (!per_kind[kind]) per_kind[kind] = [];
			per_kind[kind]!.push(entry as NodeHandler);
		}
	}

	// compose fused handlers
	const fused: HandlersTable = new Array(NODE_KIND_COUNT).fill(null);
	const has_handler = new Uint32Array(2); // 64 bits, need 35

	for (let i = 0; i < NODE_KIND_COUNT; i++) {
		const list = per_kind[i];
		if (list && list.length > 0) {
			fused[i] = compose(list);
			has_handler[i >> 5] |= 1 << (i & 31);
		}
	}

	// build sequential handler tables
	const sequential = sequential_plugins.map((plugin) => {
		const table: HandlersTable = new Array(NODE_KIND_COUNT).fill(null);
		for (const key of Object.keys(plugin)) {
			if (key === 'sequential') continue;
			const kind = string_to_kind(key);
			if (kind === undefined) continue;
			const entry = plugin[key];
			if (!entry || typeof entry !== 'object' || !('parse' in entry)) continue;
			table[kind] = compose_1(entry as NodeHandler);
		}
		return { plugin, handlers: table };
	});

	// a pass with no handler would do nothing
	return {
		fused,
		sequential: sequential.filter((pass) =>
			pass.handlers.some((h) => h !== null)
		),
		has_handler,
		open_wants: wants_of(has_handler),
	};
}

function wants_of(has_handler: Uint32Array): Uint8Array {
	const wants = new Uint8Array(64);
	for (let k = 0; k < 64; k++) {
		if (has_handler[k >> 5] & (1 << (k & 31))) wants[k] = 1;
	}
	return wants;
}

/** parse_of for an entry the registration skips */
const NO_PARSE = {};

function parse_of(entry: unknown): unknown {
	return entry && typeof entry === 'object' && 'parse' in entry
		? (entry as NodeHandler).parse
		: NO_PARSE;
}

/** everything register_plugins reads, in the order it reads it */
function snapshot_plugins(plugins: ParsePlugin[]): unknown[] {
	const snap: unknown[] = [plugins.length];
	for (let i = 0; i < plugins.length; i++) {
		const p = plugins[i];
		const keys = Object.keys(p);
		snap.push(p, !!p.sequential, keys.length);
		for (let k = 0; k < keys.length; k++) {
			const entry = p[keys[k]];
			snap.push(keys[k], entry, parse_of(entry));
		}
	}
	return snap;
}

function snapshot_matches(plugins: ParsePlugin[], snap: unknown[]): boolean {
	let j = 0;
	if (snap[j++] !== plugins.length) return false;
	for (let i = 0; i < plugins.length; i++) {
		const p = plugins[i];
		if (snap[j++] !== p) return false;
		if (snap[j++] !== !!p.sequential) return false;
		// inherited enumerable keys change the count or a key, so an exact match
		// means the same own keys without allocating Object.keys
		const count = snap[j++] as number;
		const keys_end = j + count * 3;
		for (const key in p) {
			if (j === keys_end || snap[j++] !== key) return false;
			const entry = p[key];
			if (snap[j++] !== entry) return false;
			if (snap[j++] !== parse_of(entry)) return false;
		}
		if (j !== keys_end) return false;
	}
	return true;
}

// nothing writes a registration after register_plugins, so documents whose
// plugins hold the same objects, keys and handlers can share one
let last_snapshot: unknown[] | null = null;
let last_registration: RegistrationResult | null = null;

function registration_for(plugins: ParsePlugin[]): RegistrationResult {
	if (last_snapshot !== null && snapshot_matches(plugins, last_snapshot)) {
		return last_registration!;
	}
	const reg = register_plugins(plugins);
	last_snapshot = snapshot_plugins(plugins);
	last_registration = reg;
	return reg;
}

/**
 * a Map since handled nodes can sit over 1024 indices apart, and an array
 * written past such a gap falls back to dictionary elements
 */
class CloseCallbackStore {
	private store: Map<number, (() => void)[]> | null = null;
	// entries still set, most nodes close with none so the lookup is skipped
	live = 0;

	set(idx: number, callbacks: (() => void)[]): void {
		let store = this.store;
		if (store === null) store = this.store = new Map();
		store.set(idx, callbacks);
		this.live = store.size;
	}

	/** take close callbacks for a node, removing the entry. returns undefined if none. */
	take(idx: number): (() => void)[] | undefined {
		if (this.live === 0) return undefined;
		const store = this.store!;
		const cbs = store.get(idx);
		if (cbs !== undefined) {
			store.delete(idx);
			this.live = store.size;
		}
		return cbs;
	}

	/** fire close callbacks for a node, removing the entry. */
	fire(idx: number): void {
		const cbs = this.take(idx);
		if (cbs === undefined) return;
		for (let i = 0; i < cbs.length; i++) {
			cbs[i]();
		}
	}

	/** discard callbacks without firing (for revocation). */
	discard(idx: number): void {
		this.take(idx);
	}

	reset(): void {
		if (this.store !== null) this.store.clear();
		this.live = 0;
	}
}

/**
 * dispatch plugin handlers for a node open event.
 *
 * each switch arm is a monomorphic call site for its own kind
 */
function dispatch_open(
	kind: NodeKind,
	view: NodeView,
	ctx: PluginContext,
	fused: HandlersTable,
	has_handler: Uint32Array
): (() => void)[] | null {
	// bitmask fast path: no handler for this kind
	if (!(has_handler[kind >> 5] & (1 << (kind & 31)))) return null;

	switch (kind) {
		case 0:
			return fused[0]!(view, ctx);
		case 1:
			return fused[1]!(view, ctx);
		case 2:
			return fused[2]!(view, ctx);
		case 3:
			return fused[3]!(view, ctx);
		case 4:
			return fused[4]!(view, ctx);
		case 5:
			return fused[5]!(view, ctx);
		case 6:
			return fused[6]!(view, ctx);
		case 7:
			return fused[7]!(view, ctx);
		case 8:
			return fused[8]!(view, ctx);
		case 9:
			return fused[9]!(view, ctx);
		case 10:
			return fused[10]!(view, ctx);
		case 11:
			return fused[11]!(view, ctx);
		case 12:
			return fused[12]!(view, ctx);
		case 13:
			return fused[13]!(view, ctx);
		case 14:
			return fused[14]!(view, ctx);
		case 15:
			return fused[15]!(view, ctx);
		case 16:
			return fused[16]!(view, ctx);
		case 17:
			return fused[17]!(view, ctx);
		case 18:
			return fused[18]!(view, ctx);
		case 19:
			return fused[19]!(view, ctx);
		case 20:
			return fused[20]!(view, ctx);
		case 21:
			return fused[21]!(view, ctx);
		case 22:
			return fused[22]!(view, ctx);
		case 23:
			return fused[23]!(view, ctx);
		case 24:
			return fused[24]!(view, ctx);
		case 25:
			return fused[25]!(view, ctx);
		case 26:
			return fused[26]!(view, ctx);
		case 27:
			return fused[27]!(view, ctx);
		case 28:
			return fused[28]!(view, ctx);
		case 29:
			return fused[29]!(view, ctx);
		case 30:
			return fused[30]!(view, ctx);
		case 31:
			return fused[31]!(view, ctx);
		case 32:
			return fused[32]!(view, ctx);
		case 33:
			return fused[33]!(view, ctx);
		case 34:
			return fused[34]!(view, ctx);
		default:
			return null;
	}
}

/** the undo log of a dispatcher that made no view and logged no kind */
const NO_UNDO = new UndoLog();

/** shared close callbacks until the first is set, never written */
const NO_CLOSE_CBS = new CloseCallbackStore();

/** shared redirects until the first wrap_inner, never written */
const NO_REDIRECTS: Map<number, number> = new Map();

/**
 * orchestrates plugin dispatch for both TreeBuilder and WireTreeBuilder.
 *
 * holds the handler tables, undo log, close callbacks, redirect map,
 * and synthetic id counter. both builders compose this in.
 */
export class PluginDispatcher {
	private fused: HandlersTable;
	private has_handler: Uint32Array;
	private sequential: { plugin: ParsePlugin; handlers: HandlersTable }[];
	// shared empty until a view or a kind rewrite needs one, never written
	private undo: UndoLog = NO_UNDO;
	// shared empty until a handler returns a close callback
	private close_cbs: CloseCallbackStore = NO_CLOSE_CBS;
	// made at the first handler call, most small documents make none
	private ctx: PluginContext | null = null;
	private text_source: TextSource;

	/**
	 * redirect map: when wrap_inner is called, subsequent children
	 * targeting the parent should land in the wrapper instead.
	 */
	private redirects: Map<number, number> = NO_REDIRECTS;

	private next_synthetic_id = SYNTHETIC_ID_BASE;

	/** one cache serves every dispatch, a view only holds an index */
	private cache: ViewCache | null = null;

	/**
	 * 1 for each kind whose open needs the dispatcher, read by the builder's
	 * open in place of wants_open, every kind once a redirect was registered.
	 * redirects only start inside dispatch_open, builders reread it after one
	 */
	open_wants: Uint8Array;

	constructor(plugins: ParsePlugin[], text_source: TextSource) {
		const reg = registration_for(plugins);
		this.fused = reg.fused;
		this.has_handler = reg.has_handler;
		this.sequential = reg.sequential;
		this.text_source = text_source;
		this.open_wants = reg.open_wants;
	}

	/** cleared since a callback view may have filled it after the last dispatch */
	private views(buf: NodeBuffer): ViewCache {
		const cache = this.cache;
		if (cache === null) {
			let undo = this.undo;
			if (undo === NO_UNDO) undo = this.undo = new UndoLog();
			return (this.cache = new ViewCache(buf, this.text_source, undo));
		}
		cache.clear();
		cache.rebind(buf, this.text_source);
		return cache;
	}

	/** buffer index and prior kind of each kind rewrite, see UndoLog */
	kind_log(): number[] | null {
		return this.undo.kind_changes;
	}

	/** a kind rewrite outside the plugins, such as a revoke repair */
	log_kind(buf_idx: number, prior_kind: number): void {
		let undo = this.undo;
		if (undo === NO_UNDO) undo = this.undo = new UndoLog();
		undo.log_kind(buf_idx, prior_kind);
	}

	/** an open of this kind needs a handler call or a redirect lookup */
	wants_open(kind: NodeKind): boolean {
		return (
			(this.has_handler[kind >> 5] & (1 << (kind & 31))) !== 0 ||
			this.redirects.size !== 0
		);
	}

	/** a close needs no dispatch */
	quiet(): boolean {
		return (
			this.close_cbs.live === 0 && this.redirects.size === 0 && this.undo.empty
		);
	}

	/** check whether any fused handlers exist for this kind. */
	has_handlers(kind: NodeKind): boolean {
		return !!(this.has_handler[kind >> 5] & (1 << (kind & 31)));
	}

	/** check if a parent index has a redirect (wrap_inner). */
	get_redirect(parent_idx: number): number | undefined {
		if (this.redirects.size === 0) return undefined;
		return this.redirects.get(parent_idx);
	}

	private own_redirects(): Map<number, number> {
		let redirects = this.redirects;
		if (redirects === NO_REDIRECTS) {
			redirects = this.redirects = new Map();
			// a redirect can retarget the parent of any open
			this.open_wants = ALL_WANTS;
		}
		return redirects;
	}

	/** allocate a new synthetic node id. */
	allocate_synthetic_id(): number {
		return this.next_synthetic_id++;
	}

	/** update text source (for incremental parsing). */
	set_text_source(text_source: TextSource): void {
		this.text_source = text_source;
	}

	/**
	 * dispatch fused plugin handlers on node open.
	 * creates a ViewCache, runs handlers, stores close callbacks.
	 */
	dispatch_open(
		buf_idx: number,
		kind: NodeKind,
		buf: NodeBuffer
	): void {
		const cache = this.views(buf);
		const view = cache.get(buf_idx)!;

		this.undo.set_active_node(buf_idx);
		const callbacks = dispatch_open(
			kind,
			view,
			this.ctx ?? (this.ctx = {}),
			this.fused,
			this.has_handler
		);
		this.undo.clear_active_node();

		// check if the handler called wrap_inner and register redirects.
		// the wrapped node may be the handler's own node or a node
		// reached via traversal (e.g. node.parent.wrap_inner(...)).
		const entries = this.undo.get_entries(buf_idx);
		if (entries) {
			for (let i = 0; i < entries.length; i++) {
				const e = entries[i];
				if (e.kind === UndoEntryKind.WrapInner) {
					this.own_redirects().set(e.parent, e.wrapper);
				}
			}
		}

		if (callbacks) {
			let close_cbs = this.close_cbs;
			if (close_cbs === NO_CLOSE_CBS)
				close_cbs = this.close_cbs = new CloseCallbackStore();
			close_cbs.set(buf_idx, callbacks);
		}

		cache.clear();
	}

	/**
	 * dispatch close callbacks for a node.
	 * fires callbacks with undo attribution.
	 * only commits the undo log if the node is no longer pending,
	 * pending nodes may still be revoked after close (e.g. tight-list
	 * speculation, inline emphasis).
	 */
	dispatch_close(buf_idx: number, buf: NodeBuffer): void {
		if (this.redirects.size !== 0) this.redirects.delete(buf_idx);

		// take and fire close callbacks with undo attribution
		const cbs = this.close_cbs.take(buf_idx);
		// callbacks cannot change the pending flag
		const pending = buf.pending_at(buf_idx) !== 0;
		if (cbs) {
			// a node no longer pending commits right after its callbacks, so
			// anything they recorded would be dropped unread
			if (pending) this.undo.set_active_node(buf_idx);
			for (let i = 0; i < cbs.length; i++) {
				cbs[i]();
			}
			this.undo.clear_active_node();
		}

		// only commit if the node is no longer pending.
		// pending nodes can still be revoked after close.
		if (!pending) {
			this.undo.commit(buf_idx);
		}
	}

	/**
	 * commit a node's undo log after it has been confirmed non-pending.
	 * called by the builder when a pending node is explicitly committed.
	 */
	dispatch_commit(buf_idx: number): void {
		this.undo.commit(buf_idx);
	}

	/**
	 * revoke all plugin mutations for a node.
	 * walks undo log in reverse, discards close callbacks.
	 * must be called BEFORE handle_repair().
	 */
	dispatch_revoke(buf_idx: number, buf: NodeBuffer): void {
		// nothing recorded, so nothing to undo
		if (
			this.redirects.size === 0 &&
			this.close_cbs.live === 0 &&
			this.undo.empty
		)
			return;
		this.redirects.delete(buf_idx);
		this.close_cbs.discard(buf_idx);

		// clean up redirects from any cross-node WrapInner entries
		// before the undo log is consumed.
		const entries = this.undo.get_entries(buf_idx);
		if (entries) {
			for (let i = 0; i < entries.length; i++) {
				const e = entries[i];
				if (e.kind === UndoEntryKind.WrapInner) {
					this.redirects.delete(e.parent);
				}
			}
		}

		this.undo.revoke(buf_idx, buf);

		// recurse into children to revoke their plugin state too
		let child = buf.first_child_at(buf_idx);
		while (child !== NONE && buf.parent_at(child) === buf_idx) {
			this.dispatch_revoke(child, buf);
			child = buf.next_at(child);
		}
	}

	/**
	 * run sequential plugin passes over a completed tree.
	 * each sequential plugin gets its own tree walk.
	 */
	run_sequential(buf: NodeBuffer): void {
		for (const pass of this.sequential) {
			const handlers = pass.handlers;

			// read again after plugin code runs, a handler or callback that grows the
			// buffer moves it to new storage
			let n = buf._n;
			let idx = n[NodeField.first_child];
			if (idx === NONE) continue;
			// with no handled kind anywhere in the buffer, linked or not, the walk does nothing
			const size = buf._size;
			let handled = false;
			for (
				let b = 0, end = size * NodeField.stride;
				b < end;
				b += NodeField.stride
			) {
				if (handlers[n[b] & 0xff] != null) {
					handled = true;
					break;
				}
			}
			if (!handled) continue;
			const close_store = new CloseCallbackStore();
			const ctx = this.ctx ?? (this.ctx = {});
			const stack: number[] = [];

			while (true) {
				const b = idx * NodeField.stride;
				const handler = handlers[n[b] & 0xff];
				if (handler != null) {
					const cache = this.views(buf);
					const view = cache.get(idx)!;
					// the tree is complete so nothing revokes a sequential write, no
					// active node means none is recorded
					const callbacks = handler(view, ctx);
					if (callbacks) close_store.set(idx, callbacks);
					cache.clear();
					n = buf._n;
				}

				const child = n[b + NodeField.first_child];
				if (child !== NONE) {
					stack.push(idx);
					idx = child;
					continue;
				}

				if (close_store.live !== 0) {
					close_store.fire(idx);
					n = buf._n;
				}

				// read after the callbacks, which may relink the node
				let next = n[b + NodeField.next];
				let parent = n[b + NodeField.parent];
				while (
					(next === NONE ||
						n[next * NodeField.stride + NodeField.parent] !== parent) &&
					stack.length > 0
				) {
					idx = stack.pop()!;
					if (close_store.live !== 0) {
						close_store.fire(idx);
						n = buf._n;
					}
					const bi = idx * NodeField.stride;
					next = n[bi + NodeField.next];
					parent = n[bi + NodeField.parent];
				}

				if (
					next === NONE ||
					n[next * NodeField.stride + NodeField.parent] !== parent
				)
					break;
				idx = next;
			}
		}
	}

	/** reset all state. */
	reset(): void {
		if (this.undo !== NO_UNDO) this.undo.clear();
		this.close_cbs.reset();
		this.redirects.clear();
		this.next_synthetic_id = SYNTHETIC_ID_BASE;
	}
}
