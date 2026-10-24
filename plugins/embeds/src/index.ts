import type { Bundle, BundleDirective } from 'mdsvex/compile';

export interface EmbedsOptions {
	/**
	 * false leaves the default stylesheet out, the markup and its class names
	 * stay the same
	 */
	css?: boolean;
}

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
 * video players, `::youtube[Title](id=...)` and `::vimeo[Title](id=...)`,
 * lazy frames named by their label
 *
 * @example
 * import { embeds } from '@mdsvex/plugin-embeds';
 *
 * mdsvex({ plugins: [embeds()] });
 */
export function embeds(options: EmbedsOptions = {}): Bundle {
	return {
		name: 'embeds',
		module:
			options.css === false
				? '@mdsvex/plugin-embeds/directives/unstyled'
				: '@mdsvex/plugin-embeds/directives',
		directives: {
			youtube: embed('youtube', 'YouTube', /^[\w-]{11}$/, 'dQw4w9WgXcQ'),
			vimeo: embed('vimeo', 'Vimeo', /^\d+$/, '76979871'),
		},
	};
}
