/**
 * pfm to the svelte core compile makes for the config, plus the mappings and
 * checks only an editor needs, compile errors become diagnostics
 */

import { compile, DirectiveError, FrontmatterError } from 'mdsvex';
import type { CompileOptions, CompileResult, TemplateEntry } from 'mdsvex';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { Cursor } from '@mdsvex/parse/cursor';
import {
	K_HTML,
	K_FRONTMATTER,
	K_IMPORT_STATEMENT,
} from '@mdsvex/render/html-cursor';
import type {
	CodeInformation,
	Mapping,
	MappingData,
} from '@mdsvex/render/mappings';

import { apply_edits, plain } from './edit';
import type { Edit } from './edit';
import { template_value_at, yaml_keys } from './keys';
import type { KeyRange } from './keys';

export type { Mapping, MappingData } from '@mdsvex/render/mappings';
export { template_value_at, yaml_keys } from './keys';

/** A <style> block found in the PFM source, with positions in both source and generated output. */
export interface StyleBlock {
	/** Byte offset of the CSS content start in the PFM source. */
	sourceStart: number;
	/** Byte offset of the CSS content end in the PFM source. */
	sourceEnd: number;
	/** Byte offset of the CSS content start in the generated Svelte code. */
	generatedStart: number;
	/** Byte offset of the CSS content end in the generated Svelte code. */
	generatedEnd: number;
}

/** A region in the PFM source to exclude from the markdown VirtualCode. */
export interface ExcludedRegion {
	/** Byte offset of the region start in the PFM source (includes opening tag/fence). */
	start: number;
	/** Byte offset of the region end in the PFM source (includes closing tag/fence). */
	end: number;
}

/** a compile error or warning, offsets index the pfm source */
export interface PfmDiagnostic {
	start: number;
	end: number;
	message: string;
	severity: 'error' | 'warning';
}

/** the data of a mapping this module adds, its capabilities are final */
export interface EditorMappingData extends MappingData {
	editor: true;
}

export interface PfmToSvelteOptions {
	/** the compile options the config gives, sourcemap and strict_directives are set here */
	compile?: Omit<CompileOptions, 'sourcemap' | 'strict_directives'>;
	/**
	 * the specifier typescript imports the export name of a virtual id from,
	 * undefined keeps the virtual id
	 */
	resolve?: (id: string, name: string) => string | undefined;
	/**
	 * report a directive no component renders, which a build rejects, only
	 * right when the config is known and no parse plugin could handle it
	 */
	report_directives?: boolean;
	/** a custom frontmatter parser runs at build, so built in parse failures are not reported */
	lenient_frontmatter?: boolean;
}

export interface PfmToSvelteResult {
	code: string;
	mappings: Mapping<MappingData>[];
	/** Style blocks found in the source, with positions for CSS VirtualCode extraction. */
	styleBlocks: StyleBlock[];
	/** Regions to exclude from the markdown VirtualCode (frontmatter, script, style). */
	excludedRegions: ExcludedRegion[];
	diagnostics: PfmDiagnostic[];
	/** the parsed frontmatter, undefined without any or when it failed to parse */
	metadata?: Record<string, unknown>;
	/** the template the document is wrapped in */
	template?: string;
	/** the yaml of the frontmatter, null without any */
	frontmatter: { start: number; end: number } | null;
	/** type aliases in the code whose properties are the props of each template and directive */
	probes: PropsProbe[];
}

/** names the props of a template or directive component, whether or not the document uses it */
export interface PropsProbe {
	kind: 'template' | 'directive';
	name: string;
	/** the template whose scope holds the directive, undefined for the root */
	template?: string;
	/** a type alias in the code, its properties are the props */
	alias: string;
}

const HOVER: CodeInformation = { semantic: true, navigation: true };
const CHECK: CodeInformation = { verification: true };
const PROP: CodeInformation = {
	verification: true,
	semantic: true,
	navigation: true,
};
const NONE: CodeInformation = {};

