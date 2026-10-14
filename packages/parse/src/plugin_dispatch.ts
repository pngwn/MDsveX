import {
	type NodeBuffer,
	NodeField,
	NodeKind,
	kind_to_string,
	string_to_kind,
} from './utils';
import {
	UndoLog,
	ATTR_DID_NOT_EXIST,
	unlink_child,
	type DataHost,
	type RedirectHost,
} from './undo_log';
import {
	Bag,
	NO_OWNER,
	json_copy,
	type DataChange,
	type Json,
} from './plugin_data';
import {
	NodeView,
	ViewCache,
	type Position,
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
	PluginData,
	PluginDocument,
	PluginWarning,
	DirectiveContext,
	DirectiveEntry,
	DirectiveHandler,
	DirectiveHandlers,
	DirectiveTable,
	NamedDirectiveHandlers,
	TextHandler,
	TaskContext as PublicTaskContext,
} from './plugin_types';
import { RunPieces, TextRun } from './text_run';
import {
	DraftView,
	OpKind,
	PluginAsyncError,
	PluginTaskError,
	Task,
	TaskState,
	TaskView,
	within,
	type TaskHost,
} from './plugin_tasks';

const NONE = 0xffffffff;

/** total number of node kinds in the enum. */
const NODE_KIND_COUNT = 38;

/** first synthetic id. high bit flag partitions id space from parser ids. */
const SYNTHETIC_ID_BASE = 0x40000000;

/** single handler: no wrapper needed, just normalize return type. */
function compose_1(h: NodeHandler, at: number): ComposedHandler {
	const parse = h.parse;
	return function handler_1(
		view: NodeView,
		contexts: PluginContext[]
	): (() => void)[] | null {
		const cb = parse(view, contexts[at]);
		if (cb) return [cb];
		return null;
	};
}

