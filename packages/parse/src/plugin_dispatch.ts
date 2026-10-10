import {
	type NodeBuffer,
	NodeField,
	NodeKind,
	kind_to_string,
	string_to_kind,
} from './utils';
import { UndoLog, type RedirectHost } from './undo_log';
import {
	NodeView,
	ViewCache,
	type StructureHost,
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
const NODE_KIND_COUNT = 36;

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

/** 36 slots, one per NodeKind, null means no handlers */
type HandlersTable = (ComposedHandler | null)[];

interface RegistrationResult {
	fused: HandlersTable;
	sequential: { plugin: ParsePlugin; handlers: HandlersTable }[];
	has_handler: Uint32Array;
	/** 1 for each kind with a fused handler, shared, never written */
	open_wants: Uint8Array;
}

/** open_wants once a redirect exists, any open may need retargeting */
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
	const has_handler = new Uint32Array(2); // 64 bits, need 36

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
		case 35:
			return fused[35]!(view, ctx);
		default:
			return null;
	}
}

/** shared undo log until a view or a kind rewrite needs one, never written */
const NO_UNDO = new UndoLog();

/** shared close callbacks until the first is set, never written */
const NO_CLOSE_CBS = new CloseCallbackStore();

/** shared redirect slots until the first wrapper, never written */
const NO_SLOTS = new Uint32Array(0);

/** shared until the first wrap_from, never written */
const NO_WRAPPERS: Set<number> = new Set();

/**
 * orchestrates plugin dispatch for both TreeBuilder and WireTreeBuilder.
 *
 * holds the handler tables, undo log, close callbacks, redirect links,
 * and synthetic id counter. both builders compose this in.
 */
export class PluginDispatcher implements StructureHost, RedirectHost {
	private fused: HandlersTable;
	private has_handler: Uint32Array;
	private sequential: { plugin: ParsePlugin; handlers: HandlersTable }[];
	/** open_wants of the registration, before any redirect */
	private handled: Uint8Array;
	private undo: UndoLog = NO_UNDO;
	private close_cbs: CloseCallbackStore = NO_CLOSE_CBS;
	private ctx: PluginContext | null = null;
	private text_source: TextSource;

	/**
	 * redirect links by buffer index: the wrapper among the children of a
	 * node that takes its later children, 0 for none since the root is never
	 * a wrapper. wrap_inner and wrap_from both add links, and a wrapper can
	 * hold a link itself, so a lookup follows them to the innermost wrapper
	 */
	private slots: Uint32Array = NO_SLOTS;
	/** slots set, at zero no lookup reads the array and the builders skip the dispatcher */
	private links = 0;

	/** wrap_from wrappers that still take siblings, they get an end when they stop */
	private open_from: Set<number> = NO_WRAPPERS;

	/** a closed wrap_from wrapper whose last child was still open, keyed by that child */
	private close_with: Map<number, number> | null = null;

	/** the node whose handler or close callback is running */
	private running = NONE;

	/** the tree is complete, a wrapper has no later children to take */
	private sequential_pass = false;

	private next_synthetic_id = SYNTHETIC_ID_BASE;

	/** one cache serves every dispatch, a view only holds an index */
	private cache: ViewCache | null = null;

	/**
	 * 1 for each kind whose open needs the dispatcher, every kind while a
	 * redirect link exists, links come and go in dispatch_open, dispatch_close
	 * and dispatch_revoke so builders reread it after each
	 */
	open_wants: Uint8Array;

	constructor(plugins: ParsePlugin[], text_source: TextSource) {
		const reg = registration_for(plugins);
		this.fused = reg.fused;
		this.has_handler = reg.has_handler;
		this.sequential = reg.sequential;
		this.text_source = text_source;
		this.open_wants = this.handled = reg.open_wants;
	}

	/** cleared since a callback view may have filled it after the last dispatch */
	private views(buf: NodeBuffer): ViewCache {
		const cache = this.cache;
		if (cache === null) {
			let undo = this.undo;
			if (undo === NO_UNDO) undo = this.undo = new UndoLog();
			return (this.cache = new ViewCache(buf, this.text_source, undo, this));
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
			this.links !== 0
		);
	}

	/** a close needs no dispatch */
	quiet(): boolean {
		return (
			this.close_cbs.live === 0 &&
			this.links === 0 &&
			this.undo.empty &&
			this.close_with === null
		);
	}

	/** check whether any fused handlers exist for this kind. */
	has_handlers(kind: NodeKind): boolean {
		return !!(this.has_handler[kind >> 5] & (1 << (kind & 31)));
	}

