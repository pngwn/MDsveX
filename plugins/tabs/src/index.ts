import { fence_meta } from 'mdsvex/compile';
import type { Bundle, DirectiveContext, NodeView, WrapperView } from 'mdsvex';

export interface TabsOptions {
	/**
	 * false leaves the default stylesheet out, the markup and its class names
	 * stay the same
	 */
	css?: boolean;
}

/** what a container splits on once a code fence came first, a heading depth otherwise */
const FENCES = 0;

function open_tab(node: NodeView, ctx: DirectiveContext): WrapperView {
	const state = ctx.state;
	state.tab?.close();
	const index: number = state.count ?? 0;
	state.count = index + 1;
	// what was written ahead of the first tab is known to be stray now
	if (index === 0 && state.stray !== undefined) {
		ctx.warn(
			'content_before_first_tab',
			'content before the first tab of :::tabs is in no tab, move it above the container',
			state.stray
		);
	}
	return (state.tab = node.wrap_from('directive_container', {
		name: 'tab',
		args: { index: String(index) },
	}));
}

/** a tab with nothing to show in its button is named by its place */
function place_of(tab: WrapperView): string {
	return String(Number(tab.attrs.args.index) + 1);
}

/**
 * tabs and code groups, each heading written directly inside `:::tabs` starts
 * a `tab` that holds the text of the heading as its label and what follows as
 * its panel
 *
 * the first heading sets the depth that splits, a container whose first
 * heading or code fence is a fence is a code group, where each fence is a tab
 * labelled by its `[name]`, its `title` or its language
 *
 * @example
 * import { tabs } from '@mdsvex/plugin-tabs';
 *
 * mdsvex({ plugins: [tabs()] });
 */
export function tabs(options: TabsOptions = {}): Bundle {
	return {
		name: 'tabs',
		module:
			options.css === false
				? '@mdsvex/plugin-tabs/directives/unstyled'
				: '@mdsvex/plugin-tabs/directives',
		directives: {
			tabs: {
				parse(node, ctx) {
					return () => {
						if (ctx.state.count !== undefined) return;
						ctx.warn(
							'no_tabs',
							':::tabs has no tabs, a heading or a code fence written directly inside it starts one',
							node
						);
					};
				},
				children: {
					heading(node, ctx) {
						const state = ctx.state;
						const depth = node.depth;
						if (state.split === undefined) state.split = depth;
						if (state.split !== depth) return;
						const tab = open_tab(node, ctx);
						// a tab label is no section of the page, as a label it gets no id and no anchor
						node.type = 'directive_label';
						return () => {
							if (node.first_child !== null) return;
							const title = place_of(tab);
							node.append('text', title);
							ctx.warn(
								'tab_without_label',
								`a tab of :::tabs has an empty heading and is labelled ${title}`,
								node
							);
						};
					},
					code_fence(node, ctx) {
						const state = ctx.state;
						if (state.split === undefined) {
							state.split = FENCES;
							const tabs = ctx.directive;
							tabs.attrs.args = { ...tabs.attrs.args, code: 'true' };
						}
						if (state.split !== FENCES) return;
						const tab = open_tab(node, ctx);
						// its [name] or quoted title, whichever is written first, then its language
						const { title, lang } = fence_meta(node.info);
						let label = title || lang;
						if (label === '') {
							label = place_of(tab);
							ctx.warn(
								'tab_without_label',
								`a code fence of :::tabs has no title and no language and is labelled ${label}`,
								node
							);
						}
						tab.prepend('directive_label').append('text', label);
					},
					// after the handler for its type, so a child that starts a tab is in one
					'*'(node, ctx) {
						const state = ctx.state;
						if (
							state.count === undefined &&
							state.stray === undefined &&
							node.type !== 'directive_label'
						)
							state.stray = node;
					},
				},
			},
			// no handlers, the component of the tabs made above
			tab: {},
		},
	};
}
