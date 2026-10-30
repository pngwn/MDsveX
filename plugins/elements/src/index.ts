import type {
	Bundle,
	BundleDirective,
	DirectiveContext,
	NodeView,
	WrapperView,
} from 'mdsvex/compile';

export interface ElementsOptions {
	/**
	 * false leaves the default stylesheet out, the markup and its class names
	 * stay the same
	 */
	css?: boolean;
}

/** the args of an item, the name of its accordion makes it one of a set */
function item_args(ctx: DirectiveContext): Record<string, string> | undefined {
	const name = ctx.directive.attrs.args?.name;
	return typeof name === 'string' && name !== '' ? { name } : undefined;
}

/** an item has started, what was written ahead of the first one is known to be stray now */
function count_item(node: NodeView, ctx: DirectiveContext): void {
	const state = ctx.state;
	const index: number = state.count ?? 0;
	state.count = index + 1;
	if (index === 0 && state.stray !== undefined) {
		ctx.warn(
			'content_before_first_item',
			'content before the first item of :::accordion is in no item, move it above the container',
			state.stray
		);
	}
}

function open_item(node: NodeView, ctx: DirectiveContext): WrapperView {
	const state = ctx.state;
	state.item?.close();
	count_item(node, ctx);
	const args = item_args(ctx);
	return (state.item = node.wrap_from(
		'directive_container',
		args === undefined ? { name: 'details' } : { name: 'details', args }
	));
}

const accordion: BundleDirective = {
	parse(node, ctx) {
		return () => {
			if (ctx.state.count !== undefined) return;
			ctx.warn(
				'no_items',
				':::accordion has no items, a heading written directly inside it starts one',
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
			open_item(node, ctx);
			// a summary is no section of the page, as a label it gets no id and no anchor
			node.type = 'directive_label';
			return () => {
				if (node.first_child !== null) return;
				ctx.warn(
					'item_without_label',
					'an item of :::accordion has an empty heading, its summary is the default of the browser',
					node
				);
			};
		},
		// a details directive written out is an item of its own
		directive_container(node, ctx) {
			if (node.attrs.name !== 'details') return;
			const state = ctx.state;
			state.item?.close();
			state.item = undefined;
			count_item(node, ctx);
			const args = item_args(ctx);
			if (args !== undefined && node.attrs.args?.name === undefined) {
				node.attrs.args = { ...node.attrs.args, ...args };
			}
		},
		// after the handler for its type, so a child that starts an item is in one
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
};

/** an inline directive that warns when an arg it needs is missing */
function needs(arg: string, code: string, message: string): BundleDirective {
	return {
		parse(node, ctx) {
			// an inline directive has its args once its brackets close
			return () => {
				const value = node.attrs.args?.[arg];
				if (typeof value === 'string' && value !== '') return;
				ctx.warn(code, message, node);
			};
		},
	};
}

const RT = needs(
	'rt',
	'ruby_without_rt',
	':ruby has no rt, write the reading as :ruby[漢字](rt=かんじ)'
);

const TITLE = needs(
	'title',
	'abbr_without_title',
	':abbr has no title, write what it stands for as :abbr[HTML](title="HyperText Markup Language")'
);

/**
 * thin directives over html elements, `:::details`, `:::accordion`,
 * `:kbd[Ctrl]`, `:ruby[漢字](rt=かんじ)`, `:badge[new]`, `:mark[text]`,
 * `:ins[text]` and `:abbr[HTML](title=...)`, none needs javascript
 *
 * each heading written directly inside `:::accordion` starts an item, a
 * `details` that holds the text of the heading as its summary and what follows
 * as its body, `(name=faq)` keeps one item of the set open at a time
 *
 * @example
 * import { elements } from '@mdsvex/plugin-elements';
 *
 * mdsvex({ plugins: [elements()] });
 */
export function elements(options: ElementsOptions = {}): Bundle {
	return {
		name: 'elements',
		module:
			options.css === false
				? '@mdsvex/plugin-elements/directives/unstyled'
				: '@mdsvex/plugin-elements/directives',
		directives: {
			details: {},
			accordion,
			kbd: {},
			ruby: RT,
			badge: {},
			mark: {},
			ins: {},
			abbr: TITLE,
		},
	};
}
