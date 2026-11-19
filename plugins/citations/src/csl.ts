import { CitationsError } from './error.js';

/** a name as CSL JSON writes it */
export interface CslName {
	family?: string;
	given?: string;
	'non-dropping-particle'?: string;
	'dropping-particle'?: string;
	suffix?: string;
	/** a name that is not split, such as an organisation */
	literal?: string;
}

/** a date as CSL JSON writes it, `{ "date-parts": [[2020, 5]] }` */
export interface CslDate {
	'date-parts'?: (number | string)[][];
	literal?: string;
	raw?: string;
}

/** one entry of a CSL JSON file, the fields a bibliography here reads, a file can hold any others */
export interface CslItem {
	id: string | number;
	type?: string;
	title?: string;
	author?: CslName[];
	editor?: CslName[];
	issued?: CslDate;
	'container-title'?: string;
	publisher?: string;
	volume?: string | number;
	issue?: string | number;
	page?: string | number;
	DOI?: string;
	URL?: string;
	[field: string]: unknown;
}

/** what a citation and a bibliography show of an entry, plain json */
export interface CitationEntry {
	/** the id of the entry in the file, what `:cite[key]` names */
	key: string;
	/** the authors as a list shows them, `Ada Lovelace and Charles Babbage`, or the editors */
	authors?: string;
	/** the authors as a citation shows them, `Lovelace and Babbage`, `Lovelace et al.`, the title for none */
	short: string;
	/** the year it was issued */
	year?: string;
	title?: string;
	/** where it was published, `Journal of Examples 12(3), 45-67` */
	source?: string;
	publisher?: string;
	/** the doi as a url, or the url of the entry */
	url?: string;
}

function text(value: unknown): string | undefined {
	if (typeof value === 'number') return String(value);
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
}

/** the family name with its particle, `van Gogh` */
function family(name: CslName): string | undefined {
	const last = text(name.family);
	if (last === undefined) return text(name.literal);
	const particle = text(name['non-dropping-particle']);
	return particle === undefined ? last : `${particle} ${last}`;
}

function full(name: CslName): string | undefined {
	const literal = text(name.literal);
	if (literal !== undefined) return literal;
	const parts = [
		text(name.given),
		text(name['dropping-particle']),
		family(name),
	].filter((part) => part !== undefined);
	if (parts.length === 0) return undefined;
	const suffix = text(name.suffix);
	return parts.join(' ') + (suffix === undefined ? '' : `, ${suffix}`);
}

/** `a`, `a and b`, `a, b and c` */
function and(names: string[]): string {
	if (names.length < 3) return names.join(' and ');
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function names_of(item: CslItem): CslName[] {
	const list = Array.isArray(item.author) ? item.author : item.editor;
	return Array.isArray(list)
		? list.filter(
				(name): name is CslName => typeof name === 'object' && name !== null
			)
		: [];
}

function year_of(date: CslDate | undefined): string | undefined {
	if (typeof date !== 'object' || date === null) return undefined;
	const first = date['date-parts']?.[0]?.[0];
	const year = text(first);
	if (year !== undefined) return year;
	const written = text(date.literal) ?? text(date.raw);
	return written?.match(/\d{4}/)?.[0] ?? written;
}

function source_of(item: CslItem): string | undefined {
	const container = text(item['container-title']);
	const volume = text(item.volume);
	const issue = text(item.issue);
	const page = text(item.page);
	let numbers = volume ?? '';
	if (issue !== undefined) numbers += `(${issue})`;
	let out = [container, numbers === '' ? undefined : numbers]
		.filter((part) => part !== undefined)
		.join(' ');
	if (page !== undefined) out = out === '' ? page : `${out}, ${page}`;
	return out === '' ? undefined : out;
}

function url_of(item: CslItem): string | undefined {
	const doi = text(item.DOI);
	if (doi !== undefined)
		return /^https?:\/\//i.test(doi)
			? doi
			: `https://doi.org/${doi.replace(/^doi:/i, '')}`;
	return text(item.URL);
}

/** what a citation and a list show of an item */
export function entry_of(item: CslItem): CitationEntry {
	const key = String(item.id);
	const names = names_of(item);
	const fulls = names.map(full).filter((name) => name !== undefined);
	const families = names.map(family).filter((name) => name !== undefined);
	const title = text(item.title);
	const short =
		families.length === 0
			? (title ?? key)
			: families.length < 3
				? families.join(' and ')
				: `${families[0]} et al.`;
	const entry: CitationEntry = { key, short };
	if (fulls.length > 0) entry.authors = and(fulls);
	const year = year_of(item.issued);
	if (year !== undefined) entry.year = year;
	if (title !== undefined) entry.title = title;
	const source = source_of(item);
	if (source !== undefined) entry.source = source;
	const publisher = text(item.publisher);
	if (publisher !== undefined) entry.publisher = publisher;
	const url = url_of(item);
	if (url !== undefined) entry.url = url;
	return entry;
}

/** the entries of a CSL JSON file by key, a file that is not one throws a CitationsError */
export function read_csl(
	source: string,
	path: string
): Map<string, CitationEntry> {
	if (/\.bib$/i.test(path)) {
		throw new CitationsError(
			'bibliography',
			`${path} is BibTeX, export it as CSL JSON, which Zotero, JabRef and pandoc (pandoc refs.bib -t csljson -o refs.json) write`
		);
	}
	let items: unknown;
	try {
		items = JSON.parse(source);
	} catch (error) {
		throw new CitationsError(
			'bibliography',
			`${path} is not CSL JSON, it does not parse as json: ${(error as Error).message}`
		);
	}
	if (!Array.isArray(items)) {
		throw new CitationsError(
			'bibliography',
			`${path} is not CSL JSON, which is an array of entries`
		);
	}
	const entries = new Map<string, CitationEntry>();
	items.forEach((item, i) => {
		const id = (item as CslItem | null)?.id;
		if (
			typeof item !== 'object' ||
			item === null ||
			(typeof id !== 'string' && typeof id !== 'number') ||
			String(id).trim() === ''
		) {
			throw new CitationsError(
				'bibliography',
				`entry ${i} of ${path} has no id, every entry of CSL JSON needs one`
			);
		}
		const key = String(id);
		if (entries.has(key)) {
			throw new CitationsError(
				'bibliography',
				`${path} has two entries with the id ${JSON.stringify(key)}`
			);
		}
		entries.set(key, entry_of(item as CslItem));
	});
	return entries;
}
