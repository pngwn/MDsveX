import type { Bundle } from 'mdsvex';

export interface ExternalLinksOptions {
	/** the `target` of an external link, such as `'_blank'`, none by default */
	target?: string;
	/**
	 * `rel` tokens for an external link, added to the ones the link has
	 *
	 * @default ['noopener', 'noreferrer']
	 */
	rel?: string | string[];
	/**
	 * hosts that are this site, a link to one is not external
	 *
	 * a host is compared whole and without its port, `example.com` does not
	 * cover `www.example.com`
	 */
	internal_hosts?: string[];
	/**
	 * decides whether a link is external, in place of the built in test, whose
	 * answer is the second argument
	 *
	 * @example
	 * is_external: (href, external) => external || href.endsWith('.pdf')
	 */
	is_external?: (href: string, external: boolean) => boolean;
	/** more attributes for an external link, such as a class */
	attrs?: Record<string, string>;
	/**
	 * an empty `<span>` at the end of each external link for a stylesheet to
	 * draw an icon in, `true` gives it `class="external-link-icon"`, an object
	 * is its attributes
	 */
	icon?: boolean | Record<string, string>;
	/**
	 * what a screen reader says after a link that opens a new tab, such as
	 * `'opens in a new tab'`, it needs a `target` that opens one
	 */
	new_tab_label?: string;
}

const NAME = '[@mdsvex/plugin-external-links]';

const DEFAULT_REL = ['noopener', 'noreferrer'];

/** these targets stay in the tab the link is in */
const SAME_TAB = ['_self', '_parent', '_top'];

/**
 * the scheme and authority of an absolute or protocol relative http url,
 * browsers read a backslash as a slash and skip extra ones
 */
const ORIGIN = /^(?:https?:[\\/]*|[\\/]{2,})([^\\/?#]*)/i;

/** the host of an authority, lower case, without userinfo or port */
function host_of(authority: string): string {
	let host = authority.slice(authority.lastIndexOf('@') + 1);
	// the colons of an ipv6 address sit inside its brackets
	const port = host.indexOf(':', host.lastIndexOf(']') + 1);
	if (port !== -1) host = host.slice(0, port);
	return host.toLowerCase();
}

function split(value: string | string[], option: string): string[] {
	const list = typeof value === 'string' ? [value] : value;
	if (!Array.isArray(list) || list.some((item) => typeof item !== 'string')) {
		throw new Error(`${NAME} ${option} must be a string or a list of strings`);
	}
	return list.flatMap((item) => item.split(/\s+/)).filter(Boolean);
}

/** tokens added to a rel value, one the value has in any case is kept as written */
function merge_rel(existing: unknown, tokens: string[]): string {
	const out = typeof existing === 'string' ? split(existing, 'rel') : [];
	const seen = new Set(out.map((token) => token.toLowerCase()));
	for (const token of tokens) {
		if (seen.has(token)) continue;
		seen.add(token);
		out.push(token);
	}
	return out.join(' ');
}

/**
 * `rel` and `target` on every markdown link that leaves the site
 *
 * a link is external when it is an absolute `http:` or `https:` url, or a
 * protocol relative one, whose host is not in `internal_hosts`, a url whose
 * host is written by an expression is left alone
 *
 * @example
 * import { external_links } from '@mdsvex/plugin-external-links';
 *
 * mdsvex({ plugins: [external_links({ target: '_blank' })] });
 */
export function external_links(options: ExternalLinksOptions = {}): Bundle {
	const { target, is_external, attrs, new_tab_label } = options;
	if (target !== undefined && (typeof target !== 'string' || target === '')) {
		throw new Error(`${NAME} target must be a string that is not empty`);
	}
	if (is_external !== undefined && typeof is_external !== 'function') {
		throw new Error(`${NAME} is_external must be a function`);
	}
	const new_tab =
		target !== undefined && !SAME_TAB.includes(target.toLowerCase());
	if (new_tab_label !== undefined) {
		if (typeof new_tab_label !== 'string' || new_tab_label === '') {
			throw new Error(
				`${NAME} new_tab_label must be a string that is not empty`
			);
		}
		if (!new_tab) {
			throw new Error(
				`${NAME} new_tab_label needs a target that opens a new tab, such as '_blank'`
			);
		}
	}
	const rel = split(options.rel ?? DEFAULT_REL, 'rel').map((token) =>
		token.toLowerCase()
	);
	const internal = new Set(
		split(options.internal_hosts ?? [], 'internal_hosts').map(host_of)
	);

	let marker: Record<string, string> | undefined;
	if (options.icon || new_tab_label !== undefined) {
		marker =
			typeof options.icon === 'object'
				? { ...options.icon }
				: options.icon
					? { class: 'external-link-icon' }
					: {};
		if (new_tab_label === undefined) marker['aria-hidden'] = 'true';
		else {
			// a plugin cannot add text, an element named like an image is read out the same
			marker.role = 'img';
			marker['aria-label'] = new_tab_label;
		}
	}

	function external(href: string): boolean {
		const origin = ORIGIN.exec(href.trim());
		let found = false;
		if (origin !== null && !origin[0].includes('{')) {
			const host = host_of(origin[1]);
			found = host !== '' && !internal.has(host);
		}
		return is_external === undefined
			? found
			: is_external(href, found) === true;
	}

	return {
		name: 'external-links',
		parse: {
			link: {
				// a link has its href and its text when it closes
				parse: (node) => () => {
					const link = node.attrs;
					const href = link.href;
					if (typeof href !== 'string' || !external(href)) return;
					if (rel.length !== 0) link.rel = merge_rel(link.rel, rel);
					if (target !== undefined && link.target === undefined) {
						link.target = target;
					}
					if (attrs !== undefined) {
						for (const name of Object.keys(attrs)) link[name] = attrs[name];
					}
					if (marker !== undefined) {
						node.append('html', { tag: 'span', attributes: { ...marker } });
					}
				},
			},
		},
	};
}
