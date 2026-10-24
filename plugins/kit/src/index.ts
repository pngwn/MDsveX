import type {
	Bundle,
	BundleDirective,
	DirectiveContext,
	NodeView,
	ParsePlugin,
	WrapperView,
} from 'mdsvex/compile';

export interface KitOptions {
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

const RT: BundleDirective = {
	parse(node, ctx) {
		// an inline directive has its args once its brackets close
		return () => {
			const rt = node.attrs.args?.rt;
			if (typeof rt === 'string' && rt !== '') return;
			ctx.warn(
				'ruby_without_rt',
				':ruby has no rt, write the reading as :ruby[漢字](rt=かんじ)',
				node
			);
		};
	},
};

/** a video directive, its label is the name of the frame */
function embed(
	name: string,
	site: string,
	id_pattern: RegExp,
	example: string
): BundleDirective {
	return {
		parse(node, ctx) {
			const id = node.attrs.args?.id;
			if (typeof id !== 'string' || !id_pattern.test(id)) {
				ctx.warn(
					'embed_id',
					id === undefined || id === ''
						? `::${name} has no id, write it as ::${name}[Title](id=${example})`
						: `::${name} has an id that is no ${site} id: ${id}`,
					node
				);
			}
			return () => {
				const args = node.attrs.args;
				if (args?.title !== undefined) return;
				// an expression is not known until the page runs, it leaves a gap
				const title = node.text_content.replace(/\s+/g, ' ').trim();
				if (title === '') {
					ctx.warn(
						'embed_without_title',
						`::${name} has no title, a screen reader names the frame "${site} video", write the title in its brackets`,
						node
					);
					return;
				}
				node.attrs.args = { ...args, title };
			};
		},
	};
}

/**
 * components most sites want, each a directive, `:::details`,
 * `:::accordion`, `:kbd[Ctrl]`, `:ruby[漢字](rt=かんじ)`, `:badge[new]`,
 * `::youtube[Title](id=...)` and `::vimeo[Title](id=...)`
 *
 * each heading written directly inside `:::accordion` starts an item, a
 * `details` that holds the text of the heading as its summary and what follows
 * as its body, `(name=faq)` keeps one item of the set open at a time
 *
 * @example
 * import { kit } from '@mdsvex/plugin-kit';
 *
 * mdsvex({ plugins: [kit()] });
 */
export function kit(options: KitOptions = {}): Bundle {
	return {
		name: 'kit',
		module:
			options.css === false
				? '@mdsvex/plugin-kit/directives/unstyled'
				: '@mdsvex/plugin-kit/directives',
		directives: {
			details: {},
			accordion,
			kbd: {},
			ruby: RT,
			badge: {},
			youtube: embed('youtube', 'YouTube', /^[\w-]{11}$/, 'dQw4w9WgXcQ'),
			vimeo: embed('vimeo', 'Vimeo', /^\d+$/, '76979871'),
		},
	};
}

/** what holds only phrasing content, a figure inside one is invalid html */
const PHRASING = new Set([
	'paragraph',
	'heading',
	'table_cell',
	'directive_label',
]);

const STANDALONE: ParsePlugin = {
	// a paragraph of images is only unwrapped once it closes, so the tree is read when complete
	sequential: true,
	image: {
		parse(node) {
			if (node.attrs.title === undefined || node.attrs.title === '') return;
			for (let up = node.parent; up !== null; up = up.parent) {
				if (PHRASING.has(up.type)) return;
			}
			node.attrs.figure = 'true';
		},
	},
};

/**
 * renders an image that has a title as a figure with the title as its
 * caption, once `unwrap_images` has taken it out of its paragraph, an image
 * written beside text stays an image
 *
 * @example
 * import { figures } from '@mdsvex/plugin-kit';
 *
 * mdsvex({ unwrap_images: true, plugins: [figures()] });
 */
export function figures(options: KitOptions = {}): Bundle {
	return {
		name: 'figures',
		components: {
			specifier:
				options.css === false
					? '@mdsvex/plugin-kit/figures/unstyled'
					: '@mdsvex/plugin-kit/figures',
			names: ['img'],
		},
		parse: STANDALONE,
	};
}

/**
 * replaces `pre` with a code block that has a copy button, the title and
 * caption of the fence above and below it, a fence with the `nocopy` flag
 * gets no button
 *
 * @example
 * import { code_blocks } from '@mdsvex/plugin-kit';
 *
 * mdsvex({ plugins: [code_blocks()] });
 */
export function code_blocks(options: KitOptions = {}): Bundle {
	return {
		name: 'code_blocks',
		components: {
			specifier:
				options.css === false
					? '@mdsvex/plugin-kit/code-blocks/unstyled'
					: '@mdsvex/plugin-kit/code-blocks',
			names: ['pre'],
		},
	};
}
