import type {
	Bundle,
	DirectiveContext,
	NodeView,
	PluginContext,
	TaskContext,
} from 'mdsvex/compile';

import { read_csl } from './csl.js';
import type { CitationEntry } from './csl.js';
import { CitationsError, PACKAGE } from './error.js';
import {
	bibliography_of,
	citation_id,
	citation_label,
	entry_id,
	entry_parts,
	first_cited,
} from './list.js';
import type { CitationsData, CitationStyle } from './list.js';

export { CitationsError } from './error.js';
export type { CitationsErrorCode } from './error.js';
export type { CitationEntry, CslDate, CslItem, CslName } from './csl.js';
export { bibliography_of, citation_id, entry_id, entry_parts } from './list.js';
export type {
	CitationsData,
	CitationStyle,
	EntryPart,
	ListedEntry,
} from './list.js';

/** the key of plugin_data */
const NAME = 'citations';
/** the frontmatter key that names the bibliography of a document */
const KEY = 'bibliography';
const STYLES: readonly CitationStyle[] = ['numeric', 'author-date'];

export interface CitationsOptions {
	/**
	 * the CSL JSON file a document cites from when its frontmatter names
	 * none, absolute or relative to the working directory
	 */
	bibliography?: string;
	/** `numeric` by default, `[1]` and a numbered list, `author-date` is `(Lovelace 1843)` and a list by author */
	style?: CitationStyle;
}

/** one key of a citation as its component gets it */
export interface Cited {
	key: string;
	/** what it reads as, the key while its entry is not known and for a key the file does not have */
	label: string;
	/** the id of its link, which the list links back to */
	id: string;
	/** the list item of its entry, none for a key the file does not have */
	href?: string;
}

declare module 'mdsvex/compile' {
	interface PluginData {
		citations?: CitationsData;
	}
}

const ABSOLUTE = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/;
const ROOT = /^(?:[A-Za-z]:\/|\/\/[^/]+\/[^/]+\/|\/)/;

/** forward slashes, as vite names a file, with no dot segments */
function normal(path: string): string {
	const slashed = path.replace(/\\/g, '/');
	const root = ROOT.exec(slashed)?.[0] ?? '';
	const out: string[] = [];
	for (const part of slashed.slice(root.length).split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') out.pop();
		else out.push(part);
	}
	return root + out.join('/');
}

function directory(path: string): string {
	const slashed = path.replace(/\\/g, '/');
	return slashed.slice(0, slashed.lastIndexOf('/') + 1);
}

/** the option as an absolute path, relative to the working directory */
function option_path(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'string' || value.trim() === '') {
		throw new CitationsError(
			'option',
			`bibliography must be the path of a CSL JSON file, got ${JSON.stringify(value)}`
		);
	}
	if (ABSOLUTE.test(value)) return normal(value);
	const cwd = (globalThis as { process?: { cwd?(): string } }).process?.cwd?.();
	if (cwd === undefined) {
		throw new CitationsError(
			'option',
			`bibliography ${JSON.stringify(value)} is relative and there is no working directory here, give an absolute path`
		);
	}
	return normal(cwd + '/' + value);
}

/** the file a document cites from, its frontmatter first, then the option */
function bibliography_path(
	ctx: PluginContext | DirectiveContext,
	fallback: string | undefined
): string {
	const written = (ctx.frontmatter as Record<string, unknown> | undefined)?.[
		KEY
	];
	if (written === undefined || written === null) {
		if (fallback !== undefined) return fallback;
		throw new CitationsError(
			'no_bibliography',
			`${ctx.filename ?? 'the document'} cites and names no bibliography, add bibliography: ./refs.json to its frontmatter or give the plugin a bibliography`
		);
	}
	if (typeof written !== 'string' || written.trim() === '') {
		throw new CitationsError(
			'bibliography',
			`the frontmatter key ${KEY} must be the path of a CSL JSON file, got ${JSON.stringify(written)}`
		);
	}
	if (ABSOLUTE.test(written)) return normal(written);
	const filename = ctx.filename;
	if (filename === undefined) {
		throw new CitationsError(
			'bibliography',
			`the frontmatter names the bibliography ${written} relative to a document the compile was given no filename for`
		);
	}
	return normal(directory(filename) + written);
}

/** read once for every document a compiler takes, and again once the host says the file changed */
function load(
	task: TaskContext,
	path: string
): Promise<Map<string, CitationEntry>> {
	return task.cached(path, async () => {
		let reading: Promise<string>;
		try {
			reading = task.read(path);
		} catch {
			throw new CitationsError(
				'no_bibliography',
				`the compile can not read ${path}, it was given no read option, the vite plugin has one, compile_async takes one`
			);
		}
		const source = await reading.catch((error: Error) => {
			throw new CitationsError(
				'bibliography',
				`${path} could not be read: ${error.message}`
			);
		});
		return read_csl(source, path);
	});
}

/** the keys of `:cite[a, b]`, in order */
function keys_of(node: NodeView): string[] {
	return node.text_content
		.split(',')
		.map((key) => key.trim())
		.filter((key) => key !== '');
}

/** what each key reads as, numbered among the keys before it that the file has */
function cites_of(
	keys: string[],
	first: number,
	cited: readonly string[],
	entry: (key: string) => CitationEntry | undefined,
	style: CitationStyle
): Cited[] {
	const order = first_cited(cited, (key) => entry(key) !== undefined);
	return keys.map((key, i) => {
		const id = citation_id(first + i);
		const found = entry(key);
		if (found === undefined) return { key, label: key, id };
		return {
			key,
			label: citation_label(found, order.indexOf(key) + 1, style),
			id,
			href: '#' + entry_id(key),
		};
	});
}

