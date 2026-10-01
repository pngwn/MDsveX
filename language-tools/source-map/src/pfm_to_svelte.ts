/**
 * PFM to Svelte component transform with source mappings.
 *
 * Takes PFM source, parses it, and produces a valid Svelte component string
 * along with Volar-compatible source mappings. The output is suitable for
 * feeding into svelte2tsx for TypeScript virtual code generation.
 *
 * Pipeline:
 *   PFM source -> parse -> classify nodes -> build <script> block -> render body -> mappings
 */

import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { Cursor } from '@mdsvex/parse/cursor';
import {
	_emit,
	_mapped_begin,
	_mapped_end,
	_node,
	_resolve_offset_mappings,
	K_HTML,
	K_LINE_BREAK,
	K_FRONTMATTER,
	K_IMPORT_STATEMENT,
} from '@mdsvex/render/html-cursor';
import {
	MapSink,
	P_STRUCTURE,
	P_SVELTE,
	R_CONTENT,
	R_NODE,
	record_code,
} from '@mdsvex/render/mappings';
import type { Mapping, MappingData } from '@mdsvex/render/mappings';

export type { Mapping, MappingData } from '@mdsvex/render/mappings';

// mappings outside any node carry node index -1
const SVELTE_CONTENT = record_code(P_SVELTE, R_CONTENT);
const STRUCTURE_NODE = record_code(P_STRUCTURE, R_NODE);

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

export interface PfmToSvelteResult {
	code: string;
	mappings: Mapping<MappingData>[];
	/** Style blocks found in the source, with positions for CSS VirtualCode extraction. */
	styleBlocks: StyleBlock[];
	/** Regions to exclude from the markdown VirtualCode (frontmatter, script, style). */
	excludedRegions: ExcludedRegion[];
}

/** regex to extract top-level YAML key-value pairs (valid JS identifiers only). */
const YAML_KV_RE = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:(.*)/gm;

interface YamlEntry {
	name: string;
	/** byte offset of the key name within the PFM source. */
	sourceOffset: number;
	/** JavaScript literal representation of the value. */
	jsValue: string;
}

/**
 * Convert a YAML scalar value to a JavaScript literal string.
 * Handles numbers, booleans, null, and falls back to string.
 */
function yamlValueToJs(raw: string): string {
	const v = raw.trim();
	if (v === '' || v === '~' || v === 'null') return 'null';
	if (v === 'true') return 'true';
	if (v === 'false') return 'false';
	// integer or float
	if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v)) return v;
	// block scalar indicator (|, >, |-, >+, etc.), can't parse inline
	if (/^[|>]/.test(v)) return '"" as string';
	// inline array [a, b] or object {a: b}, too complex, fall back
	if (/^\[/.test(v) || /^\{/.test(v)) return `${v} as any`;
	// plain string, quote it, escaping internal quotes and backslashes
	return JSON.stringify(v);
}

/**
 * Extract top-level YAML key-value pairs from frontmatter text.
 * Only extracts keys that are valid JavaScript identifiers.
 * Values are converted to JavaScript literals for type inference.
 */
function extractYamlEntries(
	yaml: string,
	yamlSourceOffset: number
): YamlEntry[] {
	const entries: YamlEntry[] = [];
	YAML_KV_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = YAML_KV_RE.exec(yaml)) !== null) {
		entries.push({
			name: match[1],
			sourceOffset: yamlSourceOffset + match.index,
			jsValue: yamlValueToJs(match[2]),
		});
	}
	return entries;
}

/**
 * Transform PFM source into a valid Svelte component with source mappings.
 *
 * - Frontmatter YAML keys become `let key: any;` declarations in `<script>`
 * - Import statements become verbatim imports in `<script>`
 * - Explicit `<script>` tags are merged into the generated `<script>` block
 * - Body content is rendered as Svelte markup via the existing HTML renderer
 */