function editor_data(caps: CodeInformation): EditorMappingData {
	return { ...caps, nodeIndex: -1, role: 'content', editor: true };
}

function mapping(
	source: number,
	source_length: number,
	generated: number,
	generated_length: number,
	caps: CodeInformation
): Mapping<MappingData> {
	const m: Mapping<MappingData> = {
		sourceOffsets: [source],
		generatedOffsets: [generated],
		lengths: [source_length],
		data: editor_data(caps),
	};
	if (generated_length !== source_length)
		m.generatedLengths = [generated_length];
	return m;
}

interface Regions {
	frontmatter: { start: number; end: number } | null;
	excluded: ExcludedRegion[];
	styles: { valueStart: number; valueEnd: number }[];
}

/** the regions of root nodes the markdown and css codes need */
function classify(source: string): Regions {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	new PFMParser(tree).parse(source);
	const cursor = new Cursor(tree.get_buffer(), source);
	cursor.reset();
	const regions: Regions = { frontmatter: null, excluded: [], styles: [] };
	if (!cursor.goto_first_child()) return regions;
	do {
		const kind = cursor.kind;
		const tag = kind === K_HTML ? cursor.meta()?.tag : undefined;
		if (kind === K_FRONTMATTER) {
			regions.frontmatter = {
				start: cursor.value_start,
				end: cursor.value_end,
			};
		} else if (kind === K_IMPORT_STATEMENT || tag === 'script') {
			// compile hoists these into the instance script
		} else if (tag === 'style') {
			regions.styles.push({
				valueStart: cursor.value_start,
				valueEnd: cursor.value_end,
			});
		} else continue;
		regions.excluded.push({ start: cursor.start, end: cursor.end });
	} while (cursor.goto_next_sibling());
	return regions;
}

/** the offset of a 1 based line and column */
function offset_of(source: string, line: number, column: number): number {
	let at = 0;
	for (let l = 1; l < line; l++) {
		const nl = source.indexOf('\n', at);
		if (nl < 0) return source.length;
		at = nl + 1;
	}
	return Math.min(at + Math.max(column - 1, 0), source.length);
}

/** the trimmed text of a 1 based line */
function line_range(
	source: string,
	line: number
): { start: number; end: number } {
	const start = offset_of(source, line, 1);
	let end = source.indexOf('\n', start);
	if (end < 0) end = source.length;
	let s = start;
	while (s < end && /\s/.test(source[s])) s++;
	let e = end;
	while (e > s && /\s/.test(source[e - 1])) e--;
	return e > s ? { start: s, end: e } : { start, end };
}

function without_directives(
	templates: Record<string, TemplateEntry> | undefined
): Record<string, TemplateEntry> | undefined {
	if (templates === undefined) return undefined;
	const out: Record<string, TemplateEntry> = {};
	for (const name in templates) {
		const { directives: _, ...rest } = templates[name];
		out[name] = rest;
	}
	return out;
}

/** compile, a failure becomes a diagnostic and the next try leaves out what failed */
function compile_leniently(
	source: string,
	options: PfmToSvelteOptions,
	diagnostics: PfmDiagnostic[],
	frontmatter: { start: number; end: number } | null
): { result: CompileResult; metadata_known: boolean } {
	let opts: CompileOptions = {
		...options.compile,
		sourcemap: true,
		strict_directives: options.report_directives === true,
	};
	let metadata_known = true;
	let last: unknown;
	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			return { result: compile(source, opts), metadata_known };
		} catch (e) {
			last = e;
			if (e instanceof DirectiveError) {
				const start = offset_of(source, e.line, e.column);
				diagnostics.push({
					start,
					end: Math.min(start + e.directive.length, source.length),
					message: e.message,
					severity: 'error',
				});
				// an argument a snippet takes throws even when not strict
				opts = opts.strict_directives
					? { ...opts, strict_directives: false }
					: {
							...opts,
							directives: undefined,
							templates: without_directives(opts.templates),
						};
				continue;
			}
			if (e instanceof FrontmatterError) {
				const unparsed = /^(?:Unsupported frontmatter|frontmatter\.parse)/.test(
					e.message
				);
				if (!(unparsed && options.lenient_frontmatter)) {
					const line = line_range(source, e.line);
					// a template error is about its value
					const value =
						unparsed || frontmatter === null
							? null
							: template_value_at(source, line.end, frontmatter);
					diagnostics.push({
						...(value !== null && value.end > value.start ? value : line),
						message: e.message,
						severity: 'error',
					});
				}
				if (unparsed) {
					opts = { ...opts, frontmatter: { parse: () => ({}) } };
					metadata_known = false;
				} else opts = { ...opts, template: false };
				continue;
			}
			throw e;
		}
	}
	throw last;
}