/** two handlers: unrolled, both call sites monomorphic. */
function compose_2(
	a: NodeHandler,
	b: NodeHandler,
	at_a: number,
	at_b: number
): ComposedHandler {
	const pa = a.parse;
	const pb = b.parse;
	return function handler_2(
		view: NodeView,
		contexts: PluginContext[]
	): (() => void)[] | null {
		const ca = pa(view, contexts[at_a]);
		const cb = pb(view, contexts[at_b]);
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
	at_a: number,
	at_b: number,
	at_c: number
): ComposedHandler {
	const pa = a.parse;
	const pb = b.parse;
	const pc = c.parse;
	return function handler_3(
		view: NodeView,
		contexts: PluginContext[]
	): (() => void)[] | null {
		const ca = pa(view, contexts[at_a]);
		const cb = pb(view, contexts[at_b]);
		const cc = pc(view, contexts[at_c]);
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
function compose_n(handlers: NodeHandler[], at: number[]): ComposedHandler {
	const parses = handlers.map((h) => h.parse);
	const len = parses.length;
	return function handler_n(
		view: NodeView,
		contexts: PluginContext[]
	): (() => void)[] | null {
		let result: (() => void)[] | null = null;
		for (let i = 0; i < len; i++) {
			const cb = parses[i](view, contexts[at[i]]);
			if (cb) {
				result ? result.push(cb) : (result = [cb]);
			}
		}
		return result;
	};
}

/** at is the place of the plugin of each handler, which picks its context */
function compose(handlers: NodeHandler[], at: number[]): ComposedHandler {
	switch (handlers.length) {
		case 1:
			return compose_1(handlers[0], at[0]);
		case 2:
			return compose_2(handlers[0], handlers[1], at[0], at[1]);
		case 3:
			return compose_3(
				handlers[0],
				handlers[1],
				handlers[2],
				at[0],
				at[1],
				at[2]
			);
		default:
			return compose_n(handlers, at);
	}
}

/** a slot per NodeKind, null means no handlers */
type HandlersTable = (ComposedHandler | null)[];

/** the text handler of a sequential plugin and the place of the plugin */
interface TextEntry {
	parse: TextHandler;
	all: boolean;
	at: number;
}

/** one sequential plugin, its handlers by kind and its text handler apart */
interface SequentialPass {
	plugin: ParsePlugin;
	handlers: HandlersTable;
	text: TextEntry | null;
}

/**
 * an element that holds code, a text handler gets no text from inside one
 * unless it asks for all, the raw text elements never have text nodes
 */
const CODE_TAGS = new Set(['code', 'kbd', 'samp', 'var', 'tt']);

interface RegistrationResult {
	fused: HandlersTable;
	sequential: SequentialPass[];
	has_handler: Uint32Array;
	/** PAST_END for each kind with a fused handler, shared, never written */
	open_wants: Int32Array;
	/** the name of each plugin by its place, undefined for one without */
	names: (string | undefined)[];
}

/** above every buffer index, a small integer with all low bits set so an or with an index keeps it */
const PAST_END = 0x3fffffff;

function register_plugins(plugins: ParsePlugin[]): RegistrationResult {
	// build per-kind handler lists for fused plugins
	const per_kind: (NodeHandler[] | null)[] = new Array(NODE_KIND_COUNT).fill(
		null
	);
	const per_kind_at: number[][] = [];
	for (let k = 0; k < NODE_KIND_COUNT; k++) per_kind_at.push([]);
	const sequential: RegistrationResult['sequential'] = [];
	const names: (string | undefined)[] = [];

	for (let at = 0; at < plugins.length; at++) {
		const plugin = plugins[at];
		names.push(typeof plugin.name === 'string' ? plugin.name : undefined);
		// a sequential plugin gets a table of its own
		const table: HandlersTable | null = plugin.sequential
			? new Array(NODE_KIND_COUNT).fill(null)
			: null;
		let text: TextEntry | null = null;
		for (const key of Object.keys(plugin)) {
			if (key === 'sequential') continue;
			const kind = string_to_kind(key);
			if (kind === undefined) continue;
			const entry = plugin[key];
			if (kind === NodeKind.text) {
				if (entry === undefined) continue;
				const named =
					typeof plugin.name === 'string'
						? `the ${plugin.name} plugin`
						: 'a plugin';
				if (typeof entry !== 'function') {
					throw new TypeError(
						`the text handler of ${named} must be a function that takes a run of text`
					);
				}
				// text is whole only once nothing can revoke a node around it
				if (table === null) {
					throw new TypeError(
						`the text handler of ${named} needs the tree to be complete, set sequential: true on the plugin`
					);
				}
				text = { parse: entry, all: plugin.all_text === true, at };
				continue;
			}
			if (!entry || typeof entry !== 'object' || !('parse' in entry)) continue;
			if (table !== null) {
				table[kind] = compose_1(entry as NodeHandler, at);
				continue;
			}
			if (!per_kind[kind]) per_kind[kind] = [];
			per_kind[kind]!.push(entry as NodeHandler);
			per_kind_at[kind].push(at);
		}
		if (table !== null) sequential.push({ plugin, handlers: table, text });
	}

	// compose fused handlers
	const fused: HandlersTable = new Array(NODE_KIND_COUNT).fill(null);
	const has_handler = new Uint32Array(2); // 64 bits, need 38

	for (let i = 0; i < NODE_KIND_COUNT; i++) {
		const list = per_kind[i];
		if (list && list.length > 0) {
			fused[i] = compose(list, per_kind_at[i]);
			has_handler[i >> 5] |= 1 << (i & 31);
		}
	}

	const open_wants = new Int32Array(64);
	for (let k = 0; k < 64; k++) {
		if (has_handler[k >> 5] & (1 << (k & 31))) open_wants[k] = PAST_END;
	}

	// a pass with no handler would do nothing
	return {
		fused,
		sequential: sequential.filter(
			(pass) => pass.text !== null || pass.handlers.some((h) => h !== null)
		),
		has_handler,
		open_wants,
		names,
	};
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

/** a handler by node kind, null for none */
type BoundTable = (DirectiveHandler | null)[];

/** the key of the children handler that takes a child of any type */
const ANY = '*';

/** the count of the any child handler, after those of each kind for children and descendants */
const ANY_SLOT = NODE_KIND_COUNT * 2;

/** the handlers of one directive name, built once per array of tables */
interface BoundEntry {
	children: BoundTable | null;
	/** the children handler for a child of any type, it runs after the one for its type */
	any_child: DirectiveHandler | null;
	descendants: BoundTable | null;
	parse: DirectiveHandler | null;
	/** the kinds children and descendants hold a handler for */
	child_kinds: number[];
	descendant_kinds: number[];
	/** the name of the plugin the table came with, undefined for a bare table */
	plugin: string | undefined;
}

type BoundRegistration = Map<string, BoundEntry>;

function bound_table(
	handlers: DirectiveEntry['children'],
	name: string,
	key: string,
	kinds: number[]
): BoundTable | null {
	if (handlers == null) return null;
	if (typeof handlers !== 'object') {
		throw new TypeError(
			`the ${key} of directive "${name}" must be an object of handlers by node type`
		);
	}
	let table: BoundTable | null = null;
	for (const type of Object.keys(handlers)) {
		const handler = handlers[type];
		if (handler == null) continue;
		if (type === ANY) {
			if (key === 'children') continue;
			throw new Error(
				`only the children handlers of a directive take "${ANY}", directive "${name}" has it in its ${key} handlers`
			);
		}
		const kind = string_to_kind(type);
		// neither builder dispatches a text node, and a typo would never run
		if (
			kind === undefined ||
			kind === NodeKind.text ||
			kind === NodeKind.root
		) {
			throw new Error(
				kind === undefined
					? `unknown node type "${type}" in the ${key} handlers of directive "${name}"`
					: `the ${key} handlers of directive "${name}" can not take ${type} nodes`
			);
		}
		if (typeof handler !== 'function') {
			throw new TypeError(
				`the ${key}.${type} handler of directive "${name}" must be a function`
			);
		}
		if (table === null) table = new Array(NODE_KIND_COUNT).fill(null);
		table[kind] = handler;
		kinds.push(kind);
	}
	return table;
}

/** an entry of a table is an object, so a name that is a string is the name of a plugin */
function is_named(table: DirectiveTable): table is NamedDirectiveHandlers {
	return typeof (table as NamedDirectiveHandlers).name === 'string';
}

/** null when no entry has a handler, so nothing needs a dispatcher */
function register_bound(tables: DirectiveTable[]): BoundRegistration | null {
	let bound: BoundRegistration | null = null;
	for (const given of tables) {
		let table: DirectiveHandlers;
		let plugin: string | undefined;
		if (is_named(given)) {
			table = given.directives;
			plugin = given.name;
			if (table === null || typeof table !== 'object') {
				throw new TypeError(
					`the directives of plugin "${plugin}" must be an object of entries by directive name`
				);
			}
		} else table = given;
		for (const name of Object.keys(table)) {
			const entry = table[name];
			if (entry == null || typeof entry !== 'object') continue;
			const child_kinds: number[] = [];
			const descendant_kinds: number[] = [];
			const children = bound_table(
				entry.children,
				name,
				'children',
				child_kinds
			);
			const descendants = bound_table(
				entry.descendants,
				name,
				'descendants',
				descendant_kinds
			);
			const parse = entry.parse ?? null;
			if (parse !== null && typeof parse !== 'function') {
				throw new TypeError(
					`the parse handler of directive "${name}" must be a function`
				);
			}
			// bound_table checked that children is an object
			const any_child = entry.children?.[ANY] ?? null;
			if (any_child !== null && typeof any_child !== 'function') {
				throw new TypeError(
					`the children.${ANY} handler of directive "${name}" must be a function`
				);
			}
			if (bound === null) bound = new Map();
			// a later table takes the name whole, as its component does
			if (
				children === null &&
				any_child === null &&
				descendants === null &&
				parse === null
			) {
				bound.delete(name);
				continue;
			}
			bound.set(name, {
				children,
				any_child,
				descendants,
				parse,
				child_kinds,
				descendant_kinds,
				plugin,
			});
		}
	}
	return bound !== null && bound.size !== 0 ? bound : null;
}

// by array, a caller with many documents passes the same one
const bound_registrations = new WeakMap<
	DirectiveTable[],
	BoundRegistration | null
>();

function bound_for(
	tables: DirectiveTable[] | undefined
): BoundRegistration | null {
	if (tables === undefined || tables.length === 0) return null;
	let bound = bound_registrations.get(tables);
	if (bound === undefined) {
		bound = register_bound(tables);
		bound_registrations.set(tables, bound);
	}
	return bound;
}

/** true when a table binds a handler, without one a parse needs no dispatcher for them */
export function has_directive_handlers(
	tables: DirectiveTable[] | undefined
): boolean {
	return bound_for(tables) !== null;
}

/** an open container directive with children or descendants handlers */
class Scope {
	directive: number;
	entry: BoundEntry;
	/** the proxy the handlers write through, made for the first that runs */
	state: Record<string, any> | null = null;
	/** runs of each handler by kind, children then descendants, made at the first run */
	counts: Int32Array | null = null;

	constructor(directive: number, entry: BoundEntry) {
		this.directive = directive;
		this.entry = entry;
	}
}

/**
 * context fields, symbol keyed so the keys a plugin puts on its context are
 * the only ones it finds there
 */
const HOST: unique symbol = Symbol('host');
const PLUGIN: unique symbol = Symbol('plugin');
const TASK: unique symbol = Symbol('task');

/** the context of one plugin for one document, the document half is read from the dispatcher */
class Context implements PluginContext {
	[HOST]: PluginDispatcher;
	/** the name of the plugin, undefined for one without */
	[PLUGIN]: string | undefined;
	[key: string]: any;

	constructor(host: PluginDispatcher, plugin: string | undefined) {
		this[HOST] = host;
		this[PLUGIN] = plugin;
	}

	get filename(): string | undefined {
		return this[HOST]._filename();
	}

	get frontmatter(): Record<string, unknown> | undefined {
		return this[HOST]._frontmatter();
	}

	get data(): Readonly<Record<string, Json>> {
		return this[HOST]._data(this[PLUGIN]);
	}

	set data(_value: unknown) {
		throw new TypeError(
			'ctx.data is read-only, write with ctx.set(key, value) or add to a list with ctx.add(key, value)'
		);
	}

	set(key: string, value: unknown): void {
		this[HOST]._write(this[PLUGIN], key, value, false);
	}

	add(key: string, value: unknown): void {
		this[HOST]._write(this[PLUGIN], key, value, true);
	}

	defer(
		node: NodeView,
		task: (node: NodeView, ctx: PublicTaskContext) => Promise<void> | void
	): void {
		this[HOST]._defer(this[PLUGIN], node, task);
	}

	warn(code: string, message: string, node?: NodeView): void {
		this[HOST]._warn(this[PLUGIN], code, message, node);
	}
}

/**
 * what a deferred task gets beside its node, writes are kept with the task
 * and applied once it settled and its node is committed
 */
class TaskContext {
	[HOST]: PluginDispatcher;
	[TASK]: Task;

	constructor(host: PluginDispatcher, task: Task) {
		this[HOST] = host;
		this[TASK] = task;
	}

	get filename(): string | undefined {
		return this[HOST]._filename();
	}

	get frontmatter(): Record<string, unknown> | undefined {
		return this[HOST]._frontmatter();
	}

	/** the data as it stands, what this task wrote is there once it applies */
	get data(): Readonly<Record<string, Json>> {
		return this[HOST]._data(this[TASK].plugin);
	}

	set data(_value: unknown) {
		throw new TypeError(
			'ctx.data is read-only, write with ctx.set(key, value) or add to a list with ctx.add(key, value)'
		);
	}

	set(key: string, value: unknown): void {
		this[HOST]._task_write(this[TASK], key, value, false);
	}

	add(key: string, value: unknown): void {
		this[HOST]._task_write(this[TASK], key, value, true);
	}

	warn(code: string, message: string, node?: unknown): void {
		this[HOST]._task_warn(this[TASK], code, message, node);
	}

	defer(): never {
		throw new TypeError(
			'ctx.defer: a deferred task defers nothing more, do the work in the task'
		);
	}
}

class BoundContext extends Context implements DirectiveContext {
	directive: NodeView;
	index: number;
	state: Record<string, any>;

	constructor(
		host: PluginDispatcher,
		plugin: string | undefined,
		directive: NodeView,
		index: number,
		state: Record<string, any>
	) {
		super(host, plugin);
		this.directive = directive;
		this.index = index;
		this.state = state;
	}
}

/** the registration of a dispatcher that only has bound handlers, never written */
const NO_REGISTRATION = register_plugins([]);

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

	/** a callback that fires ahead of the ones the node already has */
	add_first(idx: number, callback: () => void): void {
		const cbs = this.live === 0 ? undefined : this.store!.get(idx);
		if (cbs !== undefined) cbs.unshift(callback);
		else this.set(idx, [callback]);
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
	ctx: PluginContext[],
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
		case 36:
			return fused[36]!(view, ctx);
		case 37:
			return fused[37]!(view, ctx);
		default:
			return null;
	}
}

/** a write from no handler, such as one a task makes through the views of the handler that deferred it */
const NO_HANDLER = (what: string): string =>
	`${what} was called while no handler runs, a deferred task changes its node through the node and the ctx it is given, ctx.defer(node, async (node, ctx) => ...)`;

const STALE_TASK =
	'a deferred task was used after its document, the parse that made it has moved on';

/** shared undo log until a view or a kind rewrite needs one, never written */
const NO_UNDO = new UndoLog();

/** shared close callbacks until the first is set, never written */
const NO_CLOSE_CBS = new CloseCallbackStore();

/** redirect slots of a dispatcher with no live link, never written */
const NO_SLOTS: Uint32Array = new Uint32Array(0);

/**
 * zeroed slots the last dispatcher with a link gave back, the next first
 * link takes them, so a dispatcher made for one document allocates none
 */
let spare_slots = NO_SLOTS;

/** a larger array is not kept, it would hold its memory for good */
const SPARE_SLOTS_MAX = 65536;

/** kind masks dispatchers gave back, a typed array of this size is off the heap and slow to make */
const spare_masks: Int32Array[] = [];

function take_mask(): Int32Array {
	return spare_masks.pop() ?? new Int32Array(64);
}

/** shared until the first wrap_from, never written */
const NO_WRAPPERS: Set<number> = new Set();

/**
 * orchestrates plugin dispatch for both TreeBuilder and WireTreeBuilder.
 *
 * holds the handler tables, undo log, close callbacks, redirect links,
 * directive scopes and synthetic id counter. both builders compose this in.
 */
export class PluginDispatcher
	implements StructureHost, RedirectHost, DataHost, TaskHost
{
	private fused: HandlersTable;
	private has_handler: Uint32Array;
	private sequential: SequentialPass[];
	/** PAST_END for each kind with a fused handler, before any scope */
	private handled: Int32Array;
	/**
	 * PAST_END for each kind a handler may take now, handled with no scope
	 * open, else scope_wants
	 */
	private handles: Int32Array;

	/** handlers bound to directive names, null for none */
	private bound: BoundRegistration | null;
	/** open containers with bound handlers, outermost first */
	private scopes: Scope[] | null = null;
	/** the innermost of scopes, null with none open */
	private scope: Scope | null = null;
	/** handled and the kinds the open scopes take, rewritten in place as they change */
	private scope_wants: Int32Array | null = null;
	/**
	 * scope_wants before the any child handler of the innermost scope took
	 * every kind, null when that scope has none
	 */
	private narrow: Int32Array | null = null;
	/** traps of every state proxy, they log to the undo log of this dispatcher */
	private state_traps: ProxyHandler<Record<string | symbol, any>> | null = null;
	private undo: UndoLog = NO_UNDO;
	private close_cbs: CloseCallbackStore = NO_CLOSE_CBS;
	/** the name of each plugin by its place */
	private names: (string | undefined)[];
	/** the context of each plugin by its place, made for the first dispatch of a document */
	private contexts: PluginContext[] | null = null;
	/** what whoever runs the parse said about the document */
	private doc: PluginDocument | null = null;
	/** what handlers reported for the document, null until the first */
	private warned: PluginWarning[] | null = null;
	/** the data of each plugin name, made at its first read or write */
	private bags: Map<string, Bag> | null = null;
	/** what follows changes to the data, kept from one document to the next */
	private data_listeners: ((change: DataChange) => void)[] | null = null;
	/** the deferred tasks of the document that have not applied, in the order they started */
	private tasks: Task[] | null = null;
	/** tasks whose node may still be revoked, a close or a commit of such a node goes through dispatch */
	private uncommitted = 0;
	/** tasks made for this dispatcher, ties of one node apply in this order */
	private task_seq = 0;
	/** the buffer the tasks of the document read */
	private task_buf: NodeBuffer | null = null;
	/** what is called when a task settles, kept from one document to the next */
	private task_listeners: (() => void)[] | null = null;

	/**
	 * false when nothing can wait for async work, ctx.defer then throws a
	 * PluginAsyncError that ends with async_hint
	 */
	allow_async = true;
	/** how to run a parse that waits, for the PluginAsyncError of a host that does not */
	async_hint = '';
	private text_source: TextSource;

	/**
	 * by buffer index, the wrapper among the children of a node that takes its
	 * later children, 0 for none as the root is never a wrapper, a wrapper can
	 * hold a link too, so a lookup follows them to the innermost wrapper
	 */
	private slots: Uint32Array = NO_SLOTS;
	/** slots set, at zero no lookup reads the array and the builders skip the dispatcher */
	private links = 0;
	/** above every link, 0 with none, it only rises while one exists so it can sit above the highest left */
	private floor = 0;

	/** wrap_from wrappers that still take siblings, they get an end when they stop */
	private open_from: Set<number> = NO_WRAPPERS;

	/** a closed wrap_from wrapper whose last child was still open, keyed by that child */
	private close_with: Map<number, number> | null = null;

	/** the node whose handler or close callback is running */
	private running = NONE;

	/** the callbacks of a close that is final are running, their node is settled */
	private final_close = false;

	/** close callbacks are running, not open handlers */
	private closing = false;

	/**
	 * a node whose open handlers wait for what the parser sends next, a
	 * directive for its name, a code fence for its info string
	 */
	private held = NONE;

	/** the tree is complete, a wrapper has no later children to take */
	private sequential_pass = false;

	private next_synthetic_id = SYNTHETIC_ID_BASE;

	/** one cache serves every dispatch, a view only holds an index */
	private cache: ViewCache | null = null;

	/** open_wants while a link exists, handles with the floor in every other kind */
	private own_wants: Int32Array | null = null;
	/** the floor own_wants was written for, -1 once the handled kinds changed */
	private wants_floor = -1;

	/** true when a directive name may have handlers, builders then report each name */
	readonly binds: boolean;

	constructor(
		plugins: ParsePlugin[] | undefined,
		text_source: TextSource,
		directive_handlers?: DirectiveTable[]
	) {
		// bound handlers alone leave the cached registration to the next plugins
		const reg =
			plugins === undefined || plugins.length === 0
				? NO_REGISTRATION
				: registration_for(plugins);
		this.fused = reg.fused;
		this.has_handler = reg.has_handler;
		this.sequential = reg.sequential;
		this.names = reg.names;
		this.text_source = text_source;
		this.handled = this.handles = reg.open_wants;
		this.bound = bound_for(directive_handlers);
		this.binds = this.bound !== null;
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

	/** a context for each plugin, new for each document */
	private make_contexts(): PluginContext[] {
		const names = this.names;
		const contexts: PluginContext[] = [];
		for (let i = 0; i < names.length; i++) {
			contexts.push(new Context(this, names[i]));
		}
		return (this.contexts = contexts);
	}

	/**
	 * what the handlers learn about the document through their context, set
	 * before its parse and forgotten at the next reset
	 */
	set_document(doc: PluginDocument | undefined): void {
		this.doc = doc ?? null;
	}

	/** what handlers reported for the document, in the order they did, undefined for none */
	get warnings(): PluginWarning[] | undefined {
		const warned = this.warned;
		return warned === null || warned.length === 0 ? undefined : warned;
	}

	/**
	 * what plugins wrote with ctx.set and ctx.add for the document, by plugin
	 * name, a plugin that left nothing has no key, undefined when none left any
	 */
	data(): PluginData | undefined {
		const bags = this.bags;
		if (bags === null) return undefined;
		let out: PluginData | undefined;
		for (const [name, bag] of bags) {
			// a write that was taken back leaves nothing
			if (bag.empty) continue;
			if (out === undefined) out = {};
			out[name] = bag.out();
		}
		return out;
	}

	/**
	 * calls the listener for each change to the data of a plugin, a write or a
	 * revoke that took one back, with the value of the key after it, returns
	 * a function that stops it, a listener stays from one document to the next
	 */
	on_data(listener: (change: DataChange) => void): () => void {
		let listeners = this.data_listeners;
		if (listeners === null) listeners = this.data_listeners = [];
		listeners.push(listener);
		return () => {
			const all = this.data_listeners;
			if (all === null) return;
			const at = all.indexOf(listener);
			if (at !== -1) all.splice(at, 1);
			if (all.length === 0) this.data_listeners = null;
		};
	}

	/** @internal */
	_filename(): string | undefined {
		const doc = this.doc;
		return doc === null ? undefined : doc.filename;
	}

	/** @internal */
	_frontmatter(): Record<string, unknown> | undefined {
		const doc = this.doc;
		if (doc === null) return undefined;
		const read = doc.frontmatter;
		return read === undefined ? undefined : read();
	}

	/** true while the document has deferred tasks that have not applied */
	get deferred(): boolean {
		return this.tasks !== null;
	}

	/**
	 * calls the listener each time a deferred task settles, so a host that
	 * streams knows to call apply_ready, returns a function that stops it, a
	 * listener stays from one document to the next
	 */
	on_settled(listener: () => void): () => void {
		let listeners = this.task_listeners;
		if (listeners === null) listeners = this.task_listeners = [];
		listeners.push(listener);
		return () => {
			const all = this.task_listeners;
			if (all === null) return;
			const at = all.indexOf(listener);
			if (at !== -1) all.splice(at, 1);
			if (all.length === 0) this.task_listeners = null;
		};
	}

	/**
	 * waits for every deferred task of the document, then applies those whose
	 * node is committed, in document order, undefined when there are none, a
	 * task that rejected rejects it with a PluginTaskError and nothing applies,
	 * call it after the parse and the sequential passes
	 */
	settle(): Promise<void> | undefined {
		const tasks = this.tasks;
		if (tasks === null) return undefined;
		return this.settle_all(tasks);
	}

	private async settle_all(tasks: Task[]): Promise<void> {
		const waits: Promise<void>[] = [];
		for (let i = 0; i < tasks.length; i++) waits.push(tasks[i].done);
		await Promise.all(waits);
		const ready = this.ready(tasks, false);
		if (ready === null) return;
		for (let i = 0; i < ready.length; i++) {
			const task = ready[i];
			if (task.state === TaskState.Failed) throw this.task_error(task);
		}
		for (let i = 0; i < ready.length; i++) this.apply(ready[i]);
		this.prune();
	}

	/**
	 * applies each deferred task that settled and whose node is committed, in
	 * document order, for a host that streams, a task that rejected becomes a
	 * task_failed warning and leaves its node as it was, returns the nodes
	 * whose tasks applied, null for none
	 */
	apply_ready(): number[] | null {
		const tasks = this.tasks;
		if (tasks === null) return null;
		const ready = this.ready(tasks, true);
		if (ready === null) return null;
		const nodes: number[] = [];
		for (let i = 0; i < ready.length; i++) {
			const task = ready[i];
			if (task.state === TaskState.Failed) {
				task.applied = true;
				this.running = task.node;
				try {
					this._warn(
						task.plugin,
						'task_failed',
						this.task_error(task).message,
						this.views(this.task_buf!).get(task.node)!
					);
				} finally {
					this.running = NONE;
				}
			} else {
				this.apply(task);
				nodes.push(task.node);
			}
		}
		this.prune();
		return nodes.length === 0 ? null : nodes;
	}

	/** tasks that can apply, in document order, settled only, or every one when all are */
	private ready(tasks: Task[], settled: boolean): Task[] | null {
		let ready: Task[] | null = null;
		for (let i = 0; i < tasks.length; i++) {
			const task = tasks[i];
			if (task.dropped || task.applied || !task.committed) continue;
			if (settled && task.state === TaskState.Running) continue;
			if (ready === null) ready = [];
			ready.push(task);
		}
		if (ready !== null) ready.sort((a, b) => a.node - b.node || a.seq - b.seq);
		return ready;
	}

	/** forgets tasks that applied or were dropped */
	private prune(): void {
		const tasks = this.tasks;
		if (tasks === null) return;
		const left = tasks.filter((t) => !t.applied && !t.dropped);
		this.tasks = left.length === 0 ? null : left;
	}

	private task_error(task: Task): PluginTaskError {
		const buf = this.task_buf!;
		return new PluginTaskError(
			task.plugin,
			kind_to_string(buf.kind_at(task.node)),
			this.views(buf).get(task.node)!.position,
			task.error
		);
	}

	/** what a task kept goes into the tree, its node is final, so nothing is recorded */
	private apply(task: Task): void {
		task.applied = true;
		const buf = this.task_buf!;
		// a later handler may have taken the node out
		if (!within(buf, task.node, 0)) return;
		const cache = this.views(buf);
		const drafts: NodeView[] = [];
		const ops = task.ops;
		this.running = task.node;
		this.closing = true;
		this.final_close = true;
		try {
			for (let i = 0; i < ops.length; i++) {
				const op = ops[i];
				if (op.kind === OpKind.Data) {
					this.write_copy(this.bag(task.plugin), op.key, op.value, op.list);
					continue;
				}
				const ref = op.ref;
				let view: NodeView | undefined;
				if (ref === NONE) view = undefined;
				else if (ref < 0) view = drafts[~ref];
				// what a revoke or a removal took out since is left alone
				else if (within(buf, ref, task.node)) view = cache.get(ref)!;
				if (op.kind === OpKind.Warn) {
					this._warn(task.plugin, op.code, op.message, view);
					continue;
				}
				if (view === undefined) continue;
				switch (op.kind) {
					case OpKind.Attr:
						view.attrs[op.key] = op.value;
						break;
					case OpKind.Unset:
						delete view.attrs[op.key];
						break;
					case OpKind.Type:
						view.type = op.type;
						break;
					case OpKind.Append:
						drafts[~op.made] = view.append(op.type, op.given as any);
						break;
					case OpKind.Prepend:
						drafts[~op.made] = view.prepend(op.type, op.given as any);
						break;
					case OpKind.WrapInner:
						drafts[~op.made] = view.wrap_inner(
							op.type,
							op.given as Record<string, any> | undefined
						);
						break;
					case OpKind.Remove:
						view.remove();
						break;
				}
			}
		} finally {
			this.running = NONE;
			this.closing = false;
			this.final_close = false;
			cache.clear();
		}
	}

	/** @internal the buffer of the document a task reads */
	buffer(task: Task): NodeBuffer {
		const buf = this.task_buf;
		if (task.dropped || buf === null) throw new Error(STALE_TASK);
		return buf;
	}

	/** @internal the view of a node for a task to read */
	real(task: Task, index: number): NodeView {
		return this.views(this.buffer(task)).get(index)!;
	}

	/** @internal ctx.defer, the task starts at once and its changes wait */
	_defer(
		plugin: string | undefined,
		node: NodeView,
		run: (node: NodeView, ctx: PublicTaskContext) => unknown
	): void {
		if (typeof run !== 'function') {
			throw new TypeError('ctx.defer takes the node and the task, a function');
		}
		const running = this.running;
		if (
			running === NONE ||
			!(node instanceof NodeView) ||
			node._index !== running
		) {
			throw new TypeError(
				'ctx.defer takes the node whose handler or close callback is running'
			);
		}
		if (!this.allow_async) {
			throw new PluginAsyncError(
				plugin,
				'defer',
				this.position(running),
				this.async_hint
			);
		}
		this.task_buf = node._live();
		const task = new Task(running, plugin, this.task_seq++, this);
		// final at once in a sequential pass and in the callbacks of a final close
		if (this.sequential_pass || this.final_close) task.committed = true;
		else this.uncommitted++;
		let tasks = this.tasks;
		if (tasks === null) tasks = this.tasks = [];
		tasks.push(task);
		let result: unknown;
		try {
			// the view of a task reads as a node view does and keeps its writes
			result = run(
				task.view(running)! as unknown as NodeView,
				new TaskContext(this, task) as unknown as PublicTaskContext
			);
		} catch (e) {
			result = Promise.reject(e);
		}
		task.done = Promise.resolve(result).then(
			() => {
				task.state = TaskState.Done;
				this.task_settled(task);
			},
			(e: unknown) => {
				task.state = TaskState.Failed;
				task.error = e;
				this.task_settled(task);
			}
		);
	}

	private task_settled(task: Task): void {
		const listeners = this.task_listeners;
		if (listeners === null || task.dropped) return;
		const all = listeners.slice();
		for (let i = 0; i < all.length; i++) all[i]();
	}

	/** the tasks of a node it closed for good or the parser committed */
	private commit_tasks(node: number): void {
		const tasks = this.tasks!;
		for (let i = 0; i < tasks.length; i++) {
			const task = tasks[i];
			if (task.node === node && !task.committed && !task.dropped) {
				task.committed = true;
				this.uncommitted--;
			}
		}
	}

	/** the tasks of a revoked node go, what they kept with them, errors too */
	private drop_tasks(node: number): void {
		const tasks = this.tasks!;
		let left = false;
		for (let i = 0; i < tasks.length; i++) {
			const task = tasks[i];
			if (task.node === node && !task.dropped && !task.applied) {
				task.dropped = true;
				if (!task.committed) this.uncommitted--;
			}
			if (!task.dropped && !task.applied) left = true;
		}
		if (!left) this.tasks = null;
	}

	/** @internal ctx.set and ctx.add of a task, checked now and written when it applies */
	_task_write(task: Task, key: string, value: unknown, list: boolean): void {
		const plugin = task.plugin;
		if (plugin === undefined) {
			throw new Error(
				'ctx.data is kept by plugin name, give the plugin a name to use it'
			);
		}
		if (typeof key !== 'string' || key === '') {
			throw new TypeError(
				`ctx.${list ? 'add' : 'set'} takes a key, a string that is not empty, and a value`
			);
		}
		if (task.dropped) return;
		const copy = json_copy(value, plugin, key, () => this.position(task.node));
		// the kind of the key is checked when it applies, as another owner may write it first
		task.record({ kind: OpKind.Data, key, value: copy, list });
	}

	/** @internal ctx.warn of a task, reported when it applies */
	_task_warn(task: Task, code: string, message: string, node: unknown): void {
		if (
			typeof code !== 'string' ||
			code === '' ||
			typeof message !== 'string'
		) {
			throw new TypeError(
				'ctx.warn takes a code and a message, both strings, and a node to point at'
			);
		}
		let ref = NONE;
		if (node instanceof TaskView && node._task === task) ref = node._index;
		else if (node instanceof DraftView && node._task === task) ref = ~node._id;
		else if (node != null) {
			throw new TypeError(
				'ctx.warn in a deferred task points at a node the task reads through, the node it is given or one reached from it'
			);
		}
		task.record({ kind: OpKind.Warn, code, message, ref });
	}

	/** the data of a plugin name, made when first read or written */
	private bag(plugin: string | undefined): Bag {
		if (plugin === undefined) {
			throw new Error(
				'ctx.data is kept by plugin name, give the plugin a name to use it'
			);
		}
		let bags = this.bags;
		if (bags === null) bags = this.bags = new Map();
		let bag = bags.get(plugin);
		if (bag === undefined) {
			bag = new Bag(plugin);
			bags.set(plugin, bag);
		}
		return bag;
	}

	/** @internal a read-only view of the data of a plugin name */
	_data(plugin: string | undefined): Readonly<Record<string, Json>> {
		return this.bag(plugin).read();
	}

	/**
	 * @internal a ctx.set or a ctx.add, owned by the node whose handler or
	 * close callback is running, by no node in a sequential pass
	 */
	_write(
		plugin: string | undefined,
		key: string,
		value: unknown,
		list: boolean
	): void {
		const bag = this.bag(plugin);
		if (typeof key !== 'string' || key === '') {
			throw new TypeError(
				`ctx.${list ? 'add' : 'set'} takes a key, a string that is not empty, and a value`
			);
		}
		const running = this.running;
		if (running === NONE && !this.sequential_pass) {
			throw new TypeError(NO_HANDLER('ctx.' + (list ? 'add' : 'set')));
		}
		const copy = json_copy(value, bag.name, key, () => this.position(running));
		this.write_copy(bag, key, copy, list);
	}

	/** a write that was checked, owned by the node whose handler runs */
	private write_copy(bag: Bag, key: string, copy: Json, list: boolean): void {
		const running = this.running;
		const owner = running === NONE || this.sequential_pass ? NO_OWNER : running;
		bag.write(key, owner, copy, list);
		// a node that is final records nothing, it commits once its handlers ran
		if (owner !== NO_OWNER && this.undo.recording) {
			this.undo.record_data(this, bag, key, owner);
		}
		if (this.data_listeners !== null) this.data_changed(bag, key);
	}

	/** @internal a view changes the tree only while a handler runs */
	check_write(what: string): void {
		if (this.running === NONE && !this.sequential_pass) {
			throw new TypeError(NO_HANDLER(what));
		}
	}

	/** @internal a revoke takes back what a node wrote under a key */
	revoke_data(bag: object, key: string, owner: number): void {
		const own = bag as Bag;
		if (own.revoke(key, owner) && this.data_listeners !== null) {
			this.data_changed(own, key);
		}
	}

	private data_changed(bag: Bag, key: string): void {
		const change: DataChange = { plugin: bag.name, key, value: bag.get(key) };
		// a listener that stops itself leaves the others to run
		const listeners = this.data_listeners!.slice();
		for (let i = 0; i < listeners.length; i++) listeners[i](change);
	}

	/** where the node whose handler runs is, for an error */
	private position(node: number): Position | undefined {
		const cache = this.cache;
		if (node === NONE || cache === null) return undefined;
		return cache.get(node)?.position;
	}

	/** @internal */
	_warn(
		plugin: string | undefined,
		code: string,
		message: string,
		node: NodeView | undefined
	): void {
		if (
			typeof code !== 'string' ||
			code === '' ||
			typeof message !== 'string'
		) {
			throw new TypeError(
				'ctx.warn takes a code and a message, both strings, and a node to point at'
			);
		}
		if (this.running === NONE && !this.sequential_pass) {
			throw new TypeError(NO_HANDLER('ctx.warn'));
		}
		let start: number | undefined;
		let end: number | undefined;
		if (node != null) {
			const span = node._span();
			if (span[0] !== NONE) start = span[0];
			if (span[1] !== NONE) end = span[1];
		}
		const warning: PluginWarning = { plugin, code, message, start, end };
		let warned = this.warned;
		if (warned === null) warned = this.warned = [];
		warned.push(warning);
		// it goes with the node whose handler reported it
		this.undo.record_warn(warned, warning);
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

	/**
	 * by kind, the lowest parent whose new child needs no dispatcher, PAST_END
	 * for a kind a handler may take, else the floor, builders reread it after
	 * each dispatch and it is only brought up to date then
	 */
	get open_wants(): Int32Array {
		// kept small to inline, builders read this after every dispatch
		return this.floor === 0 && this.own_wants === null
			? this.handles
			: this.linked_wants();
	}

	private linked_wants(): Int32Array {
		const handles = this.handles;
		const floor = this.floor;
		let wants = this.own_wants;
		if (floor === 0) {
			spare_masks.push(wants!);
			this.own_wants = null;
			return handles;
		}
		if (wants === null) {
			wants = this.own_wants = take_mask();
			this.wants_floor = -1;
		}
		if (this.wants_floor !== floor) {
			for (let k = 0; k < NODE_KIND_COUNT; k++) wants[k] = handles[k] | floor;
			this.wants_floor = floor;
		}
		return wants;
	}

	/** a close needs no dispatch */
	quiet(): boolean {
		return (
			this.held === NONE &&
			this.close_cbs.live === 0 &&
			this.links === 0 &&
			this.undo.empty &&
			this.close_with === null &&
			this.scope === null &&
			this.uncommitted === 0
		);
	}

	/**
	 * closes of nodes from this index on have nothing to dispatch, a close
	 * callback or a wrapper that waits on a child can sit anywhere
	 */
	plain_from(): number {
		if (
			this.close_cbs.live !== 0 ||
			this.close_with !== null ||
			this.held !== NONE ||
			this.uncommitted !== 0
		)
			return PAST_END;
		let from = this.floor;
		const scope = this.scope;
		// scopes nest, so the innermost has the highest directive
		if (scope !== null && scope.directive >= from) from = scope.directive + 1;
		const undo = this.undo;
		if (!undo.empty && undo.top > from) from = undo.top;
		return from;
	}

	/**
	 * the close of this node has nothing to dispatch, no callback, no wrapper
	 * below it, no wrapper waiting on it, no scope and no undo log of its own
	 */
	plain_close(buf_idx: number): boolean {
		const scope = this.scope;
		return (
			this.held === NONE &&
			this.close_cbs.live === 0 &&
			(this.links === 0 || this.slot(buf_idx) === 0) &&
			this.close_with === null &&
			(scope === null || scope.directive !== buf_idx) &&
			(this.undo.empty || !this.undo.has(buf_idx)) &&
			this.uncommitted === 0
		);
	}

	/**
	 * a fused handler exists for this kind, or an open scope may hold one, such
	 * a node opens under its source parent and goes through dispatch_open
	 */
	has_handlers(kind: NodeKind): boolean {
		return this.handles[kind] !== 0;
	}

	/** where a new child of this node goes, the node itself or the innermost open wrapper under it */
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
		if (this.links === 0) {
			slots = this.slots = spare_slots;
			spare_slots = NO_SLOTS;
		}
		if (from >= slots.length) {
			let size = slots.length === 0 ? 1024 : slots.length;
			while (size <= from) size <<= 1;
			const grown = new Uint32Array(size);
			grown.set(slots);
			slots = this.slots = grown;
		}
		if (slots[from] === 0) this.links++;
		slots[from] = to;
		if (from >= this.floor) this.floor = from + 1;
	}

	private clear_link(from: number): void {
		const slots = this.slots;
		if (from >= slots.length || slots[from] === 0) return;
		slots[from] = 0;
		if (--this.links === 0) this.release_slots();
	}

	/** every slot is zero, opens of unhandled kinds skip the dispatcher again */
	private release_slots(): void {
		const slots = this.slots;
		if (slots.length > spare_slots.length && slots.length <= SPARE_SLOTS_MAX) {
			spare_slots = slots;
		}
		this.slots = NO_SLOTS;
		this.floor = 0;
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

	/**
	 * the parser may still revoke the node, a close it did not give up on
	 * settles a node before its flag is cleared, and a finished tree has none
	 */
	pending(buf: NodeBuffer, node: number): boolean {
		if (this.sequential_pass || buf.pending_at(node) === 0) return false;
		return !(this.final_close && node === this.running);
	}

	/**
	 * nothing undoes a removal, so it waits until no revoke can ask for the
	 * node back, the node whose callbacks run closed for good or the tree is
	 * complete, and it stays inside that node, what came before it may have
	 * gone downstream
	 */
	remove(buf: NodeBuffer, node: number): void {
		const kind = kind_to_string(buf.kind_at(node));
		if (buf.kind_at(node) === NodeKind.root) {
			throw new Error('remove: the root can not be removed');
		}
		const parent = buf.parent_at(node);
		if (parent === NONE) return;
		const running = this.running;
		if (running === NONE) {
			throw new Error(
				`remove: the ${kind} node can only be removed while a handler runs`
			);
		}
		const by = kind_to_string(buf.kind_at(running));
		if (!this.sequential_pass && !this.final_close) {
			throw new Error(
				this.closing
					? `remove was called from the close callback of a pending ${by} node, ` +
							`which may still be revoked, check node.pending first`
					: `remove was called from the open handler of a ${by} node, the parser ` +
							`has more to send, call it from the close callback or a sequential pass`
			);
		}
		let at = node;
		while (at !== running) {
			at = buf.parent_at(at);
			if (at === NONE) {
				throw new Error(
					`remove: the ${kind} node is not inside the ${by} node whose ` +
						`handler is running, a handler removes its own node or one inside it`
				);
			}
		}
		// an open wrapper stops taking the later children of its parent
		if (this.links !== 0 && this.slot(parent) === node) {
			this.drop_chain(buf, parent);
		}
		unlink_child(buf, parent, node);
	}

	/** wrap_from and close move nodes when undone, a pending node is revoked often */
	private refuse_pending(buf: NodeBuffer, method: string): void {
		const running = this.running;
		if (running !== NONE && this.pending(buf, running)) {
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

		// placed where a new child of the parent would go, which nests it in an open wrapper
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
		this.undo.record_close_wrapper(this.drop_chain(buf, parent)!);
	}

	/**
	 * remove every link from this node down, ending the wrap_from wrappers
	 * among them, returns the links as UndoEntryCloseWrapper holds them
	 */
	private drop_chain(buf: NodeBuffer, from: number): number[] | null {
		const open_from = this.open_from;
		let key = from;
		let wrapper = this.slot(key);
		// only wrap_inner wrappers below, which have no end to set
		if (open_from.size === 0) {
			while (wrapper !== 0) {
				this.clear_link(key);
				key = wrapper;
				wrapper = this.slot(key);
			}
			return null;
		}
		const links: number[] = [];
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
	 * the end is the start, a renderer caches a top level block once it has an
	 * end, the wrappers waiting on this one close with it
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
	 * true when the name of a directive starts something, the handlers bound
	 * to it or the open handlers that waited for it
	 */
	wants_name(): boolean {
		return this.binds || this.held !== NONE;
	}

	/**
	 * dispatch fused plugin handlers on node open, those of a directive wait
	 * for its name and those of a code fence for its info string, which the
	 * parser sends before anything else of the node
	 */
	dispatch_open(buf_idx: number, kind: NodeKind, buf: NodeBuffer): void {
		if (this.held !== NONE) this.unhold(buf);
		// only the any child handler asked for this kind, and the node is no
		// child of its directive, so it is placed as a node no handler takes
		const narrow = this.narrow;
		if (
			narrow !== null &&
			narrow[kind] === 0 &&
			buf.parent_at(buf_idx) !== this.scope!.directive
		) {
			this.adopt(buf_idx, buf);
			return;
		}
		if (
			kind === NodeKind.directive_container ||
			kind === NodeKind.directive_leaf ||
			kind === NodeKind.directive_inline ||
			kind === NodeKind.code_fence
		) {
			this.held = buf_idx;
			return;
		}
		this.run_open(buf_idx, kind, buf);
	}

	/** true while the open handlers of this node wait */
	holds(buf_idx: number): boolean {
		return this.held === buf_idx;
	}

	/** true while the open handlers of any node wait */
	get holding(): boolean {
		return this.held !== NONE;
	}

	/**
	 * what the held node waited for arrived, or something else did, a
	 * directive sent no name and a fence sent no info string run their open
	 * handlers without one
	 */
	unhold(buf: NodeBuffer): void {
		const held = this.held;
		this.held = NONE;
		this.run_open(held, buf.kind_at(held), buf);
	}

	/** runs handlers, stores close callbacks */
	private run_open(buf_idx: number, kind: NodeKind, buf: NodeBuffer): void {
		const cache = this.views(buf);
		const view = cache.get(buf_idx)!;

		// the builder pushed the node under its source parent, so the handlers
		// see that parent and can close a wrapper before opening the next
		const undo = this.undo;
		undo.set_active_node(buf_idx);
		this.running = buf_idx;
		// bound handlers first, a global handler sees the wrapper one made
		let callbacks =
			this.scope === null ? null : this.run_bound(kind, view, buf_idx, buf);
		const global = dispatch_open(
			kind,
			view,
			this.contexts ?? this.make_contexts(),
			this.fused,
			this.has_handler
		);
		if (global !== null) {
			callbacks = callbacks === null ? global : callbacks.concat(global);
		}
		undo.clear_active_node();
		this.running = NONE;

		this.adopt(buf_idx, buf);

		if (callbacks) {
			let close_cbs = this.close_cbs;
			if (close_cbs === NO_CLOSE_CBS)
				close_cbs = this.close_cbs = new CloseCallbackStore();
			close_cbs.set(buf_idx, callbacks);
		}

		cache.clear();
	}

	/**
	 * the node goes where a new child of its parent goes now, a handler that
	 * wrapped it left it under a wrapper with no link below
	 */
	private adopt(buf_idx: number, buf: NodeBuffer): void {
		if (this.links === 0) return;
		const parent = buf.parent_at(buf_idx);
		if (parent === NONE) return;
		const target = this.resolve(parent);
		if (target !== parent) buf.move_to_end(buf_idx, target);
	}

	/**
	 * the handlers the open scopes hold for a node, innermost scope first, its
	 * children handler when the node was written directly inside it, then the
	 * descendants handlers of every scope outwards
	 */
	private run_bound(
		kind: NodeKind,
		view: NodeView,
		buf_idx: number,
		buf: NodeBuffer
	): (() => void)[] | null {
		const scopes = this.scopes!;
		// read before a handler wraps the node, a new node always opens inside
		// the innermost open container, so no outer scope can be its parent
		const parent = buf.parent_at(buf_idx);
		let callbacks: (() => void)[] | null = null;
		for (let i = scopes.length - 1; i >= 0; i--) {
			const scope = scopes[i];
			const entry = scope.entry;
			if (parent === scope.directive) {
				if (entry.children !== null) {
					const handler = entry.children[kind];
					if (handler != null) {
						callbacks = this.call_bound(handler, view, scope, kind, callbacks);
					}
				}
				const any = entry.any_child;
				// a line break is the blank between two children, not one of them
				if (any !== null && kind !== NodeKind.line_break) {
					callbacks = this.call_bound(any, view, scope, ANY_SLOT, callbacks);
				}
			}
			if (entry.descendants !== null) {
				const handler = entry.descendants[kind];
				if (handler != null) {
					callbacks = this.call_bound(
						handler,
						view,
						scope,
						NODE_KIND_COUNT + kind,
						callbacks
					);
				}
			}
		}
		return callbacks;
	}

	private call_bound(
		handler: DirectiveHandler,
		view: NodeView,
		scope: Scope,
		slot: number,
		callbacks: (() => void)[] | null
	): (() => void)[] | null {
		let counts = scope.counts;
		if (counts === null) {
			counts = scope.counts = new Int32Array(NODE_KIND_COUNT * 2 + 1);
		}
		const index = counts[slot]++;
		// the index goes back with the node, as the state it wrote does
		this.undo.record_count(counts, slot);
		const callback = handler(
			view,
			new BoundContext(
				this,
				scope.entry.plugin,
				this.cache!.get(scope.directive)!,
				index,
				scope.state ?? (scope.state = this.make_state())
			)
		);
		if (callback) {
			if (callbacks === null) callbacks = [callback];
			else callbacks.push(callback);
		}
		return callbacks;
	}

	/** a state object behind a proxy that logs each write */
	private make_state(): Record<string, any> {
		return new Proxy({}, this.traps());
	}

	/** the traps of a state proxy, the undo log must be its own by now */
	private traps(): ProxyHandler<Record<string | symbol, any>> {
		let traps = this.state_traps;
		if (traps === null) {
			const undo = this.undo;
			traps = this.state_traps = {
				set(state, key, value) {
					undo.record_state(
						state,
						key,
						key in state ? state[key] : ATTR_DID_NOT_EXIST
					);
					state[key] = value;
					return true;
				},
				deleteProperty(state, key) {
					if (key in state) {
						undo.record_state(state, key, state[key]);
						delete state[key];
					}
					return true;
				},
			};
		}
		return traps;
	}

	/**
	 * the name of a directive arrived, its open handlers run now and read it, a
	 * container with children or descendants handlers then opens a scope and
	 * the parse handler of the name runs for any directive
	 */
	dispatch_name(buf_idx: number, name: unknown, buf: NodeBuffer): void {
		const held = this.held;
		if (held !== NONE) {
			this.held = NONE;
			this.run_open(held, buf.kind_at(held), buf);
		}
		const bound = this.bound;
		if (bound === null || typeof name !== 'string') return;
		const entry = bound.get(name);
		if (entry === undefined) return;
		const kind = buf.kind_at(buf_idx);
		let scope: Scope | null = null;
		if (kind === NodeKind.directive_container) {
			if (
				entry.children !== null ||
				entry.any_child !== null ||
				entry.descendants !== null
			) {
				scope = new Scope(buf_idx, entry);
				let scopes = this.scopes;
				if (scopes === null) scopes = this.scopes = [];
				scopes.push(scope);
				this.scopes_changed();
			}
		} else if (
			// the label of a leaf or inline directive gets no bound handlers
			kind !== NodeKind.directive_leaf &&
			kind !== NodeKind.directive_inline
		) {
			return;
		}
		const parse = entry.parse;
		if (parse === null) return;

		const cache = this.views(buf);
		const view = cache.get(buf_idx)!;
		const undo = this.undo;
		// a scope shares its state with its children and descendants handlers
		let state: Record<string, any>;
		if (scope === null) state = this.make_state();
		else state = scope.state = this.make_state();
		undo.set_active_node(buf_idx);
		this.running = buf_idx;
		const callback = parse(
			view,
			new BoundContext(this, entry.plugin, view, 0, state)
		);
		undo.clear_active_node();
		this.running = NONE;

		this.adopt(buf_idx, buf);

		if (callback) {
			let close_cbs = this.close_cbs;
			if (close_cbs === NO_CLOSE_CBS)
				close_cbs = this.close_cbs = new CloseCallbackStore();
			// ahead of the callbacks the open handlers left, bound runs first
			close_cbs.add_first(buf_idx, callback);
		}

		cache.clear();
	}

	/** a scope opened or ended, the kinds an open needs the dispatcher for follow */
	private scopes_changed(): void {
		const scopes = this.scopes!;
		const depth = scopes.length;
		if (depth === 0) {
			this.scope = null;
			this.handles = this.handled;
			// a batch builder still holds it, and rereads before its next open
			spare_masks.push(this.scope_wants!);
			this.scope_wants = null;
			this.drop_narrow();
		} else {
			const top = (this.scope = scopes[depth - 1]);
			let wants = this.scope_wants;
			if (wants === null) wants = this.scope_wants = take_mask();
			wants.set(this.handled);
			for (let i = 0; i < depth; i++) {
				const kinds = scopes[i].entry.descendant_kinds;
				for (let k = 0; k < kinds.length; k++) wants[kinds[k]] = PAST_END;
			}
			// only the innermost scope can have a new child
			const kinds = top.entry.child_kinds;
			for (let k = 0; k < kinds.length; k++) wants[kinds[k]] = PAST_END;
			if (top.entry.any_child === null) this.drop_narrow();
			else {
				// its child can be of any kind, dispatch_open lets the rest through
				let narrow = this.narrow;
				if (narrow === null) narrow = this.narrow = take_mask();
				narrow.set(wants);
				for (let k = 0; k < NODE_KIND_COUNT; k++) {
					// neither builder dispatches text, and see run_bound for a line break
					if (
						k !== NodeKind.root &&
						k !== NodeKind.text &&
						k !== NodeKind.line_break
					)
						wants[k] = PAST_END;
				}
			}
			this.handles = wants;
		}
		this.wants_floor = -1;
	}

	private drop_narrow(): void {
		const narrow = this.narrow;
		if (narrow === null) return;
		spare_masks.push(narrow);
		this.narrow = null;
	}

	/** the scope of a revoked directive ends, wherever it sits */
	private end_scope(directive: number): void {
		const scopes = this.scopes!;
		for (let i = scopes.length - 1; i >= 0; i--) {
			if (scopes[i].directive === directive) {
				scopes.splice(i, 1);
				this.scopes_changed();
				return;
			}
		}
	}

	/**
	 * dispatch close callbacks for a node.
	 * fires callbacks with undo attribution.
	 * a close is final and commits the undo log, but for a pending node the
	 * builder says to hold, a delimiter the parser gave up on, whose revoke
	 * follows, or a paragraph, which a commit or a revoke settles later
	 */
	dispatch_close(buf_idx: number, buf: NodeBuffer, hold = false): void {
		if (this.held !== NONE) this.unhold(buf);
		// take and fire close callbacks with undo attribution
		const cbs = this.close_cbs.take(buf_idx);
		// callbacks cannot change the pending flag
		const pending = hold && buf.pending_at(buf_idx) !== 0;
		if (cbs) {
			const undo = this.undo;
			// a final node commits right after its callbacks, so anything they
			// recorded would be dropped unread
			if (pending) undo.set_active_node(buf_idx);
			this.running = buf_idx;
			this.closing = true;
			this.final_close = !pending;
			for (let i = 0; i < cbs.length; i++) {
				cbs[i]();
			}
			undo.clear_active_node();
			this.running = NONE;
			this.closing = false;
			this.final_close = false;
		}

		// after the callbacks, which may still wrap, no child comes after the
		// close so every wrapper below closes with the node
		if (this.links !== 0 && this.slot(buf_idx) !== 0) {
			this.drop_chain(buf, buf_idx);
		}
		if (this.close_with !== null) this.release(buf, buf_idx, false);
		// after the callbacks, which read the state of the scope, containers
		// close innermost first, so only the innermost scope can end here
		const scope = this.scope;
		if (scope !== null && scope.directive === buf_idx) {
			this.scopes!.pop();
			this.scopes_changed();
		}

		// a held node can still be revoked after its close
		if (!pending) {
			this.undo.commit(buf_idx);
			if (this.uncommitted !== 0) this.commit_tasks(buf_idx);
		}
	}

	/**
	 * commit a node's undo log after it has been confirmed non-pending.
	 * called by the builder when a pending node is explicitly committed.
	 */
	dispatch_commit(buf_idx: number): void {
		this.undo.commit(buf_idx);
		if (this.uncommitted !== 0) this.commit_tasks(buf_idx);
	}

	/**
	 * revoke the plugin mutations of one node, walks its undo log in reverse
	 * and discards its close callbacks
	 * must be called BEFORE handle_repair().
	 */
	dispatch_revoke(buf_idx: number, buf: NodeBuffer): void {
		if (this.held !== NONE) this.unhold(buf);
		// nothing recorded, so nothing to undo
		if (
			this.links === 0 &&
			this.close_cbs.live === 0 &&
			this.undo.empty &&
			this.close_with === null &&
			this.scope === null &&
			this.tasks === null
		)
			return;
		this.close_cbs.discard(buf_idx);
		if (this.tasks !== null) this.drop_tasks(buf_idx);

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
		// no block directive is revoked today, a dead scope must not stay
		if (this.scope !== null) this.end_scope(buf_idx);
	}

	/**
	 * the children a revoked paragraph gives to the directive it was written in, read before the repair
	 * they opened under the paragraph, so the children handlers of the directive have not seen them
	 */
	lifted(buf_idx: number, buf: NodeBuffer): number[] | null {
		const scope = this.scope;
		if (scope === null || buf.kind_at(buf_idx) !== NodeKind.paragraph)
			return null;
		const entry = scope.entry;
		if (entry.children === null && entry.any_child === null) return null;
		// a wrapper holds what was written in the directive
		let parent = buf.parent_at(buf_idx);
		while (parent !== NONE && buf.synthetic_at(parent)) {
			parent = buf.parent_at(parent);
		}
		if (parent !== scope.directive) return null;
		let lifted: number[] | null = null;
		for (
			let child = buf.first_child_at(buf_idx);
			child !== NONE;
			child = buf.next_at(child)
		) {
			const kind = buf.kind_at(child);
			// the line end between two tags is no child, as a blank line is none
			if (kind === NodeKind.text || kind === NodeKind.soft_break) continue;
			if (lifted === null) lifted = [child];
			else lifted.push(child);
		}
		return lifted;
	}

	/** the children handlers of the innermost scope for each node the repair made its child */
	dispatch_lifted(nodes: number[], buf: NodeBuffer): void {
		const scope = this.scope;
		if (scope === null) return;
		const entry = scope.entry;
		const undo = this.undo;
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			const kind = buf.kind_at(node);
			const closed = buf.end_at(node) !== NONE;
			const cache = this.views(buf);
			const view = cache.get(node)!;
			// nothing reads what a handler records for a node that is final
			if (!closed || buf.pending_at(node) !== 0) undo.set_active_node(node);
			this.running = node;
			let callbacks: (() => void)[] | null = null;
			const handler = entry.children === null ? null : entry.children[kind];
			if (handler != null) {
				callbacks = this.call_bound(handler, view, scope, kind, callbacks);
			}
			const any = entry.any_child;
			if (any !== null && kind !== NodeKind.line_break) {
				callbacks = this.call_bound(any, view, scope, ANY_SLOT, callbacks);
			}
			undo.clear_active_node();
			this.running = NONE;
			cache.clear();
			if (callbacks !== null) {
				let close_cbs = this.close_cbs;
				if (close_cbs === NO_CLOSE_CBS)
					close_cbs = this.close_cbs = new CloseCallbackStore();
				// ahead of the callbacks its open left, bound runs first
				for (let c = callbacks.length - 1; c >= 0; c--) {
					close_cbs.add_first(node, callbacks[c]);
				}
			}
			if (closed) this.dispatch_close(node, buf, true);
		}
	}

	/**
	 * run sequential plugin passes over a completed tree.
	 * each sequential plugin gets its own tree walk.
	 */
	run_sequential(buf: NodeBuffer): void {
		if (this.held !== NONE) this.unhold(buf);
		if (this.sequential.length === 0) return;
		this.sequential_pass = true;
		for (const pass of this.sequential) {
			const handlers = pass.handlers;
			const text = pass.text;

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
				const kind = n[b] & 0xff;
				if (
					handlers[kind] != null ||
					(text !== null && kind === NodeKind.text)
				) {
					handled = true;
					break;
				}
			}
			if (!handled) continue;
			const close_store = new CloseCallbackStore();
			const ctx = this.contexts ?? this.make_contexts();
			const stack: number[] = [];

			while (true) {
				const b = idx * NodeField.stride;
				const handler = handlers[n[b] & 0xff];
				// where the walk goes on if the handler removes its node
				let next = n[b + NodeField.next];
				let parent = n[b + NodeField.parent];
				let removed = false;
				if (text !== null && (n[b] & 0xff) === NodeKind.text) {
					// the run goes to the handler whole, the walk goes on after it and
					// past whatever the handler put in its place
					next = this.run_text(buf, idx, text, ctx);
					n = buf._n;
					removed = true;
				} else if (handler != null) {
					const cache = this.views(buf);
					const view = cache.get(idx)!;
					// the tree is complete so nothing revokes a sequential write, no
					// active node means none is recorded
					this.running = idx;
					const callbacks = handler(view, ctx);
					this.running = NONE;
					cache.clear();
					n = buf._n;
					removed = n[b + NodeField.parent] === NONE;
					// a node that is out of the tree has no close to wait for
					if (callbacks && !removed) close_store.set(idx, callbacks);
				}

				if (!removed) {
					const child = n[b + NodeField.first_child];
					if (child !== NONE) {
						stack.push(idx);
						idx = child;
						continue;
					}
					if (close_store.live !== 0 && this.fire_sequential(close_store, idx))
						n = buf._n;
					// read after the handler and the callbacks, which may relink the
					// node, one that removed it leaves the walk where it was
					if (n[b + NodeField.parent] !== NONE) {
						next = n[b + NodeField.next];
						parent = n[b + NodeField.parent];
					}
				}
				while (
					(next === NONE ||
						n[next * NodeField.stride + NodeField.parent] !== parent) &&
					stack.length > 0
				) {
					idx = stack.pop()!;
					const bi = idx * NodeField.stride;
					next = n[bi + NodeField.next];
					parent = n[bi + NodeField.parent];
					if (
						close_store.live !== 0 &&
						this.fire_sequential(close_store, idx)
					) {
						n = buf._n;
						if (n[bi + NodeField.parent] !== NONE) {
							next = n[bi + NodeField.next];
							parent = n[bi + NodeField.parent];
						}
					}
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
	 * the text handler of a sequential pass for the run of text nodes that
	 * starts at first, returns the sibling after the run, NONE for none
	 */
	private run_text(
		buf: NodeBuffer,
		first: number,
		entry: TextEntry,
		ctx: PluginContext[]
	): number {
		const parent = buf.parent_at(first);
		const source = this.text_source;
		const strings = buf._strings;
		const all = entry.all;
		const nodes: number[] = [];
		const at: number[] = [];
		const len: number[] = [];
		let text = '';
		let escaped: number[] | null = null;
		let node = first;
		while (
			node !== NONE &&
			buf.parent_at(node) === parent &&
			buf.kind_at(node) === NodeKind.text
		) {
			let own = strings[node];
			if (own === undefined) {
				const start = buf.value_start_at(node);
				const end = buf.value_end_at(node);
				own =
					start === NONE || end === NONE || end <= start
						? ''
						: source.slice(start, end);
			}
			// an empty text node has nothing to replace and stays where it is
			if (own.length !== 0) {
				if (!all) {
					const marks = source.escapes(buf, node);
					if (marks !== null) {
						if (escaped === null) escaped = [];
						for (let i = 0; i < marks.length; i++) {
							escaped.push(text.length + marks[i]);
						}
					}
				}
				nodes.push(node);
				at.push(text.length);
				len.push(own.length);
				text += own;
			}
			node = buf.next_at(node);
		}
		const after = node !== NONE && buf.parent_at(node) === parent ? node : NONE;
		if (text.length === 0) return after;
		if (!all && this.kept_from_text(buf, parent, text)) {
			return after;
		}

		const cache = this.views(buf);
		const pieces = new RunPieces(
			buf,
			source,
			cache,
			parent,
			after,
			text,
			nodes,
			at,
			len
		);
		const context = ctx[entry.at];
		const parse = entry.parse;
		this.running = first;
		// an escaped character is in no run, so nothing replaces it
		let from = 0;
		const cuts = escaped === null ? 0 : escaped.length;
		for (let i = 0; i <= cuts; i++) {
			const to = i < cuts ? escaped![i] : text.length;
			if (to > from) {
				const returned: unknown = parse(new TextRun(pieces, from, to), context);
				if (typeof returned === 'function') {
					this.running = NONE;
					throw new TypeError(
						'a text handler returns nothing, a run of text has no close to call a function at'
					);
				}
			}
			from = to + 1;
		}
		this.running = NONE;
		cache.clear();
		return after;
	}

	/**
	 * text a handler is kept from unless it asks for all, the alt text of an
	 * image, the text of an element that holds code, and the text of a link
	 * that is its url
	 */
	private kept_from_text(
		buf: NodeBuffer,
		parent: number,
		text: string
	): boolean {
		for (let up = parent; up !== NONE; up = buf.parent_at(up)) {
			const kind = buf.kind_at(up);
			if (kind === NodeKind.image) return true;
			if (kind === NodeKind.html) {
				const meta = buf.metadata_at(up);
				if (meta && typeof meta.tag === 'string' && CODE_TAGS.has(meta.tag)) {
					return true;
				}
			}
		}
		// whatever else a plugin put in the link, an icon say
		if (buf.kind_at(parent) === NodeKind.link) {
			const meta = buf.metadata_at(parent);
			const href = meta ? meta.href : undefined;
			if (href === text || href === 'mailto:' + text) return true;
		}
		return false;
	}

	/** the close callbacks of a node in a sequential pass, false when it has none */
	private fire_sequential(store: CloseCallbackStore, idx: number): boolean {
		const cbs = store.take(idx);
		if (cbs === undefined) return false;
		this.running = idx;
		this.closing = true;
		for (let i = 0; i < cbs.length; i++) cbs[i]();
		this.running = NONE;
		this.closing = false;
		return true;
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
			this.release_slots();
		}
		this.open_from.clear();
		this.close_with = null;
		// a throw in a handler leaves these set
		this.running = NONE;
		this.closing = false;
		this.final_close = false;
		this.held = NONE;
		this.sequential_pass = false;
		// a document that ended whole closed every scope
		if (this.scope !== null) {
			this.scopes!.length = 0;
			this.scope = null;
		}
		this.drop_narrow();
		// a scope switched these to its own kinds
		this.handles = this.handled;
		this.wants_floor = -1;
		this.next_synthetic_id = SYNTHETIC_ID_BASE;
		// plugins keep per document state on theirs
		this.contexts = null;
		this.doc = null;
		this.warned = null;
		this.bags = null;
		// a task of the last document goes on unheard
		const tasks = this.tasks;
		if (tasks !== null) {
			for (let i = 0; i < tasks.length; i++) tasks[i].dropped = true;
			this.tasks = null;
		}
		this.uncommitted = 0;
		this.task_buf = null;
		if (this.cache !== null) this.cache.invalidate();
	}
}
