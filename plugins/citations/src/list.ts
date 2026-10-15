import type { CitationEntry } from './csl.js';

/** how citations and the list read, `[1]` and a numbered list, or `(Lovelace 1843)` and a list by author */
export type CitationStyle = 'numeric' | 'author-date';

/** what the plugin leaves in `plugin_data.citations` */
export interface CitationsData {
	/** each key of each citation, in the order they are written */
	cited?: string[];
	/** an entry for each key the bibliography has, under `entry:` and the key */
	[entry: `entry:${string}`]: CitationEntry | undefined;
}

/** an entry as the list shows it */
export interface ListedEntry extends CitationEntry {
	/** the id of its item in the list, what a citation links to */
	id: string;
	/** `1` for numeric, what a citation of it reads as */
	label: string;
	/** the ids of the citations of it, in the order they are written */
	cited_by: string[];
}

/** the id of the list item of an entry, a space can not be in an id */
export function entry_id(key: string): string {
	return 'bib-' + key.replace(/\s/g, '-');
}

/** the id of the link of the nth key cited in a document, from 0 */
export function citation_id(n: number): string {
	return `cite-${n + 1}`;
}

/** what a citation reads as, the number of a numeric entry or names and a year */
export function citation_label(
	entry: CitationEntry,
	number: number,
	style: CitationStyle
): string {
	if (style === 'numeric') return String(number);
	return `${entry.short} ${entry.year ?? 'n.d.'}`;
}

/** the keys in the order they are first cited, each once, only those with an entry */
export function first_cited(
	cited: readonly string[],
	known: (key: string) => boolean
): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const key of cited) {
		if (seen.has(key)) continue;
		seen.add(key);
		if (known(key)) out.push(key);
	}
	return out;
}

const collator = new Intl.Collator('en', {
	sensitivity: 'base',
	numeric: true,
});

/**
 * the list a bibliography shows for the data of a document, numeric in the
 * order of first citation, author-date by author, year and title
 *
 * @example
 * bibliography_of(plugin_data.citations, 'numeric')[0].label; // '1'
 */
export function bibliography_of(
	data: CitationsData | undefined,
	style: CitationStyle = 'numeric'
): ListedEntry[] {
	if (data === undefined || data === null) return [];
	const cited = data.cited ?? [];
	const order = first_cited(cited, (key) => data[`entry:${key}`] !== undefined);
	const by: Record<string, string[]> = {};
	cited.forEach((key, n) => (by[key] ??= []).push(citation_id(n)));
	const listed = order.map((key, i): ListedEntry => {
		const entry = data[`entry:${key}`]!;
		return {
			...entry,
			id: entry_id(key),
			label: citation_label(entry, i + 1, style),
			cited_by: by[key],
		};
	});
	if (style === 'author-date') {
		listed.sort(
			(a, b) =>
				collator.compare(a.short, b.short) ||
				collator.compare(a.year ?? '', b.year ?? '') ||
				collator.compare(a.title ?? '', b.title ?? '')
		);
	}
	return listed;
}

/** a piece of the text of a list item, the title is a cite element and a url a link */
export interface EntryPart {
	kind: 'text' | 'title' | 'url';
	text: string;
}

/** with a full stop, unless it ends a sentence already */
function stop(text: string): string {
	return /[.?!]$/.test(text) ? text : text + '.';
}

/**
 * what a list item shows of an entry, in order, numeric is authors, title,
 * source, publisher, year, author-date has the year after the authors
 *
 * @example
 * entry_parts(entry, 'author-date').map((part) => part.text).join(' ');
 * // 'Ada Lovelace (1843). Notes on the Analytical Engine. Scientific Memoirs 3, 666-731.'
 */
export function entry_parts(
	entry: CitationEntry,
	style: CitationStyle = 'numeric'
): EntryPart[] {
	const parts: EntryPart[] = [];
	const text = (value: string | undefined) => {
		if (value !== undefined) parts.push({ kind: 'text', text: stop(value) });
	};
	const year = entry.year ?? 'n.d.';
	if (style === 'author-date') {
		if (entry.authors !== undefined) text(`${entry.authors} (${year})`);
		if (entry.title !== undefined)
			parts.push({ kind: 'title', text: stop(entry.title) });
		if (entry.authors === undefined) text(`(${year})`);
	} else {
		text(entry.authors);
		if (entry.title !== undefined)
			parts.push({ kind: 'title', text: stop(entry.title) });
	}
	text(entry.source);
	text(entry.publisher);
	if (style === 'numeric') text(entry.year);
	if (entry.url !== undefined) parts.push({ kind: 'url', text: entry.url });
	return parts;
}