const METADATA_EXPORT = 'export const metadata = ';
const IMPORT_LINE = /^import (.+) from '(mdsvex:[^']*)';$/gm;
const NAMED = /^\{ (.*) \}$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const has_own = Object.prototype.hasOwnProperty;
// svelte and preprocessors find script and style tags even inside strings
const TAG = /<(?=\/?(?:script|style))/gi;

/**
 * a props type alias for every template and directive the config knows, so
 * completions work while the document does not compile or use them
 */
function props_probes(options: PfmToSvelteOptions): {
	text: string;
	list: PropsProbe[];
} {
	const list: PropsProbe[] = [];
	let text = '';
	const resolve = options.resolve;
	if (resolve === undefined) return { text, list };
	const add = (
		kind: PropsProbe['kind'],
		name: string,
		template: string | undefined,
		specifier: string,
		member: string
	) => {
		const file = resolve(specifier, member);
		if (file === undefined) return;
		const alias = `__mdsvex_props_${list.length}`;
		text +=
			`type ${alias} = import('svelte').ComponentProps<` +
			`typeof import(${JSON.stringify(file)})[${JSON.stringify(member)}]>;\n`;
		list.push(
			template === undefined
				? { kind, name, alias }
				: { kind, name, template, alias }
		);
	};
	const templates = options.compile?.templates ?? {};
	for (const name of Object.keys(templates)) {
		const entry = templates[name];
		add('template', name, undefined, entry.specifier, 'default');
		for (const d of entry.directives ?? [])
			for (const n of d.names) add('directive', n, name, d.specifier, n);
	}
	for (const d of options.compile?.directives ?? [])
		for (const n of d.names) add('directive', n, undefined, d.specifier, n);
	return { text, list };
}

/** metadata as an object literal, each key mapped to its frontmatter key */
function object_literal(
	metadata: Record<string, unknown>,
	keys: Map<string, KeyRange>,
	caps: CodeInformation,
	open: string,
	close: string,
	types: Record<string, string> = {}
): { text: string; mappings: Mapping<MappingData>[] } {
	let text = open;
	const mappings: Mapping<MappingData>[] = [];
	let first = true;
	for (const name of Object.keys(metadata)) {
		const json = JSON.stringify(metadata[name]);
		if (json === undefined) continue;
		if (!first) text += ', ';
		first = false;
		const written = IDENTIFIER.test(name) ? name : JSON.stringify(name);
		const range = keys.get(name);
		if (range !== undefined)
			mappings.push(
				mapping(
					range.start,
					range.end - range.start,
					text.length,
					written.length,
					caps
				)
			);
		text += `${written}: ${json.replace(TAG, '\\u003c')}`;
		if (has_own.call(types, name)) text += ` as ${types[name]}`;
	}
	return { text: text + close, mappings };
}

interface Imported {
	/** the export name, default for a default import */
	name: string;
	/** where to point at it inside the text of edit */
	edit: Edit<MappingData>;
	at: number;
	length: number;
}

