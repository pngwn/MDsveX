// the heading_ids option, the ids are made at the close of each heading by
// HeadingIds in @mdsvex/parse, the same code for a compile and a stream

import { HeadingIds, heading_slug } from '@mdsvex/parse';
import type { HeadingSlug } from '@mdsvex/parse';
import { is_entity_name } from '@mdsvex/render/html-cursor';

export { HeadingIdError, heading_slug } from '@mdsvex/parse';
export type {
	HeadingIdErrorCode,
	HeadingInfo,
	HeadingSlug,
} from '@mdsvex/parse';

export interface HeadingIdsOptions {
	/** in place of heading_slug */
	slug?: HeadingSlug;
}

export interface HeadingOptions {
	/**
	 * gives every markdown heading an id made from its text, true slugs as
	 * github does, a heading that has an id keeps it, off by default
	 *
	 * @example
	 * heading_ids: { slug: (text, { depth }) => `h${depth}-${heading_slug(text)}` }
	 */
	heading_ids?: boolean | HeadingIdsOptions;
}

/** the slug function of a heading_ids option, undefined when it is off */
export function slug_of(option: unknown): HeadingSlug | undefined {
	if (option === undefined || option === false) return undefined;
	if (option === true) return heading_slug;
	if (typeof option === 'object' && option !== null) {
		const slug = (option as HeadingIdsOptions).slug;
		if (slug === undefined) return heading_slug;
		if (typeof slug === 'function') return slug;
	}
	throw new Error(
		'[mdsvex] heading_ids must be true, false or an object with a slug function'
	);
}

/**
 * what makes the ids of the documents a builder parses, a builder takes it
 * with set_headings and each document starts it, a stream passes no source
 *
 * @example
 * const builder = new WireTreeBuilder();
 * builder.set_headings(make_heading_ids());
 */
export function make_heading_ids(slug: HeadingSlug = heading_slug): HeadingIds {
	return new HeadingIds(slug, is_entity_name);
}
