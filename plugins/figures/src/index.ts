import type { Bundle, BundleDirective } from 'mdsvex/compile';

export interface FiguresOptions {
	/**
	 * false leaves the default stylesheet out, the markup and its class names
	 * stay the same
	 */
	css?: boolean;
}

const FIGURE: BundleDirective = {
	parse(node, ctx) {
		// an id the author wrote, a heading or footnote that has it already fails the build
		const id = node.attrs.args?.id;
		if (typeof id === 'string' && id !== '') ctx.id(id, { fixed: true });
		return () => {
			for (let child = node.first_child; child !== null; child = child.next) {
				if (child.type !== 'directive_label' && child.type !== 'line_break')
					return;
			}
			ctx.warn(
				'empty_figure',
				':::figure holds nothing, write the image, code or table it captions inside it',
				node
			);
		};
	},
};

/**
 * a figure, `:::figure[Caption](id=fig:sales)` around an image or anything
 * else renders a `<figure>` with the bracket text as its caption, the id is
 * optional and stays on the element
 *
 * a numbering plugin numbers it through plugin data, see `Figure.svelte`
 *
 * @example
 * import { figures } from '@mdsvex/plugin-figures';
 *
 * mdsvex({ unwrap_images: true, plugins: [figures()] });
 */
export function figures(options: FiguresOptions = {}): Bundle {
	return {
		name: 'figures',
		module:
			options.css === false
				? '@mdsvex/plugin-figures/directives/unstyled'
				: '@mdsvex/plugin-figures/directives',
		directives: { figure: FIGURE },
	};
}
