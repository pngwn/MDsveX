import type { NodeView } from './node_view';

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

/** what plugins left in ctx.data, by plugin name */
export type PluginData = Record<string, Record<string, any>>;

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
	 * what the plugin hands back from the parse, one object per plugin name
	 * for each document, a write is undone when the node whose handler made it
	 * is revoked, shallow as attrs are, reading it throws for a plugin without
	 * a name
	 */
	readonly data: Record<string, any>;
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
	[nodeType: string]:
		| { parse: NodeHandler['parse'] }
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