/** one import statement per binding, from the file each resolves to */
function rewrite_imports(
	code: string,
	resolve: PfmToSvelteOptions['resolve'],
	edits: Edit<MappingData>[]
): Map<string, Imported> {
	const imported = new Map<string, Imported>();
	if (resolve === undefined) return imported;
	IMPORT_LINE.lastIndex = 0;
	let line: RegExpExecArray | null;
	while ((line = IMPORT_LINE.exec(code)) !== null) {
		const id = line[2];
		const bindings: { name: string; local: string }[] = [];
		for (const part of split_clause(line[1])) {
			const named = NAMED.exec(part);
			if (named === null) bindings.push({ name: 'default', local: part });
			else
				for (const spec of named[1].split(', ')) {
					const as = spec.lastIndexOf(' as ');
					const name = spec.slice(0, as);
					bindings.push({
						name: name.startsWith('"') ? JSON.parse(name) : name,
						local: spec.slice(as + 4),
					});
				}
		}
		const edit: Edit<MappingData> = {
			start: line.index,
			end: line.index + line[0].length,
			text: '',
			mappings: [],
		};
		const kept: string[] = [];
		for (const b of bindings) {
			const spec = resolve(id, b.name);
			if (spec === undefined) {
				const written = IDENTIFIER.test(b.name)
					? b.name
					: JSON.stringify(b.name);
				kept.push(`${written} as ${b.local}`);
				continue;
			}
			const from = ` from ${JSON.stringify(spec)};\n`;
			if (b.name === 'default') {
				edit.text += 'import ';
				imported.set(b.local, {
					name: 'default',
					edit,
					at: edit.text.length,
					length: b.local.length,
				});
				edit.text += b.local + from;
			} else {
				const written = IDENTIFIER.test(b.name)
					? b.name
					: JSON.stringify(b.name);
				edit.text += 'import { ';
				imported.set(b.local, {
					name: b.name,
					edit,
					at: edit.text.length,
					length: written.length,
				});
				edit.text += `${written} as ${b.local} }` + from;
			}
		}
		if (kept.length === bindings.length) continue;
		// unresolved bindings keep the virtual id, typescript types them any
		if (kept.length !== 0)
			edit.text += `import { ${kept.join(', ')} } from '${id}';\n`;
		edit.text = edit.text.slice(0, -1);
		edits.push(edit);
	}
	return imported;
}

/** a default and named clause, split at the comma between them */
function split_clause(clause: string): string[] {
	const brace = clause.indexOf('{');
	if (brace <= 0) return [clause];
	return [clause.slice(0, brace).replace(/,\s*$/, ''), clause.slice(brace)];
}

interface NodeMappings {
	node?: Mapping<MappingData>;
	open?: Mapping<MappingData>;
	close?: Mapping<MappingData>;
}

function generated_range(m: Mapping<MappingData>): [number, number] {
	const g = m.generatedOffsets[0];
	return [g, g + (m.generatedLengths ? m.generatedLengths[0] : m.lengths[0])];
}

function trimmed(
	source: string,
	start: number,
	end: number
): { start: number; end: number } | null {
	while (start < end && /\s/.test(source[start])) start++;
	while (end > start && /\s/.test(source[end - 1])) end--;
	return end > start ? { start, end } : null;
}

/** what to hover for a replaced element, its tag or directive name, its syntax or its first character */
function anchor_of(
	source: string,
	nodes: NodeMappings
): { start: number; end: number } | null {
	const node = nodes.node!;
	const ns = node.sourceOffsets[0];
	const name = /^(<|:+)([A-Za-z_][\w:-]*)/.exec(source.slice(ns, ns + 128));
	if (name !== null) {
		const at = ns + name[1].length;
		return { start: at, end: at + name[2].length };
	}
	const open = nodes.open;
	if (open !== undefined && open.lengths[0] > 0) {
		const s = open.sourceOffsets[0];
		const t = trimmed(source, s, s + open.lengths[0]);
		if (t !== null) return t;
	}
	const close = nodes.close;
	if (close !== undefined && close.lengths[0] > 0) {
		const s = close.sourceOffsets[0];
		const t = trimmed(source, s, s + close.lengths[0]);
		if (t !== null) return t;
	}
	if (node.lengths[0] === 0) return null;
	return { start: ns, end: ns + 1 };
}

