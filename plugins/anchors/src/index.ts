import type { Bundle, NodeView } from 'mdsvex';

export interface AnchorsOptions {
	/**
	 * where the link goes, `'wrap'` puts the content of the heading inside it
	 *
	 * `'prepend'` and `'append'` add an empty link before or after the content,
	 * with `aria-hidden="true"` and `tabindex="-1"`, for a stylesheet to draw
	 */
	position?: 'wrap' | 'prepend' | 'append';
	/** more attributes for the link, such as a class, they replace a default of the same name */
	attrs?: Record<string, string>;
}

const POSITIONS = ['wrap', 'prepend', 'append'];

/** a link in a link is not valid html, an `<a>` the author typed counts */
function holds_link(node: NodeView): boolean {
	for (let child = node.first_child; child !== null; child = child.next) {
		const type = child.type;
		if (type === 'link') return true;
		if (type === 'html' && child.attrs.tag === 'a') return true;
		if (holds_link(child)) return true;
	}
	return false;
}

/**
 * a link to itself on every heading that has an id
 *
 * the ids come from the `heading_ids` option of mdsvex, which has to be on,
 * this plugin makes none and a heading without an id is left as it is
 *
 * @example
 * import { anchors } from '@mdsvex/plugin-anchors';
 *
 * mdsvex({ heading_ids: true, plugins: [anchors()] });
 */
export function anchors(options: AnchorsOptions = {}): Bundle {
	const position = options.position ?? 'wrap';
	if (!POSITIONS.includes(position)) {
		throw new Error(
			`[@mdsvex/plugin-anchors] position must be 'wrap', 'prepend' or 'append', got ${JSON.stringify(position)}`
		);
	}
	const extra = options.attrs;

	return {
		name: 'anchors',
		parse: {
			// heading_ids sets the ids after the parse, a fused handler would read none
			sequential: true,
			heading: {
				parse(node) {
					const id = node.attrs.id;
					if (typeof id !== 'string' || id === '') return;
					const href = '#' + id;
					if (position === 'wrap') {
						if (holds_link(node)) return;
						node.wrap_inner('link', { href, ...extra });
						return;
					}
					// nothing in the link to read out or to stop on
					const attrs = {
						href,
						'aria-hidden': 'true',
						tabindex: '-1',
						...extra,
					};
					if (position === 'prepend') node.prepend('link', attrs);
					else node.append('link', attrs);
				},
			},
		},
	};
}
