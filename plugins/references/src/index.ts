import type { Bundle, NodeView } from 'mdsvex/compile';

const PACKAGE = '@mdsvex/plugin-references';

const NAME = 'references';

/** what a reference is, a bare url that became a link is `url` */
export type ReferenceKind = 'mention' | 'issue' | 'commit' | 'url';

export interface Mention {
	user: string;
}

export interface Issue {
	/** `owner/name`, the one written or the `repo` option */
	repo: string;
	owner: string;
	name: string;
	number: string;
}

export interface Commit {
	repo: string;
	owner: string;
	name: string;
	sha: string;
}

/**
 * a url with `{placeholders}`, or a function that gives the url, `false`
 * leaves the reference as text, and so does a function that returns nothing
 */
export type Template<Parts> =
	| string
	| false
	| ((parts: Parts) => string | undefined | null | false);

export interface ReferencesOptions {
	/**
	 * the repository a bare `#123` and a commit belong to, as `owner/name`,
	 * without it only `@user` and `owner/name#123` are linked
	 */
	repo?: string;
	/** the url of a user, `https://github.com/{user}` by default */
	mention?: Template<Mention>;
	/**
	 * the url of an issue or a pull request,
	 * `https://github.com/{repo}/issues/{number}` by default, it also takes
	 * `{owner}` and `{name}`
	 */
	issue?: Template<Issue>;
	/** the url of a commit, `https://github.com/{repo}/commit/{sha}` by default */
	commit?: Template<Commit>;
	/** `true` also makes a link of a bare `https://`, `http://` or `www.` url */
	linkify?: boolean;
	/**
	 * attributes for each link, such as a class, or a function that gives
	 * them for one kind of reference
	 */
	attrs?:
		| Record<string, string>
		| ((kind: ReferenceKind) => Record<string, string> | undefined);
}

/** an option the plugin cannot use */
export class ReferencesError extends Error {
	code: 'option';

	constructor(message: string) {
		super(`[${PACKAGE}] ${message}`);
		this.name = 'ReferencesError';
		this.code = 'option';
	}
}

const GITHUB = {
	mention: 'https://github.com/{user}',
	issue: 'https://github.com/{repo}/issues/{number}',
	commit: 'https://github.com/{repo}/commit/{sha}',
};

const PLACEHOLDER = /\{([^{}]*)\}/g;

type Fill<Parts> = (parts: Parts) => string | undefined;

/** a template as a function, undefined for one that is off */
function template<Parts extends object>(
	option: string,
	value: unknown,
	fallback: string,
	keys: readonly string[]
): Fill<Parts> | undefined {
	if (value === false) return undefined;
	if (typeof value === 'function') {
		return (parts) => {
			const url = (value as (parts: Parts) => unknown)(parts);
			return typeof url === 'string' && url !== '' ? url : undefined;
		};
	}
	if (value !== undefined && typeof value !== 'string') {
		throw new ReferencesError(
			`${option} must be a url with placeholders, a function or false, got ${value === null ? 'null' : typeof value}`
		);
	}
	const url = value ?? fallback;
	for (const match of url.matchAll(PLACEHOLDER)) {
		if (!keys.includes(match[1])) {
			throw new ReferencesError(
				`${option} has the placeholder {${match[1]}}, it takes ${keys.map((key) => `{${key}}`).join(', ')}`
			);
		}
	}
	return (parts) =>
		url.replace(PLACEHOLDER, (_, key: string) =>
			// a repo keeps the slash between its two parts
			key === 'repo'
				? (parts as Record<string, string>)[key]
				: encodeURIComponent((parts as Record<string, string>)[key])
		);
}

const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}';
const REPO_NAME = '[A-Za-z0-9._-]+';
const REPO = new RegExp(`^(${OWNER})/(${REPO_NAME})$`);

// what a reference may not follow, a letter, a digit, or a character that
// makes it part of a path, an address or a character reference
const BEFORE = '(?<![\\p{L}\\p{N}_/@#&.+-])';
const AFTER = '(?![\\p{L}\\p{N}_])';

/**
 * one pass finds them all, and the order settles what a character belongs
 * to, a url and an address come first so nothing inside one is a reference
 */
const PATTERN = new RegExp(
	[
		`${BEFORE}(?<url>https?://[^\\s<]+|www\\.[^\\s<]+)`,
		`(?<email>[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)+)`,
		`${BEFORE}(?<owner>${OWNER})/(?<name>${REPO_NAME})#(?<cross>\\d+)${AFTER}`,
		`${BEFORE}@(?<user>${OWNER})(?![\\p{L}\\p{N}_/])`,
		`${BEFORE}#(?<issue>\\d+)(?![\\p{L}\\p{N}_]|\\.\\d)`,
		`${BEFORE}(?<sha>[0-9a-f]{7,40})${AFTER}`,
	].join('|'),
	'gu'
);

const NAMED: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
};

/** the references a url is likely to hold, the text of a run is as written */
function decode(text: string): string {
	if (text.indexOf('&') === -1) return text;
	return text.replace(
		/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/g,
		(whole, decimal, hex, named) => {
			if (named !== undefined) return NAMED[named];
			const code = decimal !== undefined ? +decimal : parseInt(hex, 16);
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
		}
	);
}

