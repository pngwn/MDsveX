import type { NodeView } from "./node_view";

/** context passed to plugin handlers. extension point for future use. */
export interface PluginContext {}

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
	sequential?: boolean;
	[nodeType: string]: { parse: NodeHandler["parse"] } | boolean | undefined;
}

/** what a handler bound to a directive gets in place of the plugin context */
export interface DirectiveContext {
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
	ctx: DirectiveContext,
) => (() => void) | void;

/** the handlers of one directive name, any other key is ignored */
export interface DirectiveEntry {
	/** by node type, for nodes written directly inside a container of this name */
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
 * composed handler: calls all registered handlers for a kind and
 * collects close callbacks. returns null if no callbacks were returned.
 */
export type ComposedHandler = (
	view: NodeView,
	ctx: PluginContext,
) => (() => void)[] | null;

/** callback a builder provides so the dispatcher can register synthetic node ids. */
export type IdRegister = (synthetic_id: number, buf_idx: number) => void;
