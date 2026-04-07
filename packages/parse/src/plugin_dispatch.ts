import { type node_buffer, node_kind, kind_to_string, string_to_kind } from "./utils";
import { UndoLog, UndoEntryKind } from "./undo_log";
import {
	NodeView,
	ViewCache,
	type TextSource,
	SourceTextSource,
	WireTextSource,
} from "./node_view";
import type {
	ParsePlugin,
	NodeHandler,
	ComposedHandler,
	PluginContext,
	IdRegister,
} from "./plugin_types";

const NONE = 0xffffffff;

/** total number of node kinds in the enum. */
const NODE_KIND_COUNT = 35;

/** first synthetic id. high bit flag partitions id space from parser ids. */
const SYNTHETIC_ID_BASE = 0x40000000;

// --- handler composition ---

/** single handler: no wrapper needed, just normalize return type. */
function compose_1(h: NodeHandler): ComposedHandler {
	const parse = h.parse;
	return function handler_1(
		view: NodeView,
		ctx: PluginContext,
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
		ctx: PluginContext,
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
	c: NodeHandler,
): ComposedHandler {
	const pa = a.parse;
	const pb = b.parse;
	const pc = c.parse;
	return function handler_3(
		view: NodeView,
		ctx: PluginContext,
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
		ctx: PluginContext,
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

// --- handlers table ---

/** 35 slots, one per node_kind. null means no handlers. */
type HandlersTable = (ComposedHandler | null)[];

interface RegistrationResult {
	fused: HandlersTable;
	sequential: { plugin: ParsePlugin; handlers: HandlersTable }[];
	has_handler: Uint32Array;
}

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
		null,
	);

	for (const plugin of fused_plugins) {
		for (const key of Object.keys(plugin)) {
			if (key === "sequential") continue;
			const kind = string_to_kind(key);
			if (kind === undefined) continue;
			const entry = plugin[key];
			if (!entry || typeof entry !== "object" || !("parse" in entry))
				continue;
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
			if (key === "sequential") continue;
			const kind = string_to_kind(key);
			if (kind === undefined) continue;
			const entry = plugin[key];
			if (!entry || typeof entry !== "object" || !("parse" in entry))
				continue;
			table[kind] = compose_1(entry as NodeHandler);
		}
		return { plugin, handlers: table };
	});

	return { fused, sequential, has_handler };
}

// --- close callback store ---

/**
 * stores close callbacks indexed by buffer index.
 * flat array gives O(1) access since buffer indices are sequential.
 */
class CloseCallbackStore {
	private store: ((() => void)[] | undefined)[] = [];

	set(idx: number, callbacks: (() => void)[]): void {
		this.store[idx] = callbacks;
	}

	/** take close callbacks for a node, removing the entry. returns undefined if none. */
	take(idx: number): (() => void)[] | undefined {
		const cbs = this.store[idx];
		if (cbs !== undefined) this.store[idx] = undefined;
		return cbs;
	}

	/** fire close callbacks for a node, removing the entry. */
	fire(idx: number): void {
		const cbs = this.store[idx];
		if (cbs === undefined) return;
		for (let i = 0; i < cbs.length; i++) {
			cbs[i]();
		}
		this.store[idx] = undefined;
	}

	/** discard callbacks without firing (for revocation). */
	discard(idx: number): void {
		this.store[idx] = undefined;
	}

	reset(): void {
		this.store.length = 0;
	}
}

// --- the 35-arm dispatch switch ---

/**
 * dispatch plugin handlers for a node open event.
 *
 * the switch destructures the handlers table into 35 locals at the top.
 * each arm calls its own local, giving the jit a monomorphic call site
 * per kind.
 */