	/**
	 * where a new child of this node goes: the node itself, or the innermost
	 * open wrapper under it
	 */
	resolve(parent_idx: number): number {
		if (this.links === 0) return parent_idx;
		const slots = this.slots;
		const length = slots.length;
		while (parent_idx < length) {
			const next = slots[parent_idx];
			if (next === 0) break;
			parent_idx = next;
		}
		return parent_idx;
	}

	/** the innermost open wrapper under a node, undefined when it has none */
	get_redirect(parent_idx: number): number | undefined {
		const target = this.resolve(parent_idx);
		return target === parent_idx ? undefined : target;
	}

	private slot(idx: number): number {
		const slots = this.slots;
		return idx < slots.length ? slots[idx] : 0;
	}

	private set_link(from: number, to: number): void {
		let slots = this.slots;
		if (from >= slots.length) {
			let size = slots.length === 0 ? 256 : slots.length;
			while (size <= from) size <<= 1;
			const grown = new Uint32Array(size);
			grown.set(slots);
			slots = this.slots = grown;
		}
		if (slots[from] === 0 && this.links++ === 0) this.open_wants = ALL_WANTS;
		slots[from] = to;
	}

	private clear_link(from: number): void {
		const slots = this.slots;
		if (from >= slots.length || slots[from] === 0) return;
		slots[from] = 0;
		// the last link gone, opens of unhandled kinds skip the dispatcher again
		if (--this.links === 0) this.open_wants = this.handled;
	}

	/** a node that still takes children, a wrapper does while its parent links to it */
	private takes_children(buf: NodeBuffer, node: number): boolean {
		if (!buf.synthetic_at(node)) return buf.end_at(node) === NONE;
		const parent = buf.parent_at(node);
		return parent !== NONE && this.slot(parent) === node;
	}

	link_inner(buf: NodeBuffer, parent: number, wrapper: number): void {
		// a closed node gets no more children, in a sequential pass none does
		if (this.sequential_pass || !this.takes_children(buf, parent)) return;
		// wrap_children put an open wrapper of this parent inside the new one
		const inner = this.slot(parent);
		this.set_link(parent, wrapper);
		if (inner !== 0) this.set_link(wrapper, inner);
	}

	/** wrap_from and close move nodes when undone, a pending node is revoked often */
	private refuse_pending(buf: NodeBuffer, method: string): void {
		const running = this.running;
		if (running !== NONE && buf.pending_at(running) !== 0) {
			throw new Error(
				`${method} was called from the handler of a pending ` +
					`${kind_to_string(buf.kind_at(running))} node, which may still be ` +
					`revoked, this is not supported yet`
			);
		}
	}

	wrap_from(
		buf: NodeBuffer,
		node: number,
		kind: NodeKind,
		attrs: Record<string, any> | undefined
	): number {
		const parent = buf.parent_at(node);
		if (parent === NONE) {
			throw new Error('wrap_from: the node has no parent to hold the wrapper');
		}
		// a later sibling is already downstream and is never moved
		if (buf.last_child_at(parent) !== node) {
			throw new Error(
				`wrap_from: the ${kind_to_string(buf.kind_at(node))} node already has ` +
					`a later sibling, call it before the next sibling opens`
			);
		}
		this.refuse_pending(buf, 'wrap_from');

		// it starts where the node does and gets an end when it closes
		const wrapper = buf.wrap_node(node, kind, buf.start_at(node), 0, attrs);
		this.undo.record_wrap_from(wrapper);
		if (this.sequential_pass || !this.takes_children(buf, parent)) {
			buf.set_end(wrapper, buf.start_at(wrapper));
			return wrapper;
		}

		// the wrapper goes where a new child of the parent would, which nests
		// it in a wrapper that is still open
		const slots = this.slots;
		let at = parent;
		while (at < slots.length) {
			const next = slots[at];
			if (next === 0 || next === node) break;
			at = next;
		}
		if (this.slot(at) === node) {
			// the node is an open wrapper itself and stays linked below the new one
			this.set_link(at, wrapper);
			this.set_link(wrapper, node);
		} else {
			if (at !== parent) buf.move_to_end(wrapper, at);
			this.set_link(at, wrapper);
		}
		let open_from = this.open_from;
		if (open_from === NO_WRAPPERS) open_from = this.open_from = new Set();
		open_from.add(wrapper);
		return wrapper;
	}

	close_wrapper(buf: NodeBuffer, wrapper: number): void {
		if (!this.open_from.has(wrapper)) return;
		this.refuse_pending(buf, 'close');
		const parent = buf.parent_at(wrapper);
		// a repair moved the wrapper out of its chain
		if (parent === NONE || this.slot(parent) !== wrapper) {
			this.finish(buf, wrapper);
			return;
		}
		// only this link and the ones inside the wrapper, a link above it stays
		this.undo.record_close_wrapper(this.drop_chain(buf, parent));
	}