function set_cites(node: NodeView, cites: Cited[], style: CitationStyle) {
	node.attrs.args = {
		...node.attrs.args,
		cites: JSON.stringify(cites),
		style,
	};
}

/** the citations of a document, in the order they are written */
function find(parent: NodeView, citations: NodeView[]): void {
	for (let child = parent.first_child; child !== null; child = child.next) {
		const type = child.type;
		if (type === 'text') continue;
		if (type === 'directive_inline' && child.attrs.name === 'cite') {
			citations.push(child);
			continue;
		}
		find(child, citations);
	}
}

/** a json arg as its value, undefined when it is missing or no json */
function parsed<T>(json: string | undefined): T | undefined {
	if (json === undefined) return undefined;
	try {
		return JSON.parse(json) as T;
	} catch {
		return undefined;
	}
}

/** a citation in plain text, as Cite renders it */
function cite_text(args: Readonly<Record<string, string>>): string {
	const cites = parsed<Cited[]>(args.cites) ?? [];
	if (cites.length === 0) return '';
	const labels = cites.map((cite) => cite.label);
	return args.style === 'author-date'
		? '(' + labels.join('; ') + ')'
		: '[' + labels.join(', ') + ']';
}

/** the bibliography in plain text, its label and then an entry to a block, as Bibliography renders it */
function bibliography_text(
	args: Readonly<Record<string, string>>,
	label: string
): string {
	const style = args.style === 'author-date' ? 'author-date' : 'numeric';
	const entries = bibliography_of(parsed<CitationsData>(args.data), style);
	if (entries.length === 0) return '';
	const blocks = entries.map((entry) =>
		entry_parts(entry, style)
			.map((part) => part.text)
			.join(' ')
	);
	return (label === '' ? blocks : [label, ...blocks]).join('\n\n');
}

/**
 * citations from a CSL JSON bibliography, `:cite[key]` and `:cite[a, b]` in
 * the text, and a `::bibliography` that lists every entry the document
 * cites, each citation links to its entry and each entry back
 *
 * @example
 * import { citations } from '@mdsvex/plugin-citations';
 *
 * mdsvex({ plugins: [citations({ bibliography: 'src/refs.json' })] });
 */
export function citations(options: CitationsOptions = {}): Bundle {
	const fallback = option_path(options.bibliography);
	const style = options.style ?? 'numeric';
	if (!STYLES.includes(style)) {
		throw new CitationsError(
			'option',
			`style must be 'numeric' or 'author-date', got ${JSON.stringify(style)}`
		);
	}

	return {
		name: NAME,
		module: `${PACKAGE}/directives`,
		directives: {
			cite: {
				text: cite_text,
				parse(node, ctx) {
					if (node.type !== 'directive_inline') {
						ctx.warn(
							'not_inline',
							'cite is a citation in the text, write :cite[key] inside a paragraph',
							node
						);
						return;
					}
					return () => {
						const keys = keys_of(node);
						if (keys.length === 0) {
							ctx.warn('no_key', ':cite names no key, write :cite[key]', node);
							return;
						}
						const path = bibliography_path(ctx, fallback);
						const first = (ctx.data.cited as string[] | undefined)?.length ?? 0;
						for (const key of keys) ctx.add('cited', key);
						// shown while the file loads
						set_cites(
							node,
							keys.map((key, i) => ({
								key,
								label: key,
								id: citation_id(first + i),
							})),
							style
						);
						ctx.defer(node, async (node, task) => {
							const entries = await load(task, path);
							for (const key of keys) {
								const entry = entries.get(key);
								if (entry === undefined) {
									task.warn(
										'unknown_key',
										`${path} has no entry ${JSON.stringify(key)}, the citation shows the key`,
										node
									);
								} else task.set(`entry:${key}`, { ...entry });
							}
							const cited = (task.data.cited as string[] | undefined) ?? [];
							set_cites(
								node,
								cites_of(keys, first, cited, (key) => entries.get(key), style),
								style
							);
						});
					};
				},
			},
			bibliography: {
				text: bibliography_text,
				parse(node, ctx) {
					if (node.type !== 'directive_leaf') {
						ctx.warn(
							'not_a_leaf',
							'bibliography lists nothing as a container or inline, write ::bibliography on a line of its own',
							node
						);
						return;
					}
					// in the order they are written, no block directive is revoked
					const lists: NodeView[] = (ctx.scratch.lists ??= []);
					// a second list reads nothing, the first reads the context until the document hook
					node.attrs.args =
						lists.length > 0
							? { ...node.attrs.args, data: '{}', style }
							: { ...node.attrs.args, style };
					lists.push(node);
				},
			},
		},
		parse: {
			// numbers and ids count every citation of the document, which only the whole tree has
			document(root, ctx) {
				const data = ctx.data as unknown as CitationsData;
				const cited = data.cited;
				if (cited === undefined || cited.length === 0) return;
				const citations: NodeView[] = [];
				find(root, citations);
				const lists: NodeView[] = ctx.scratch.lists ?? [];
				const entry = (key: string) => data[`entry:${key}`];
				let n = 0;
				for (const node of citations) {
					const keys = keys_of(node);
					if (keys.length === 0) continue;
					set_cites(node, cites_of(keys, n, cited, entry, style), style);
					n += keys.length;
				}
				lists.forEach((list, i) => {
					if (i > 0) {
						ctx.warn(
							'more_than_one',
							'a document has one ::bibliography, this one lists nothing',
							list
						);
					}
					// data ahead of style keeps the compiled args as they were
					const { style: written, ...args } = list.attrs.args ?? {};
					list.attrs.args = {
						...args,
						data: i > 0 ? '{}' : JSON.stringify(data),
						style: written ?? style,
					};
				});
			},
		},
	};
}
