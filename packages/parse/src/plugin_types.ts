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