/**
 * where a bare url ends, by the rules GitHub uses, punctuation at its end
 * belongs to the sentence, and so does a bracket it does not open
 */
function url_end(url: string): number {
	let end = url.length;
	for (;;) {
		const last = url[end - 1];
		if ('?!.,:*_~\'"'.includes(last)) {
			end--;
		} else if (last === ')') {
			let open = 0;
			let close = 0;
			for (let i = 0; i < end; i++) {
				if (url[i] === '(') open++;
				else if (url[i] === ')') close++;
			}
			if (close <= open) return end;
			end--;
		} else if (last === ';') {
			const reference = /&[A-Za-z0-9]+;$/.exec(url.slice(0, end));
			if (reference === null) return end;
			end -= reference[0].length;
		} else return end;
		if (end === 0) return 0;
	}
}

const HOST = /^(?:https?:\/\/[A-Za-z0-9]|www\.[A-Za-z0-9-]+\.[A-Za-z0-9])/;

/** a link in a link is not valid html, an `<a>` the author typed counts */
function in_link(node: NodeView | null): boolean {
	for (; node !== null; node = node.parent) {
		const type = node.type;
		if (type === 'link') return true;
		if (type === 'html' && node.attrs.tag === 'a') return true;
	}
	return false;
}

/**
 * links for the references in prose, `@user`, `#123`, `owner/repo#123` and
 * commits, with the urls GitHub uses unless told otherwise, and for bare
 * urls with `linkify`
 *
 * @example
 * import { references } from '@mdsvex/plugin-references';
 *
 * mdsvex({ plugins: [references({ repo: 'sveltejs/svelte' })] });
 */
export function references(options: ReferencesOptions = {}): Bundle {
	const repo = options.repo;
	let home: [string, string] | undefined;
	if (repo !== undefined) {
		const parts = typeof repo === 'string' ? REPO.exec(repo) : null;
		if (parts === null) {
			throw new ReferencesError(
				`repo must be written owner/name, got ${JSON.stringify(repo)}`
			);
		}
		home = [parts[1], parts[2]];
	}
	const mention = template<Mention>(
		'mention',
		options.mention,
		GITHUB.mention,
		['user']
	);
	const issue = template<Issue>('issue', options.issue, GITHUB.issue, [
		'repo',
		'owner',
		'name',
		'number',
	]);
	const commit = template<Commit>('commit', options.commit, GITHUB.commit, [
		'repo',
		'owner',
		'name',
		'sha',
	]);
	const linkify = options.linkify;
	if (linkify !== undefined && typeof linkify !== 'boolean') {
		throw new ReferencesError(
			`linkify must be true or false, got ${typeof linkify}`
		);
	}
	const attrs = options.attrs;
	if (
		attrs !== undefined &&
		typeof attrs !== 'function' &&
		(attrs === null || typeof attrs !== 'object' || Array.isArray(attrs))
	) {
		throw new ReferencesError(
			'attrs must be an object of attributes or a function that gives one'
		);
	}

	function link_attrs(
		kind: ReferenceKind,
		href: string
	): Record<string, string> {
		const extra = typeof attrs === 'function' ? attrs(kind) : attrs;
		return { ...extra, href };
	}

	return {
		name: NAME,
		parse: {
			sequential: true,
			text(run) {
				const text = run.text;
				let checked = false;
				for (const match of text.matchAll(PATTERN)) {
					const groups = match.groups!;
					// an address is only matched so that nothing in it is a mention
					if (groups.email !== undefined) continue;
					const start = match.index;
					let end = start + match[0].length;
					let kind: ReferenceKind;
					let href: string | undefined;
					let label = match[0];
					let code = false;
					if (groups.url !== undefined) {
						if (linkify !== true) continue;
						end = start + url_end(groups.url);
						label = decode(text.slice(start, end));
						if (!HOST.test(label)) continue;
						kind = 'url';
						href = label.startsWith('www.') ? 'https://' + label : label;
					} else if (groups.user !== undefined) {
						if (mention === undefined) continue;
						kind = 'mention';
						href = mention({ user: groups.user });
					} else if (groups.cross !== undefined) {
						if (issue === undefined) continue;
						kind = 'issue';
						const { owner, name, cross } = groups;
						href = issue({
							repo: `${owner}/${name}`,
							owner,
							name,
							number: cross,
						});
					} else if (groups.issue !== undefined) {
						if (issue === undefined || home === undefined) continue;
						kind = 'issue';
						const [owner, name] = home;
						href = issue({
							repo: `${owner}/${name}`,
							owner,
							name,
							number: groups.issue,
						});
					} else {
						// a word of seven letters from a to f is not a commit
						const sha = groups.sha;
						if (commit === undefined || home === undefined) continue;
						if (!/\d/.test(sha) || !/[a-f]/.test(sha)) continue;
						kind = 'commit';
						const [owner, name] = home;
						href = commit({ repo: `${owner}/${name}`, owner, name, sha });
						label = sha.slice(0, 7);
						code = true;
					}
					if (href === undefined) continue;
					// asked once a run has something to link, most have nothing
					if (!checked) {
						if (in_link(run.parent)) return;
						checked = true;
					}
					const link = run.replace(start, end, 'link', link_attrs(kind, href));
					if (code) link.append('html', { tag: 'code' }).append('text', label);
					else link.append('text', label);
				}
			},
		},
	};
}
