/**
 * PFM → Svelte component transform with source mappings.
 *
 * Takes PFM source, parses it, and produces a valid Svelte component string
 * along with Volar-compatible source mappings. The output is suitable for
 * feeding into svelte2tsx for TypeScript virtual code generation.
 *
 * Pipeline:
 *   PFM source → parse → classify nodes → build <script> block → render body → mappings
 */

import { PFMParser } from "@mdsvex/parse";
import { TreeBuilder } from "@mdsvex/parse/tree-builder";
import { Cursor } from "@mdsvex/parse/cursor";
import {
	_emit,
	_node,
	_resolve_mappings,
	K_HTML,
	K_LINE_BREAK,
	K_FRONTMATTER,
	K_IMPORT_STATEMENT,
} from "@mdsvex/render/html-cursor";
import type { PendingMapping } from "@mdsvex/render/html-cursor";
import { CI_SVELTE, CI_STRUCTURE } from "@mdsvex/render/mappings";
import type { Mapping, MappingData } from "@mdsvex/render/mappings";

export type { Mapping, MappingData } from "@mdsvex/render/mappings";

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

export interface PfmToSvelteResult {
	code: string;
	mappings: Mapping<MappingData>[];
	/** Style blocks found in the source, with positions for CSS VirtualCode extraction. */
	styleBlocks: StyleBlock[];
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
	if (v === "" || v === "~" || v === "null") return "null";
	if (v === "true") return "true";
	if (v === "false") return "false";
	// integer or float
	if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v)) return v;
	// block scalar indicator (|, >, |-, >+, etc.) — can't parse inline
	if (/^[|>]/.test(v)) return '"" as string';
	// inline array [a, b] or object {a: b} — too complex, fall back
	if (/^\[/.test(v) || /^\{/.test(v)) return `${v} as any`;
	// plain string — quote it, escaping internal quotes and backslashes
	return JSON.stringify(v);
}

/**
 * Extract top-level YAML key-value pairs from frontmatter text.
 * Only extracts keys that are valid JavaScript identifiers.
 * Values are converted to JavaScript literals for type inference.
 */
function extractYamlEntries(yaml: string, yamlSourceOffset: number): YamlEntry[] {
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
 * - Frontmatter YAML keys → `let key: any;` declarations in `<script>`
 * - Import statements → verbatim imports in `<script>`
 * - Explicit `<script>` tags → merged into the generated `<script>` block
 * - Body content → rendered as Svelte markup via the existing HTML renderer
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

	if (cursor.gotoFirstChild()) {
		do {
			const kind = cursor.kind;
			if (kind === K_FRONTMATTER) {
				frontmatterNode = {
					valueStart: cursor.value_start,
					valueEnd: cursor.value_end,
				};
				bodySkipSet.add(cursor.index);
			} else if (kind === K_IMPORT_STATEMENT) {
				importNodes.push({
					valueStart: cursor.value_start,
					valueEnd: cursor.value_end,
				});
				bodySkipSet.add(cursor.index);
			} else if (kind === K_HTML && cursor.meta()?.tag === "script") {
				scriptBodies.push({
					valueStart: cursor.value_start,
					valueEnd: cursor.value_end,
				});
				bodySkipSet.add(cursor.index);
			}
		} while (cursor.gotoNextSibling());
		cursor.gotoParent();
	}

	const hasScript =
		frontmatterNode !== null ||
		importNodes.length > 0 ||
		scriptBodies.length > 0;

	const out: string[] = [];
	const entries: PendingMapping[] = [];

	// Phase A: Build <script> block
	if (hasScript) {
		const scriptStart = out.length;
		out.push("<script lang=\"ts\">\n");

		// imports (verbatim, identity-mapped)
		for (const imp of importNodes) {
			const text = source.slice(imp.valueStart, imp.valueEnd);
			_emit(
				entries,
				out.length,
				out.length + 1,
				imp.valueStart,
				imp.valueEnd,
				{ ...CI_SVELTE, nodeIndex: -1, role: "content" },
			);
			out.push(text, "\n");
		}

		// frontmatter keys → const declarations with inferred types
		if (frontmatterNode) {
			const yaml = source.slice(
				frontmatterNode.valueStart,
				frontmatterNode.valueEnd,
			);
			const fmEntries = extractYamlEntries(yaml, frontmatterNode.valueStart);
			for (const entry of fmEntries) {
				out.push("const ");
				// character-level mapping for the key name
				_emit(
					entries,
					out.length,
					out.length + 1,
					entry.sourceOffset,
					entry.sourceOffset + entry.name.length,
					{ ...CI_SVELTE, nodeIndex: -1, role: "content" },
				);
				out.push(entry.name, " = ", entry.jsValue, ";\n");
			}
		}

		// existing <script> body content (identity-mapped)
		for (const script of scriptBodies) {
			const text = source.slice(script.valueStart, script.valueEnd);
			if (text.length > 0) {
				_emit(
					entries,
					out.length,
					out.length + 1,
					script.valueStart,
					script.valueEnd,
					{ ...CI_SVELTE, nodeIndex: -1, role: "content" },
				);
				out.push(text, "\n");
			}
		}

		out.push("</script>\n\n");

		// emit structure mapping for the whole script block
		_emit(
			entries,
			scriptStart,
			out.length,
			0,
			0,
			{ ...CI_STRUCTURE, nodeIndex: -1, role: "node" },
		);
	}

	// Phase B: Collect style block source positions before body rendering
	const styleSourcePositions: { valueStart: number; valueEnd: number }[] = [];
	cursor.reset();
	if (cursor.gotoFirstChild()) {
		do {
			if (
				cursor.kind === K_HTML &&
				cursor.meta()?.tag === "style" &&
				!bodySkipSet.has(cursor.index)
			) {
				styleSourcePositions.push({
					valueStart: cursor.value_start,
					valueEnd: cursor.value_end,
				});
			}
		} while (cursor.gotoNextSibling());
		cursor.gotoParent();
	}

	// Phase C: Render body nodes (skip frontmatter, imports, scripts)
	cursor.reset();
	if (cursor.gotoFirstChild()) {
		do {
			if (cursor.kind === K_LINE_BREAK) continue;
			if (bodySkipSet.has(cursor.index)) continue;
			_node(cursor, out, entries);
		} while (cursor.gotoNextSibling());
		cursor.gotoParent();
	}

	// resolve mappings
	const code = out.join("");
	const mappings = _resolve_mappings(out, entries);

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

	return { code, mappings, styleBlocks };
}