export function pfmToSvelte(source: string): PfmToSvelteResult {
	// parse
	const tree = new TreeBuilder(source.length >> 3 || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	const buf = tree.get_buffer();

	// classify root children
	const cursor = new Cursor(buf, source);
	cursor.reset();

	let frontmatterNode: { valueStart: number; valueEnd: number } | null = null;
	const importNodes: { valueStart: number; valueEnd: number }[] = [];
	const scriptBodies: { valueStart: number; valueEnd: number }[] = [];
	const bodySkipSet = new Set<number>();
	const excludedRegions: ExcludedRegion[] = [];

	if (cursor.goto_first_child()) {
		do {
			const kind = cursor.kind;
			if (kind === K_FRONTMATTER) {
				frontmatterNode = {
					valueStart: cursor.value_start,
					valueEnd: cursor.value_end,
				};
				excludedRegions.push({ start: cursor.start, end: cursor.end });
				bodySkipSet.add(cursor.index);
			} else if (kind === K_IMPORT_STATEMENT) {
				importNodes.push({
					valueStart: cursor.value_start,
					valueEnd: cursor.value_end,
				});
				excludedRegions.push({ start: cursor.start, end: cursor.end });
				bodySkipSet.add(cursor.index);
			} else if (kind === K_HTML && cursor.meta()?.tag === 'script') {
				scriptBodies.push({
					valueStart: cursor.value_start,
					valueEnd: cursor.value_end,
				});
				excludedRegions.push({ start: cursor.start, end: cursor.end });
				bodySkipSet.add(cursor.index);
			}
		} while (cursor.goto_next_sibling());
		cursor.goto_parent();
	}

	const hasFrontmatter = frontmatterNode !== null;
	const hasInstanceScript = importNodes.length > 0 || scriptBodies.length > 0;

	let html = '';
	const entries = new MapSink();

	// Phase A1: Build <script module> block for frontmatter exports
	// Module-level exports are importable from .ts files AND accessible in template
	if (hasFrontmatter) {
		const moduleStart = html.length;
		html += '<script module lang="ts">\n';

		const yaml = source.slice(
			frontmatterNode!.valueStart,
			frontmatterNode!.valueEnd
		);
		const fmEntries = extractYamlEntries(yaml, frontmatterNode!.valueStart);
		for (const entry of fmEntries) {
			html += 'export const ';
			// character-level mapping for the key name
			_emit(
				entries,
				html.length,
				html.length + entry.name.length,
				entry.sourceOffset,
				entry.sourceOffset + entry.name.length,
				-1,
				SVELTE_CONTENT
			);
			html += entry.name + ' = ' + entry.jsValue + ';\n';
		}

		html += '</script>\n\n';

		_emit(entries, moduleStart, html.length, 0, 0, -1, STRUCTURE_NODE);
	}

	// Phase A2: Build <script> block for imports and user code (instance scope)
	if (hasInstanceScript) {
		const scriptStart = html.length;
		html += '<script lang="ts">\n';

		// imports (verbatim, identity-mapped)
		for (const imp of importNodes) {
			const text = source.slice(imp.valueStart, imp.valueEnd);
			_emit(
				entries,
				html.length,
				html.length + text.length,
				imp.valueStart,
				imp.valueEnd,
				-1,
				SVELTE_CONTENT
			);
			html += text + '\n';
		}

		// existing <script> body content (identity-mapped)
		for (const script of scriptBodies) {
			const text = source.slice(script.valueStart, script.valueEnd);
			if (text.length > 0) {
				_emit(
					entries,
					html.length,
					html.length + text.length,
					script.valueStart,
					script.valueEnd,
					-1,
					SVELTE_CONTENT
				);
				html += text + '\n';
			}
		}

		html += '</script>\n\n';

		_emit(entries, scriptStart, html.length, 0, 0, -1, STRUCTURE_NODE);
	}

	// Phase B: Collect style block source positions before body rendering
	const styleSourcePositions: { valueStart: number; valueEnd: number }[] = [];
	cursor.reset();
	if (cursor.goto_first_child()) {
		do {
			if (
				cursor.kind === K_HTML &&
				cursor.meta()?.tag === 'style' &&
				!bodySkipSet.has(cursor.index)
			) {
				styleSourcePositions.push({
					valueStart: cursor.value_start,
					valueEnd: cursor.value_end,
				});
				excludedRegions.push({ start: cursor.start, end: cursor.end });
			}
		} while (cursor.goto_next_sibling());
		cursor.goto_parent();
	}

	// Phase C: Render body nodes (skip frontmatter, imports, scripts)
	cursor.reset();
	_mapped_begin(buf, source, html);
	try {
		if (cursor.goto_first_child()) {
			do {
				if (cursor.kind === K_LINE_BREAK) continue;
				if (bodySkipSet.has(cursor.index)) continue;
				_node(cursor, entries);
			} while (cursor.goto_next_sibling());
			cursor.goto_parent();
		}
	} finally {
		html = _mapped_end();
	}

	// resolve mappings
	const code = html;
	const mappings = _resolve_offset_mappings(entries);

	// Phase D: Locate style blocks in generated output by matching source content
	const styleBlocks: StyleBlock[] = [];
	for (const sp of styleSourcePositions) {
		const cssContent = source.slice(sp.valueStart, sp.valueEnd);
		// find this exact CSS content in the generated code
		const genIdx = code.indexOf(cssContent);
		if (genIdx !== -1) {
			styleBlocks.push({
				sourceStart: sp.valueStart,
				sourceEnd: sp.valueEnd,
				generatedStart: genIdx,
				generatedEnd: genIdx + cssContent.length,
			});
		}
	}

	return { code, mappings, styleBlocks, excludedRegions };
}