	/**
	 * remove every link from this node down, ending the wrap_from wrappers
	 * among them, returns the links as UndoEntryCloseWrapper holds them
	 */
	private drop_chain(buf: NodeBuffer, from: number): number[] {
		const links: number[] = [];
		const open_from = this.open_from;
		let key = from;
		let wrapper = this.slot(key);
		while (wrapper !== 0) {
			links.push(key, wrapper, open_from.has(wrapper) ? 1 : 0);
			this.clear_link(key);
			key = wrapper;
			wrapper = this.slot(key);
		}
		// innermost first, so an outer wrapper sees its inner one closed
		for (let i = links.length - 3; i >= 0; i -= 3) {
			if (links[i + 2] === 1) this.finish(buf, links[i + 1]);
		}
		return links;
	}

	/** a wrap_from wrapper takes no more children */
	private finish(buf: NodeBuffer, wrapper: number): void {
		this.open_from.delete(wrapper);
		// a child the parser still has open keeps the wrapper open until it closes
		const last = buf.last_child_at(wrapper);
		if (last !== NONE && this.still_open(buf, last)) {
			let close_with = this.close_with;
			if (close_with === null) close_with = this.close_with = new Map();
			close_with.set(last, wrapper);
			return;
		}
		this.set_closed(buf, wrapper);
	}

	/** a parser node with no end, or a wrapper waiting on a child of its own */
	private still_open(buf: NodeBuffer, node: number): boolean {
		if (buf.end_at(node) !== NONE) return false;
		if (!buf.synthetic_at(node)) return true;
		const close_with = this.close_with;
		if (close_with === null) return false;
		for (const waiting of close_with.values()) {
			if (waiting === node) return true;
		}
		return false;
	}

	/**
	 * the end is the start, a renderer caches a top level block once it has
	 * an end, and the wrappers waiting on this one close with it
	 */
	private set_closed(buf: NodeBuffer, node: number): void {
		for (;;) {
			if (buf.end_at(node) === NONE) buf.set_end(node, buf.start_at(node));
			const close_with = this.close_with;
			if (close_with === null) return;
			const outer = close_with.get(node);
			if (outer === undefined) return;
			close_with.delete(node);
			if (close_with.size === 0) this.close_with = null;
			node = outer;
		}
	}

	/** a node closed or went, the wrapper that waited on it closes or waits on a child */
	private release(buf: NodeBuffer, node: number, revoked: boolean): void {
		const close_with = this.close_with;
		if (close_with === null) return;
		const wrapper = close_with.get(node);
		if (wrapper === undefined) return;
		close_with.delete(node);
		if (close_with.size === 0) this.close_with = null;
		if (revoked) {
			// the repair leaves the children of the node after it in the wrapper
			const last = buf.last_child_at(node);
			if (last !== NONE && this.still_open(buf, last)) {
				(this.close_with ?? (this.close_with = new Map())).set(last, wrapper);
				return;
			}
		}
		this.set_closed(buf, wrapper);
	}

	private forget_wait(wrapper: number): boolean {
		const close_with = this.close_with;
		if (close_with === null) return false;
		let found = false;
		for (const [child, waiting] of close_with) {
			if (waiting === wrapper) {
				close_with.delete(child);
				found = true;
			}
		}
		if (close_with.size === 0) this.close_with = null;
		return found;
	}

	unlink(buf: NodeBuffer, wrapper: number): void {
		// an open wrapper inside this one becomes a child of the parent
		const inner = this.slot(wrapper);
		if (inner !== 0) this.clear_link(wrapper);
		const parent = buf.parent_at(wrapper);
		if (parent !== NONE && this.slot(parent) === wrapper) {
			if (inner !== 0) this.set_link(parent, inner);
			else this.clear_link(parent);
		}
		this.open_from.delete(wrapper);
		this.forget_wait(wrapper);
		// a wrapper that waited on this one waits on what it leaves behind
		if (this.close_with !== null) this.release(buf, wrapper, true);
	}