/**
 * the attribute names and values of typed attributes, a name is a prop the
 * author wrote for an element, so a component lacking it is no error, a value
 * or expression is checked as ever
 */
function attribute_parts(
	text: string
): { start: number; end: number; name: boolean }[] {
	const parts: { start: number; end: number; name: boolean }[] = [];
	let i = 0;
	const braces = (from: number) => {
		let depth = 0;
		for (let j = from; j < text.length; j++) {
			const c = text[j];
			if (c === '"' || c === "'" || c === '`') {
				const end = text.indexOf(c, j + 1);
				j = end < 0 ? text.length : end;
			} else if (c === '{') depth++;
			else if (c === '}' && --depth === 0) return j + 1;
		}
		return text.length;
	};
	while (i < text.length) {
		const c = text[i];
		if (/\s|\//.test(c)) {
			i++;
		} else if (c === '{') {
			const end = braces(i);
			parts.push({ start: i, end, name: false });
			i = end;
		} else {
			const name = /^[^\s=>/"'{]+/.exec(text.slice(i));
			if (name === null) {
				i++;
				continue;
			}
			parts.push({ start: i, end: i + name[0].length, name: true });
			i += name[0].length;
			if (text[i] !== '=') continue;
			i++;
			const q = text[i];
			let end: number;
			if (q === '"' || q === "'") {
				const close = text.indexOf(q, i + 1);
				end = close < 0 ? text.length : close + 1;
			} else if (q === '{') end = braces(i);
			else end = i + (/^[^\s>]*/.exec(text.slice(i))?.[0].length ?? 0);
			parts.push({ start: i, end, name: false });
			i = end;
		}
	}
	return parts;
}

interface Arg {
	key: KeyRange;
	value: KeyRange;
}

/** the args of the directive at start, after its name and label */
function directive_args(source: string, start: number, end: number): Arg[] {
	let i = start;
	while (i < end && source[i] === ':') i++;
	while (i < end && /[\w-]/.test(source[i])) i++;
	if (source[i] !== '[') return [];
	let depth = 0;
	for (; i < end; i++) {
		const c = source[i];
		if (c === '\\') i++;
		else if (c === '[') depth++;
		else if (c === ']' && --depth === 0) break;
	}
	if (source[i + 1] !== '(') return [];
	const args: Arg[] = [];
	i += 2;
	const ARG =
		/\s*([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,)\s]*))\s*(,|\))/y;
	ARG.lastIndex = i;
	let m: RegExpExecArray | null;
	while (ARG.lastIndex < end && (m = ARG.exec(source)) !== null) {
		const key_at = m.index + m[0].indexOf(m[1]);
		const raw = m[2] ?? m[3] ?? m[4];
		const quoted = m[2] !== undefined || m[3] !== undefined;
		const close = m.index + m[0].length - 1;
		let value_end = close;
		while (/[\s,)]/.test(source[value_end - 1]) && value_end > key_at)
			value_end--;
		if (quoted) value_end--;
		args.push({
			key: { start: key_at, end: key_at + m[1].length },
			value: { start: value_end - raw.length, end: value_end },
		});
		if (m[5] === ')') break;
	}
	return args;
}

const ATTRIBUTE_NAME: CodeInformation = {
	completion: true,
	semantic: true,
	navigation: true,
};
const ATTRIBUTE_VALUE: CodeInformation = {
	verification: true,
	completion: true,
	semantic: true,
	navigation: true,
};

/** typed attributes of a replaced element, split so only their values are checked */
function split_attributes(
	m: Mapping<MappingData>,
	code: string
): Mapping<MappingData>[] {
	const len = m.lengths[0];
	if (m.generatedLengths && m.generatedLengths[0] !== len) return [];
	const g = m.generatedOffsets[0];
	const s = m.sourceOffsets[0];
	// emptied, the parts replace it
	m.data = editor_data(NONE);
	return attribute_parts(code.slice(g, g + len)).map((p) =>
		mapping(
			s + p.start,
			p.end - p.start,
			g + p.start,
			p.end - p.start,
			p.name ? ATTRIBUTE_NAME : ATTRIBUTE_VALUE
		)
	);
}