function dispatch_open(
	kind: node_kind,
	view: NodeView,
	ctx: PluginContext,
	fused: HandlersTable,
	has_handler: Uint32Array,
): (() => void)[] | null {
	// bitmask fast path: no handler for this kind
	if (!(has_handler[kind >> 5] & (1 << (kind & 31)))) return null;

	// destructure into monomorphic locals
	const h_0 = fused[0];
	const h_1 = fused[1];
	const h_2 = fused[2];
	const h_3 = fused[3];
	const h_4 = fused[4];
	const h_5 = fused[5];
	const h_6 = fused[6];
	const h_7 = fused[7];
	const h_8 = fused[8];
	const h_9 = fused[9];
	const h_10 = fused[10];
	const h_11 = fused[11];
	const h_12 = fused[12];
	const h_13 = fused[13];
	const h_14 = fused[14];
	const h_15 = fused[15];
	const h_16 = fused[16];
	const h_17 = fused[17];
	const h_18 = fused[18];
	const h_19 = fused[19];
	const h_20 = fused[20];
	const h_21 = fused[21];
	const h_22 = fused[22];
	const h_23 = fused[23];
	const h_24 = fused[24];
	const h_25 = fused[25];
	const h_26 = fused[26];
	const h_27 = fused[27];
	const h_28 = fused[28];
	const h_29 = fused[29];
	const h_30 = fused[30];
	const h_31 = fused[31];
	const h_32 = fused[32];
	const h_33 = fused[33];
	const h_34 = fused[34];

	switch (kind) {
		case 0:
			return h_0!(view, ctx);
		case 1:
			return h_1!(view, ctx);
		case 2:
			return h_2!(view, ctx);
		case 3:
			return h_3!(view, ctx);
		case 4:
			return h_4!(view, ctx);
		case 5:
			return h_5!(view, ctx);
		case 6:
			return h_6!(view, ctx);
		case 7:
			return h_7!(view, ctx);
		case 8:
			return h_8!(view, ctx);
		case 9:
			return h_9!(view, ctx);
		case 10:
			return h_10!(view, ctx);
		case 11:
			return h_11!(view, ctx);
		case 12:
			return h_12!(view, ctx);
		case 13:
			return h_13!(view, ctx);
		case 14:
			return h_14!(view, ctx);
		case 15:
			return h_15!(view, ctx);
		case 16:
			return h_16!(view, ctx);
		case 17:
			return h_17!(view, ctx);
		case 18:
			return h_18!(view, ctx);
		case 19:
			return h_19!(view, ctx);
		case 20:
			return h_20!(view, ctx);
		case 21:
			return h_21!(view, ctx);
		case 22:
			return h_22!(view, ctx);
		case 23:
			return h_23!(view, ctx);
		case 24:
			return h_24!(view, ctx);
		case 25:
			return h_25!(view, ctx);
		case 26:
			return h_26!(view, ctx);
		case 27:
			return h_27!(view, ctx);
		case 28:
			return h_28!(view, ctx);
		case 29:
			return h_29!(view, ctx);
		case 30:
			return h_30!(view, ctx);
		case 31:
			return h_31!(view, ctx);
		case 32:
			return h_32!(view, ctx);
		case 33:
			return h_33!(view, ctx);
		case 34:
			return h_34!(view, ctx);
		default:
			return null;
	}
}

// --- sequential pass walker ---

/**
 * depth-first walk over the soa buffer.
 * calls visitor(idx, kind, false) on open, visitor(idx, kind, true) on close.
 */
function walk_tree(
	buf: node_buffer,
	visitor: (idx: number, kind: node_kind, is_close: boolean) => void,
): void {
	const children_starts = buf._children_starts;
	const next_siblings = buf._next_siblings;
	const parents = buf._parents;
	const kinds = buf._kinds;

	let idx = children_starts[0]; // first child of root
	if (idx === NONE) return;

	const stack: number[] = [];

	while (true) {
		visitor(idx, kinds[idx] as node_kind, false);

		const child = children_starts[idx];
		if (child !== NONE) {
			stack.push(idx);
			idx = child;
			continue;
		}

		visitor(idx, kinds[idx] as node_kind, true);

		let next = next_siblings[idx];
		while (
			(next === NONE || parents[next] !== parents[idx]) &&
			stack.length > 0
		) {
			idx = stack.pop()!;
			visitor(idx, kinds[idx] as node_kind, true);
			next = next_siblings[idx];
		}

		if (next === NONE || parents[next] !== parents[idx]) break;
		idx = next;
	}
}