	reopen(buf: NodeBuffer, links: number[]): void {
		for (let i = 0; i < links.length; i += 3) {
			const parent = links[i];
			const wrapper = links[i + 1];
			const from = links[i + 2] === 1;
			// a repair moved the wrapper, the link no longer describes the tree
			if (buf.parent_at(wrapper) !== parent) return;
			// whatever came after the wrapper while it was closed would have
			// gone into it, and a later child must not land ahead of that
			buf.absorb_following(wrapper);
			if (from) {
				this.forget_wait(wrapper);
				buf.set_end(wrapper, NONE);
			}
			// a parent that closed since takes no more children
			if (i === 0 && !this.takes_children(buf, parent)) {
				if (from) this.finish(buf, wrapper);
				return;
			}
			// a wrapper opened since is among the absorbed and nests in this one
			const inner = this.slot(parent);
			this.set_link(parent, wrapper);
			if (inner !== 0 && inner !== wrapper && this.slot(wrapper) === 0) {
				this.set_link(wrapper, inner);
			}
			if (from) {
				let open_from = this.open_from;
				if (open_from === NO_WRAPPERS) open_from = this.open_from = new Set();
				open_from.add(wrapper);
			}
		}
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
	dispatch_open(buf_idx: number, kind: NodeKind, buf: NodeBuffer): void {
		const cache = this.views(buf);
		const view = cache.get(buf_idx)!;

		// the builder pushed the node under its source parent, so the handlers
		// see that parent and can close a wrapper before opening the next
		const undo = this.undo;
		undo.set_active_node(buf_idx);
		this.running = buf_idx;
		const callbacks = dispatch_open(
			kind,
			view,
			this.ctx ?? (this.ctx = {}),
			this.fused,
			this.has_handler
		);
		undo.clear_active_node();
		this.running = NONE;

		// the node goes where a new child of its parent goes now, a handler
		// that wrapped it left it under a wrapper with no link below
		if (this.links !== 0) {
			const parent = buf.parent_at(buf_idx);
			if (parent !== NONE) {
				const target = this.resolve(parent);
				if (target !== parent) buf.move_to_end(buf_idx, target);
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
		// take and fire close callbacks with undo attribution
		const cbs = this.close_cbs.take(buf_idx);
		// callbacks cannot change the pending flag
		const pending = buf.pending_at(buf_idx) !== 0;
		if (cbs) {
			const undo = this.undo;
			// a node no longer pending commits right after its callbacks, so
			// anything they recorded would be dropped unread
			if (pending) undo.set_active_node(buf_idx);
			this.running = buf_idx;
			for (let i = 0; i < cbs.length; i++) {
				cbs[i]();
			}
			undo.clear_active_node();
			this.running = NONE;
		}

		// after the callbacks, which may still wrap, no child comes after the
		// close so every wrapper below closes with the node
		if (this.links !== 0 && this.slot(buf_idx) !== 0) {
			this.drop_chain(buf, buf_idx);
		}
		if (this.close_with !== null) this.release(buf, buf_idx, false);

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
	 * revoke the plugin mutations of one node, walks its undo log in reverse
	 * and discards its close callbacks
	 * must be called BEFORE handle_repair().
	 */
	dispatch_revoke(buf_idx: number, buf: NodeBuffer): void {
		// nothing recorded, so nothing to undo
		if (
			this.links === 0 &&
			this.close_cbs.live === 0 &&
			this.undo.empty &&
			this.close_with === null
		)
			return;
		this.close_cbs.discard(buf_idx);

		// the repair keeps the children in the tree and the parser revokes each
		// one it gives up on, so their plugin state is left alone
		// each entry takes out or restores its own links through the host, only
		// the wrappers this node made go, a node it wrapped may hold others
		this.undo.revoke(buf_idx, buf, this);

		// what is left under the node goes with it, as it would on a close
		if (this.links !== 0 && this.slot(buf_idx) !== 0) {
			this.drop_chain(buf, buf_idx);
		}
		if (this.close_with !== null) this.release(buf, buf_idx, true);
	}

	/**
	 * run sequential plugin passes over a completed tree.
	 * each sequential plugin gets its own tree walk.
	 */
	run_sequential(buf: NodeBuffer): void {
		if (this.sequential.length === 0) return;
		this.sequential_pass = true;
		for (const pass of this.sequential) {
			const handlers = pass.handlers;

			// reread after plugin code runs, growing the buffer moves it to new storage
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
		this.sequential_pass = false;
	}

	/**
	 * forget one document so the builder can take another, the handler tables
	 * stay, views of the old document throw from here on
	 */
	reset(): void {
		if (this.undo !== NO_UNDO) this.undo.clear();
		this.close_cbs.reset();
		// a document that ended whole dropped every link when its root closed
		if (this.links !== 0) {
			this.slots.fill(0);
			this.links = 0;
		}
		this.open_from.clear();
		this.close_with = null;
		// a throw in a handler leaves these set
		this.running = NONE;
		this.sequential_pass = false;
		// a link switched this to every kind
		this.open_wants = this.handled;
		this.next_synthetic_id = SYNTHETIC_ID_BASE;
		// plugins keep per document state on it
		this.ctx = null;
		if (this.cache !== null) this.cache.invalidate();
	}
}
