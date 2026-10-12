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

const SPACE = 32;
const TAB = 9;

/**
 * the parts of a fence info string, split at whitespace outside quotes,
 * brackets and braces, the way mdsvex reads fence meta
 */
function info_parts(info: string): string[] {
	const parts: string[] = [];
	let i = 0;
	while (i < info.length) {
		const first = info.charCodeAt(i);
		if (first === SPACE || first === TAB) {
			i++;
			continue;
		}
		const start = i;
		let quote = '';
		let depth = 0;
		for (; i < info.length; i++) {
			const ch = info[i];
			if (quote !== '') {
				if (ch === quote) quote = '';
			} else if (ch === '"' || ch === "'") quote = ch;
			else if (ch === '[' || ch === '{') depth++;
			else if (ch === ']' || ch === '}') depth = depth > 0 ? depth - 1 : 0;
			else if (depth === 0 && (ch === ' ' || ch === '\t')) break;
		}
		parts.push(info.slice(start, i));
	}
	return parts;
}

/**
 * the label of a code fence, its `[name]` or quoted `title=`, whichever is
 * written first, then its language, empty for a fence with neither
 */
function fence_label(info: string): string {
	const parts = info_parts(info);
	for (let i = 1; i < parts.length; i++) {
		const part = parts[i];
		if (part.length > 2 && part.startsWith('[') && part.endsWith(']')) {
			return part.slice(1, -1);
		}
		if (part.length > 8 && part.startsWith('title=')) {
			const quote = part[6];
			if ((quote === '"' || quote === "'") && part.endsWith(quote)) {
				return part.slice(7, -1);
			}
		}
	}
	return parts[0] ?? '';
}

function open_tab(node: NodeView, ctx: DirectiveContext): WrapperView {
	const state = ctx.state;
	state.tab?.close();
	const index: number = state.count ?? 0;
	state.count = index + 1;
	return (state.tab = node.wrap_from('directive_container', {
		name: 'tab',
		args: { index: String(index) },
	}));
}

/** a tab with nothing to show in its button is named by its place */
function number_tab(tab: WrapperView): string {
	const index: string = tab.attrs.args.index;
	const title = String(Number(index) + 1);
	tab.attrs.args = { index, title };
	return title;
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
						if (ctx.state.count === undefined) {
							ctx.warn(
								'no_tabs',
								':::tabs has no tabs, a heading or a code fence written directly inside it starts one',
								node
							);
							return;
						}
						for (
							let child = node.first_child;
							child !== null;
							child = child.next
						) {
							const type = child.type;
							// the bracket text of the container, and the breaks around a block
							if (type === 'directive_label' || type === 'line_break') continue;
							if (
								type !== 'directive_container' ||
								child.attrs.name !== 'tab'
							) {
								ctx.warn(
									'content_before_first_tab',
									'content before the first tab of :::tabs is in no tab, move it above the container',
									child
								);
							}
							break;
						}
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
							const title = number_tab(tab);
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
						// the info string arrives after the open
						return () => {
							const title = fence_label(node.lang ?? '');
							if (title !== '') {
								tab.attrs.args = { index: tab.attrs.args.index, title };
								return;
							}
							ctx.warn(
								'tab_without_label',
								`a code fence of :::tabs has no title and no language and is labelled ${number_tab(tab)}`,
								node
							);
						};
					},
				},
			},
			// no handlers, the component of the tabs made above
			tab: {},
		},
	};
}
