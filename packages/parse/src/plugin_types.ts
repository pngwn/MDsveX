import type { NodeView } from './node_view';
import type { Json, PluginCache } from './plugin_data';
import type { TextRun } from './text_run';

export type { DataChange, Json } from './plugin_data';

/** a problem a plugin reported with ctx.warn */
export interface PluginWarning {
	/** the name of the plugin that warned, undefined when it has none */
	plugin: string | undefined;
	code: string;
	message: string;
	/**
	 * the offsets of the node the warning is about, undefined without a node,
	 * for a node a plugin made and over the wire, which carries no offsets
	 */
	start: number | undefined;
	end: number | undefined;
}

/** what plugins wrote with ctx.set and ctx.add, by plugin name */
export type PluginData = Record<string, Record<string, Json>>;

/** what whoever runs a parse tells its handlers about the document */
export interface PluginDocument {
	/** the path of the document */
	filename?: string;
	/**
	 * the parsed frontmatter, called each time a handler reads ctx.frontmatter,
	 * so it caches what is costly and gives undefined until the frontmatter is
	 * complete
	 */
	frontmatter?: () => Record<string, unknown> | undefined;
	/** reads a file for ctx.read, the host supplies it, without one ctx.read throws */
	read?: (path: string) => string | Promise<string>;
	/**
	 * resolves a specifier from a file for ctx.resolve, null when nothing
	 * matches, without one ctx.resolve throws
	 */
	resolve?: (
		specifier: string,
		importer: string | undefined
	) => string | null | undefined | Promise<string | null | undefined>;
	/** what ctx.cached keeps, shared by the documents of one compiler */
	cache?: PluginCache;
}

/** what every handler learns about its document and can hand back */
export interface DocumentContext {
	/** the path of the document, undefined when whoever runs the parse gave none */
	readonly filename: string | undefined;
	/**
	 * the parsed frontmatter, undefined for a document without any and when
	 * nothing parses it, it is the first node, so only its own open handler
	 * runs before it is complete, do not write to it
	 */
	readonly frontmatter: Record<string, unknown> | undefined;
	/**
	 * report a problem, at the node when one is given, it is dropped when the
	 * node whose handler reported it is revoked
	 */
	warn(code: string, message: string, node?: NodeView): void;
	/**
	 * what the plugin wrote with set and add as it stands, one per plugin name
	 * for each document, read-only, reading it throws for a plugin without a name
	 */
	readonly data: Readonly<Record<string, Json>>;
	/**
	 * one value under a key, owned by the node whose handler or close callback
	 * writes it and taken back when that node is revoked, of two owners the
	 * later one in the document wins, the value is copied and frozen and one
	 * json can not hold throws a PluginDataError, it is unknown here as an
	 * interface has no index signature to match json with
	 */
	set(key: string, value: unknown): void;
	/**
	 * one entry of a list under a key, owned and taken back as a set is, the
	 * list is in the order of its owners in the document, entries from a
	 * sequential pass come after the rest in the order they were added
	 */
	add(key: string, value: unknown): void;
	/**
	 * starts async work for the node whose handler or close callback runs,
	 * the task gets a node and a context of its own and changes the document
	 * through them, the changes apply once the task settled and the node is
	 * committed, and go if the node is revoked, it may change the node and
	 * what is inside it and write data owned by the node, anything else is a
	 * TypeError, a parse that can not wait throws a PluginAsyncError
	 */
	defer(
		node: NodeView,
		task: (node: NodeView, ctx: TaskContext) => Promise<void> | void
	): void;
	/** names an absolute path the output depends on, it need not exist yet */
	depend(path: string): void;
	/** the text of a file with the reader the host passes, the path is a dependency */
	read(path: string): Promise<string>;
	/** a specifier resolved from the document by the host, null when nothing matches */
	resolve(specifier: string): Promise<string | null>;
	/**
	 * a value shared by the documents of the compiler, loaded once while the
	 * load runs and kept, a key that is an absolute path is a dependency and
	 * is dropped when the host invalidates that path
	 */
	cached<T>(key: string, load: (key: string) => T | Promise<T>): Promise<T>;
}

/**
 * what a deferred task gets beside its node, its writes are kept and apply
 * with the rest of the task, data reads as it stands without them
 */
