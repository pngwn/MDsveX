import type { ParsePlugin } from "@mdsvex/parse";

/**
 * slugify a string for use as a url fragment.
 *
 * lowercases, replaces non-word characters with hyphens,
 * and trims leading/trailing hyphens.
 */
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export interface AutolinkOptions {
	/**
	 * custom slugify function. receives the heading's text content,
	 * returns the slug string used for the id and href.
	 *
	 * defaults to lowercasing and replacing non-word chars with hyphens.
	 */
	slug?: (text: string) => string;
}

/**
 * auto-link headings with slug-based anchor links.
 *
 * for each heading:
 * 1. wraps the heading's content in a `link` node
 * 2. generates a slug from the heading's text content
 * 3. sets `id` on the heading
 * 4. sets `href` on the link to `#slug`
 *
 * ```js
 * import { autolink } from '@mdsvex/plugin-autolink';
 *
 * parse_markdown_svelte(source, {
 *   plugins: [autolink()],
 * });
 * ```
 */
export function autolink(options: AutolinkOptions = {}): ParsePlugin {
	const to_slug = options.slug ?? slugify;

	return {
		heading: {
			parse(node) {
				const link = node.wrap_inner("link");

				return () => {
					const slug = to_slug(node.text_content);
					node.attrs.id = slug;
					link.attrs.href = `#${slug}`;
				};
			},
		},
	};
}