// --- PluginDispatcher ---

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
	private undo: UndoLog = new UndoLog();
	private close_cbs: CloseCallbackStore = new CloseCallbackStore();
	private ctx: PluginContext = {};
	private text_source: TextSource;

	/**
	 * redirect map: when wrapInner is called, subsequent children
	 * targeting the parent should land in the wrapper instead.
	 */
	private redirects: Map<number, number> = new Map();

	private next_synthetic_id = SYNTHETIC_ID_BASE;

	constructor(plugins: ParsePlugin[], text_source: TextSource) {
		const reg = register_plugins(plugins);
		this.fused = reg.fused;
		this.has_handler = reg.has_handler;
		this.sequential = reg.sequential;
		this.text_source = text_source;
	}

	/** check whether any fused handlers exist for this kind. */
	has_handlers(kind: node_kind): boolean {
		return !!(this.has_handler[kind >> 5] & (1 << (kind & 31)));
	}

	/** check if a parent index has a redirect (wrapInner). */
	get_redirect(parent_idx: number): number | undefined {
		return this.redirects.get(parent_idx);
	}

	/** register a wrapInner redirect. */
	set_redirect(parent_idx: number, wrapper_idx: number): void {
		this.redirects.set(parent_idx, wrapper_idx);
	}

	/** clear a redirect (on parent close). */
	clear_redirect(parent_idx: number): void {
		this.redirects.delete(parent_idx);
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
		kind: node_kind,
		buf: node_buffer,
		id_register: IdRegister,
	): void {
		const cache = new ViewCache(
			buf,
			this.text_source,
			this.undo,
			buf_idx,
		);
		const view = cache.get(buf_idx)!;

		this.undo.set_active_node(buf_idx);
		const callbacks = dispatch_open(
			kind,
			view,
			this.ctx,
			this.fused,
			this.has_handler,
		);
		this.undo.clear_active_node();

		// check if the handler called wrapInner and register redirect.
		// scan the undo log for WrapInner entries targeting this node.
		const entries = this.undo.get_entries(buf_idx);
		if (entries) {
			for (let i = 0; i < entries.length; i++) {
				const e = entries[i];
				if (
					e.kind === UndoEntryKind.WrapInner &&
					e.parent === buf_idx
				) {
					this.redirects.set(buf_idx, e.wrapper);
				}
			}
		}

		if (callbacks) {
			this.close_cbs.set(buf_idx, callbacks);
		}

		cache.clear();
	}

	/**
	 * dispatch close callbacks for a node.
	 * fires callbacks with undo attribution, then commits.
	 */
	dispatch_close(buf_idx: number, buf: node_buffer): void {
		this.redirects.delete(buf_idx);

		// take and fire close callbacks with undo attribution
		const cbs = this.close_cbs.take(buf_idx);
		if (cbs) {
			const cache = new ViewCache(
				buf,
				this.text_source,
				this.undo,
				buf_idx,
			);
			this.undo.set_active_node(buf_idx);
			for (let i = 0; i < cbs.length; i++) {
				cbs[i]();
			}
			this.undo.clear_active_node();
			cache.clear();
		}

		// commit: discard undo log, mutations are permanent
		this.undo.commit(buf_idx);
	}

	/**
	 * revoke all plugin mutations for a node.
	 * walks undo log in reverse, discards close callbacks.
	 * must be called BEFORE handle_repair().
	 */
	dispatch_revoke(buf_idx: number, buf: node_buffer): void {
		this.redirects.delete(buf_idx);
		this.close_cbs.discard(buf_idx);
		this.undo.revoke(buf_idx, buf);

		// recurse into children to revoke their plugin state too
		let child = buf._children_starts[buf_idx];
		while (child !== NONE && buf._parents[child] === buf_idx) {
			this.dispatch_revoke(child, buf);
			child = buf._next_siblings[child];
		}
	}

	/**
	 * run sequential plugin passes over a completed tree.
	 * each sequential plugin gets its own tree walk.
	 */
	run_sequential(buf: node_buffer): void {
		for (const pass of this.sequential) {
			const close_store = new CloseCallbackStore();

			walk_tree(buf, (idx, kind, is_close) => {
				if (is_close) {
					close_store.fire(idx);
					return;
				}

				const handler = pass.handlers[kind];
				if (handler === null) return;

				const cache = new ViewCache(
					buf,
					this.text_source,
					this.undo,
					idx,
				);
				const view = cache.get(idx)!;

				this.undo.set_active_node(idx);
				const callbacks = handler(view, this.ctx);
				this.undo.clear_active_node();

				if (callbacks) {
					close_store.set(idx, callbacks);
				}

				cache.clear();
			});
		}
	}

	/** reset all state. */
	reset(): void {
		this.undo.clear();
		this.close_cbs.reset();
		this.redirects.clear();
		this.next_synthetic_id = SYNTHETIC_ID_BASE;
	}
}
