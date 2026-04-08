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

export interface PfmToSvelteResult {
	code: string;
	mappings: Mapping<MappingData>[];
}

/** regex to extract top-level YAML key names (valid JS identifiers only). */
const YAML_KEY_RE = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/gm;

interface YamlKey {
	name: string;
	/** byte offset of the key name within the PFM source. */
	sourceOffset: number;
}

/**
 * Extract top-level YAML key names from frontmatter text.
 * Only extracts keys that are valid JavaScript identifiers.
 */
function extractYamlKeys(yaml: string, yamlSourceOffset: number): YamlKey[] {
	const keys: YamlKey[] = [];
	YAML_KEY_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = YAML_KEY_RE.exec(yaml)) !== null) {
		keys.push({
			name: match[1],
			sourceOffset: yamlSourceOffset + match.index,
		});
	}
	return keys;
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

		// frontmatter keys → let declarations
		if (frontmatterNode) {
			const yaml = source.slice(
				frontmatterNode.valueStart,
				frontmatterNode.valueEnd,
			);
			const keys = extractYamlKeys(yaml, frontmatterNode.valueStart);
			for (const key of keys) {
				out.push("let ");
				// character-level mapping for the key name
				_emit(
					entries,
					out.length,
					out.length + 1,
					key.sourceOffset,
					key.sourceOffset + key.name.length,
					{ ...CI_SVELTE, nodeIndex: -1, role: "content" },
				);
				out.push(key.name, ": any;\n");
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

	// Phase B: Render body nodes (skip frontmatter, imports, scripts)
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

	return { code, mappings };
}