/** the svelte core compile makes of source with options, with its mappings */
export function pfmToSvelte(
	source: string,
	options: PfmToSvelteOptions = {}
): PfmToSvelteResult {
	const regions = classify(source);
	const diagnostics: PfmDiagnostic[] = [];
	const { result, metadata_known } = compile_leniently(
		source,
		options,
		diagnostics,
		regions.frontmatter
	);
	const original = result.code;
	const mappings = (result.mappings ?? []).map(plain);
	const edits: Edit<MappingData>[] = [];
	const metadata = metadata_known ? result.metadata : undefined;

	for (const w of result.warnings ?? []) {
		const start = offset_of(source, w.start.line, w.start.column + 1);
		const tag = /^<([^\s>]*)/.exec(w.message)?.[1] ?? '';
		diagnostics.push({
			start,
			end: Math.min(start + 1 + tag.length, source.length),
			message: w.message,
			severity: 'warning',
		});
	}

	// frontmatter keys map to the keys of the metadata export
	const keys =
		regions.frontmatter === null
			? new Map<string, KeyRange>()
			: yaml_keys(
					source.slice(regions.frontmatter.start, regions.frontmatter.end),
					regions.frontmatter.start
				);
	const exported = original.indexOf(METADATA_EXPORT);
	if (exported >= 0) {
		const json = exported + METADATA_EXPORT.length;
		if (!metadata_known) {
			// what a custom parser would give is unknown, so reads type any
			edits.push({
				start: exported,
				end: json,
				text: 'export const metadata: Record<string, any> = ',
			});
		} else if (metadata !== undefined) {
			// the same object with bare keys, typescript spans a quoted key with its quotes
			const end = original.indexOf(';\n', json);
			const names = Object.keys(options.compile?.templates ?? {});
			// the template key holds a template name or false, so it types as their union
			const types: Record<string, string> =
				names.length === 0
					? {}
					: {
							template: [...names.map((n) => JSON.stringify(n)), 'false'].join(
								' | '
							),
						};
			const object = object_literal(metadata, keys, HOVER, '{', '}', types);
			edits.push({
				start: json,
				end: end < 0 ? original.length : end,
				text: object.text,
				mappings: object.mappings,
			});
		}
	}

	const imported = rewrite_imports(original, options.resolve, edits);

	if (imported.size !== 0) {
		const by_node = new Map<number, NodeMappings>();
		// content a node maps itself, which for typed html is its attributes
		const typed = new Map<number, Mapping<MappingData>[]>();
		for (const m of mappings) {
			const data = m.data;
			if ((data as EditorMappingData).editor || data.nodeIndex < 0) continue;
			let entry = by_node.get(data.nodeIndex);
			if (entry === undefined) by_node.set(data.nodeIndex, (entry = {}));
			if (data.role === 'node') entry.node ??= m;
			else if (data.role === 'open_syntax') entry.open ??= m;
			else if (data.role === 'close_syntax') entry.close ??= m;
			else if (data.role === 'content') {
				const list = typed.get(data.nodeIndex);
				if (list === undefined) typed.set(data.nodeIndex, [m]);
				else list.push(m);
			}
		}
		for (const nodes of by_node.values()) {
			if (nodes.node === undefined) continue;
			const [g] = generated_range(nodes.node);
			const local = /^<([A-Za-z_$][\w$]*)/.exec(
				original.slice(g, g + 200)
			)?.[1];
			const target = local === undefined ? undefined : imported.get(local);
			if (target === undefined) continue;
			// the syntax maps onto every token of the component tag, which would
			// report props the author never wrote and hover each of them
			for (const m of [nodes.open, nodes.close])
				if (m !== undefined) m.data = editor_data(NONE);
			for (const m of typed.get(nodes.node.data.nodeIndex) ?? [])
				mappings.push(...split_attributes(m, original));
			const anchor = anchor_of(source, nodes);
			if (anchor !== null) {
				target.edit.mappings!.push(
					mapping(
						anchor.start,
						anchor.end - anchor.start,
						target.at,
						target.length,
						HOVER
					)
				);
			}
			if (!local!.includes('_MDSVEX_D_') || nodes.open === undefined) continue;
			// directive args are props the author wrote, so they are checked
			const [open_start, open_end] = generated_range(nodes.open);
			const tag_end = original.indexOf('>', open_start);
			const node_start = nodes.node.sourceOffsets[0];
			let from = open_start;
			for (const arg of directive_args(
				source,
				node_start,
				node_start + nodes.node.lengths[0]
			)) {
				const key = source.slice(arg.key.start, arg.key.end);
				const at = original.indexOf(` ${key}=`, from);
				if (at < 0 || at > Math.min(tag_end, open_end)) break;
				const key_at = at + 1;
				mappings.push(
					mapping(arg.key.start, key.length, key_at, key.length, PROP)
				);
				const value_at = key_at + key.length + 1;
				if (original[value_at] === '"') {
					const value_end = original.indexOf('"', value_at + 1);
					mappings.push(
						mapping(
							arg.value.start,
							arg.value.end - arg.value.start,
							value_at + 1,
							value_end - value_at - 1,
							PROP
						)
					);
					from = value_end;
				} else from = value_at;
			}
		}
	}

	// the template takes every frontmatter key as a prop, check each against its type
	const template_import = [...imported].find(
		([, i]) => i.name === 'default' && result.template !== undefined
	);
	if (template_import !== undefined && metadata !== undefined) {
		const [local, target] = template_import;
		const value = metadata.template;
		const at = keys.get('template');
		if (typeof value === 'string' && at !== undefined) {
			const v = source.indexOf(value, at.end);
			const eol = source.indexOf('\n', at.end);
			if (v >= 0 && (eol < 0 || v < eol))
				target.edit.mappings!.push(
					mapping(v, value.length, target.at, target.length, HOVER)
				);
		}
		const script = /<script(?![^>]*\bmodule\b)[^>]*>/.exec(original);
		const close =
			script === null ? -1 : original.indexOf('</script>', script.index);
		if (close >= 0) {
			const object = object_literal(metadata, keys, CHECK, '\n;({ ', ' })');
			edits.push({
				start: close,
				end: close,
				text:
					object.text +
					` satisfies Partial<import('svelte').ComponentProps<typeof ${local}>>` +
					' & Record<string, unknown>;\n',
				mappings: object.mappings,
			});
		}
	}

	const probes = props_probes(options);
	if (probes.text !== '') {
		const script = /<script(?![^>]*\bmodule\b)[^>]*>/.exec(original);
		const close =
			script === null ? -1 : original.indexOf('</script>', script.index);
		edits.push(
			close >= 0
				? { start: close, end: close, text: '\n' + probes.text }
				: {
						start: 0,
						end: 0,
						text: `<script lang="ts">\n${probes.text}</script>\n`,
					}
		);
	}

	const { code, mappings: moved } = apply_edits(original, mappings, edits);

	// style content is copied verbatim, so find it in the output
	const styleBlocks: StyleBlock[] = [];
	for (const sp of regions.styles) {
		const css = source.slice(sp.valueStart, sp.valueEnd);
		const at = code.indexOf(css);
		if (at !== -1) {
			styleBlocks.push({
				sourceStart: sp.valueStart,
				sourceEnd: sp.valueEnd,
				generatedStart: at,
				generatedEnd: at + css.length,
			});
		}
	}

	return {
		code,
		mappings: moved,
		styleBlocks,
		excludedRegions: regions.excluded,
		diagnostics,
		metadata,
		template: result.template,
		frontmatter: regions.frontmatter,
		probes: probes.list,
	};
}