export interface TaskContext {
	readonly filename: string | undefined;
	readonly frontmatter: Record<string, unknown> | undefined;
	readonly data: Readonly<Record<string, Json>>;
	set(key: string, value: unknown): void;
	add(key: string, value: unknown): void;
	/** a node to point at is the node of the task or one reached from it */
	warn(code: string, message: string, node?: NodeView): void;
	depend(path: string): void;
	read(path: string): Promise<string>;
	resolve(specifier: string): Promise<string | null>;
	cached<T>(key: string, load: (key: string) => T | Promise<T>): Promise<T>;
}

/**
 * context passed to plugin handlers, new for each document and each plugin,
 * a plugin keeps what it needs between its handlers on it
 */
export interface PluginContext extends DocumentContext {
	[key: string]: any;
}

/** a single handler entry for a node type. */
export interface NodeHandler {
	parse(node: NodeView, ctx: PluginContext): (() => void) | void;
}

/**
 * the text handler of a sequential plugin, called for each run of text once
 * the tree is complete
 */
export type TextHandler = (run: TextRun, ctx: PluginContext) => void;

/**
 * a parse plugin declares handlers by node type name.
 *
 * ```js
 * const plugin = {
 *   heading: { parse(node, ctx) { node.attrs.id = 'foo'; } },
 *   link: { parse(node, ctx) { return () => { // close }; } },
 * };
 * ```
 */
export interface ParsePlugin {
	/** keys what the plugin writes to ctx.data and is named in its warnings */
	name?: string;
	sequential?: boolean;
	/** runs of text, only a sequential plugin has one */
	text?: TextHandler;
	/**
	 * runs once, after the parse, the sequential passes and every deferred
	 * task, in plugin order, each awaited, its writes belong to no node
	 */
	document?: (root: NodeView, ctx: PluginContext) => void | Promise<void>;
	/**
	 * true to also give the text handler what it is kept from, the characters
	 * the author escaped, the text of an autolink, the alt text of an image and
	 * the text of an element that holds code, such as code or kbd
	 */
	all_text?: boolean;
	[nodeType: string]:
		| { parse: NodeHandler['parse'] }
		| TextHandler
		| ((root: NodeView, ctx: PluginContext) => void | Promise<void>)
		| boolean
		| string
		| undefined;
}

/** what a handler bound to a directive gets in place of the plugin context */
export interface DirectiveContext extends DocumentContext {
	/** the directive the handler is bound to */
	directive: NodeView;
	/** how many times this handler already ran in this directive, 0 for the first */
	index: number;
	/**
	 * empty and fresh for each directive in the document, a write is undone
	 * when the node whose handler made it is revoked, shallow as attrs are
	 */
	state: Record<string, any>;
}

/** a handler bound to a directive, a function it returns runs when the node closes */
export type DirectiveHandler = (
	node: NodeView,
	ctx: DirectiveContext
) => (() => void) | void;

/** the handlers of one directive name, any other key is ignored */
export interface DirectiveEntry {
	/**
	 * by node type, for nodes written directly inside a container of this
	 * name, the '*' handler takes a child of any type, after the one for its type
	 */
	children?: { [node_type: string]: DirectiveHandler };
	/** by node type, for nodes at any depth inside a container of this name */
	descendants?: { [node_type: string]: DirectiveHandler };
	/** the directive itself, called when its name is known */
	parse?: DirectiveHandler;
}

/**
 * handlers bound to directives, by directive name
 *
 * ```js
 * const bound = {
 *   steps: { children: { heading(node, ctx) { ctx.state.count = ctx.index + 1; } } },
 * };
 * ```
 */
export interface DirectiveHandlers {
	[directive_name: string]: DirectiveEntry;
}

/**
 * a table of bound handlers with the name of the plugin they belong to, which
 * keys what they write to ctx.data and is named in their warnings
 *
 * ```js
 * { name: 'steps', directives: { steps: { children: { heading(node, ctx) {} } } } }
 * ```
 */
export interface NamedDirectiveHandlers {
	name: string;
	directives: DirectiveHandlers;
}

/** an entry of directive_handlers, a table or a table with a plugin name */
export type DirectiveTable = DirectiveHandlers | NamedDirectiveHandlers;

/**
 * composed handler: calls all registered handlers for a kind and
 * collects close callbacks. returns null if no callbacks were returned.
 * each handler gets the context of its own plugin, by the place of the
 * plugin in the array the handlers were registered from
 */
export type ComposedHandler = (
	view: NodeView,
	contexts: PluginContext[]
) => (() => void)[] | null;

/** callback a builder provides so the dispatcher can register synthetic node ids. */
export type IdRegister = (synthetic_id: number, buf_idx: number) => void;
