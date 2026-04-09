/**
 * PFM Volar LanguagePlugin.
 *
 * Teaches Volar how to handle .pfm files by producing TypeScript
 * VirtualCode through the pipeline:
 *
 *   PFM source → pfmToSvelte → svelte2tsx → compose mappings → VirtualCode
 */

import type {
	LanguagePlugin,
	VirtualCode,
	IScriptSnapshot,
	CodeMapping,
	CodegenContext,
} from "@volar/language-core";
import { forEachEmbeddedCode } from "@volar/language-core";
import type { TypeScriptExtraServiceScript } from "@volar/typescript";

import { pfmToSvelte } from "@pfm/source-map/pfm-to-svelte";
import { v3ToVolarMappings } from "@pfm/source-map/v3-to-volar";
import { composeMappings } from "@pfm/source-map/compose-mappings";
import { svelte2tsx as svelte_2_tsx } from "svelte2tsx";
import type { CodeInformation } from "@mdsvex/render/mappings";

const PFM_EXTENSION = ".pfm";
const PFM_LANGUAGE_ID = "pfm";

import { SVELTE_SHIMS } from "./_svelte_shims";

/** Prepend shims content to svelte2tsx output and shift mappings. */
function inject_shims(
	tsx_code: string,
	raw_mappings: ReturnType<typeof v3ToVolarMappings>,
): { code: string; mappings: typeof raw_mappings } {
	if (!SVELTE_SHIMS) return { code: tsx_code, mappings: raw_mappings };
	const prefix = SVELTE_SHIMS + "\n";
	const prefixLen = prefix.length;
	return {
		code: prefix + tsx_code,
		mappings: raw_mappings.map((m) => ({
			...m,
			generatedOffsets: m.generatedOffsets.map((o) => o + prefixLen),
		})),
	};
}

export interface PfmVirtualCode extends VirtualCode {
	id: string;
	languageId: string;
	snapshot: IScriptSnapshot;
	mappings: CodeMapping[];
	embeddedCodes: VirtualCode[];
}

/** Create a simple IScriptSnapshot from a string. */
function create_snapshot(text: string): IScriptSnapshot {
	return {
		getText: (start, end) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

/** Build a minimal VirtualCode with no TS features (used as fallback on error). */
function create_fallback_virtual_code(source: string): PfmVirtualCode {
	return {
		id: "root",
		languageId: PFM_LANGUAGE_ID,
		snapshot: create_snapshot(source),
		mappings: [{
			sourceOffsets: [0],
			generatedOffsets: [0],
			lengths: [source.length],
			data: { structure: true },
		}],
		embeddedCodes: [],
	};
}

/**
 * Run the full PFM → TypeScript pipeline and produce VirtualCode.
 * On any error (parse failure, svelte2tsx crash), returns a fallback
 * VirtualCode with no TS features instead of crashing the server.
 */
function create_virtual_code_from_source(
	source: string,
	script_id: string,
): PfmVirtualCode {
	let svelte;
	try {
		// Step 1: PFM → Svelte
		svelte = pfmToSvelte(source);
	} catch {
		return create_fallback_virtual_code(source);
	}

	let tsx;
	try {
		// Step 2: Svelte → TypeScript via svelte2tsx
		tsx = svelte_2_tsx(svelte.code, {
			filename: script_id.replace(PFM_EXTENSION, ".svelte"),
			isTsFile: false,
			mode: "ts",
		});
	} catch {
		return create_fallback_virtual_code(source);
	}

	// Step 3: Convert svelte2tsx's v3 source map to Volar format + inject shims
	const v3_map = tsx.map.toJSON ? tsx.map.toJSON() : tsx.map;
	const raw_svelte_to_ts = v3ToVolarMappings(v3_map as any, tsx.code, svelte.code);
	const { code: ts_code, mappings: svelte_to_ts_mappings } = inject_shims(
		tsx.code,
		raw_svelte_to_ts,
	);

	// Step 4: Filter mappings for composition.
	// - Exclude "node" role (broadest spans cause duplicate hover results)
	// - Exclude zero-length source mappings
	// - Upgrade capabilities to full — let svelte2tsx's B-side gate features
	const ALL_CAPS: CodeInformation = {
		verification: true,
		completion: true,
		semantic: true,
		navigation: true,
		structure: true,
	};
	const filtered_mappings = svelte.mappings
		.filter((m) => (m.data as any).role !== "node" && m.lengths[0] > 0)
		.map((m) => ({ ...m, data: ALL_CAPS }));

	// Step 5: Compose PFM→Svelte + Svelte→TS = PFM→TS
	// Use B's capabilities but disable format (overlapping ranges crash the formatter).
	const pfm_to_ts = composeMappings(
		filtered_mappings as any,
		svelte_to_ts_mappings,
		(_a: CodeInformation, b: CodeInformation): CodeInformation => ({
			...b,
			format: false,
		}),
	);

	// Step 5b: Merge single-char non-identity mappings into adjacent
	// neighbors.  svelte2tsx splits attribute names at the first character
	// (e.g. "v"→'"' + "alue="→'alue"') and maps syntax chars to filler
	// spaces.  These 1-char mappings cause two problems via Volar's
	// inclusive-end (<=) translateOffset:
	//  1. Diagnostic highlights bleed through whitespace (char→space anchors)
	//  2. Duplicate hover at attribute-name boundaries (v/alue overlap)
	// Merging them into the next mapping eliminates the boundary overlap
	// while preserving hover on the first character.
	pfm_to_ts.sort(
		(a, b) => a.sourceOffsets[0] - b.sourceOffsets[0],
	);
	for (let i = pfm_to_ts.length - 2; i >= 0; i--) {
		const m = pfm_to_ts[i];
		if (m.lengths[0] !== 1) continue;
		const gen_len = m.generatedLengths ? m.generatedLengths[0] : 1;
		if (gen_len !== 1) continue;
		const src_ch = source.charCodeAt(m.sourceOffsets[0]);
		const gen_ch = ts_code.charCodeAt(m.generatedOffsets[0]);
		if (src_ch === gen_ch) continue; // identity — leave as-is

		const next = pfm_to_ts[i + 1];
		const next_gen_len = next.generatedLengths ? next.generatedLengths[0] : next.lengths[0];

		// Merge into next if source-adjacent and generated gap ≤ 1
		if (m.sourceOffsets[0] + 1 === next.sourceOffsets[0] &&
			next.generatedOffsets[0] - (m.generatedOffsets[0] + 1) <= 1) {
			const new_gen_start = m.generatedOffsets[0];
			const new_gen_end = next.generatedOffsets[0] + next_gen_len;
			next.sourceOffsets[0] = m.sourceOffsets[0];
			next.lengths[0] += 1;
			next.generatedOffsets[0] = new_gen_start;
			const new_gen_len = new_gen_end - new_gen_start;
			next.generatedLengths = new_gen_len !== next.lengths[0] ? [new_gen_len] : undefined;
			pfm_to_ts.splice(i, 1);
		}
	}

	// Step 6: Shrink non-identity trailing boundaries at adjacency points.
	// Volar's translateOffset uses inclusive end (<=) so adjacent mappings
	// share boundary offsets.  When the last source char differs from the
	// last generated char (e.g. "}" → ","), the previous mapping wrongly
	// claims the next token's start, causing diagnostic highlights to
	// bleed through inter-attribute whitespace.  We only shrink when the
	// next mapping starts at exactly this mapping's generated end, to
	// avoid dropping diagnostics at the final mapping.
	const by_gen_offset = pfm_to_ts.slice().sort(
		(a, b) => a.generatedOffsets[0] - b.generatedOffsets[0],
	);
	for (let i = 0; i < by_gen_offset.length - 1; i++) {
		const m = by_gen_offset[i];
		const next = by_gen_offset[i + 1];
		const src_len = m.lengths[0];
		const gen_len = m.generatedLengths ? m.generatedLengths[0] : src_len;
		if (gen_len <= 1) continue;
		const gen_end = m.generatedOffsets[0] + gen_len;
		if (gen_end !== next.generatedOffsets[0]) continue;
		const last_src = source.charCodeAt(m.sourceOffsets[0] + src_len - 1);
		const last_gen = ts_code.charCodeAt(m.generatedOffsets[0] + gen_len - 1);
		if (last_src !== last_gen) {
			m.generatedLengths = [gen_len - 1];
		}
	}

	// Step 7: Deduplicate composed mappings that share the same source range.
	// svelte2tsx maps identifiers like `Test` to multiple TS positions
	// (import, type alias, constructor).  Keeping only the first (lowest
	// generated offset) prevents Volar from combining all their hover
	// results into one noisy tooltip.
	{
		const seen = new Set<string>();
		let write = 0;
		for (let read = 0; read < pfm_to_ts.length; read++) {
			const m = pfm_to_ts[read];
			const key = m.sourceOffsets[0] + ":" + m.lengths[0];
			if (seen.has(key)) continue;
			seen.add(key);
			pfm_to_ts[write++] = m;
		}
		pfm_to_ts.length = write;
	}

	// Build the TypeScript embedded VirtualCode
	const ts_virtual_code: VirtualCode = {
		id: "ts",
		languageId: "typescript",
		snapshot: create_snapshot(ts_code),
		mappings: pfm_to_ts as CodeMapping[],
		embeddedCodes: [],
	};

	// Build CSS embedded VirtualCodes from <style> blocks
	const embedded_codes: VirtualCode[] = [ts_virtual_code];
	const all_caps = {
		verification: true,
		completion: true,
		semantic: true,
		navigation: true,
		structure: true,
		format: true,
	};

	for (let i = 0; i < svelte.styleBlocks.length; i++) {
		const sb = svelte.styleBlocks[i];
		const css_text = source.slice(sb.sourceStart, sb.sourceEnd);
		embedded_codes.push({
			id: "style_" + i,
			languageId: "css",
			snapshot: create_snapshot(css_text),
			mappings: [{
				sourceOffsets: [sb.sourceStart],
				generatedOffsets: [0],
				lengths: [css_text.length],
				data: all_caps,
			}],
			embeddedCodes: [],
		});
	}

	// Build markdown VirtualCode — PFM source with excluded regions
	// (frontmatter, script, style, imports) blanked out so the markdown
	// service sees clean markdown without setext-heading false positives.
	let md_source = source;
	for (const region of svelte.excludedRegions) {
		// Replace excluded bytes with spaces, preserving newlines for line alignment
		const chunk = source.slice(region.start, region.end);
		const blanked = chunk.replace(/[^\n]/g, " ");
		md_source = md_source.slice(0, region.start) + blanked + md_source.slice(region.end);
	}

	embedded_codes.push({
		id: "md",
		languageId: "markdown",
		snapshot: create_snapshot(md_source),
		mappings: [{
			sourceOffsets: [0],
			generatedOffsets: [0],
			lengths: [source.length],
			data: {
				structure: true,
				navigation: true,
			},
		}],
		embeddedCodes: [],
	});

	return {
		id: "root",
		languageId: PFM_LANGUAGE_ID,
		snapshot: create_snapshot(source),
		mappings: [{
			sourceOffsets: [0],
			generatedOffsets: [0],
			lengths: [source.length],
			data: { structure: true },
		}],
		embeddedCodes: embedded_codes,
	};
}

/** Simple string hash for content-based caching. */
function hash_string(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = ((h << 5) - h + s.charCodeAt(i)) | 0;
	}
	return h;
}

/**
 * Create a PFM LanguagePlugin for Volar.
 *
 * Usage:
 *   const plugin = createPfmLanguagePlugin();
 *   // Pass to @volar/language-server or @volar/kit
 */
export function create_pfm_language_plugin(): LanguagePlugin<string, PfmVirtualCode> {
	// Per-file cache: skip full pipeline if content hash hasn't changed
	const cache = new Map<string, { hash: number; result: PfmVirtualCode }>();

	return {
		getLanguageId(scriptId: string): string | undefined {
			if (scriptId.endsWith(PFM_EXTENSION)) {
				return PFM_LANGUAGE_ID;
			}
			return undefined;
		},

		createVirtualCode(
			scriptId: string,
			languageId: string,
			snapshot: IScriptSnapshot,
			_ctx: CodegenContext<string>,
		): PfmVirtualCode | undefined {
			if (languageId !== PFM_LANGUAGE_ID) return undefined;

			const source = snapshot.getText(0, snapshot.getLength());
			const hash = hash_string(source);
			const cached = cache.get(scriptId);
			if (cached && cached.hash === hash) {
				return cached.result;
			}

			const result = create_virtual_code_from_source(source, scriptId);
			cache.set(scriptId, { hash, result });
			return result;
		},

		updateVirtualCode(
			scriptId: string,
			_virtualCode: PfmVirtualCode,
			newSnapshot: IScriptSnapshot,
			_ctx: CodegenContext<string>,
		): PfmVirtualCode | undefined {
			const source = newSnapshot.getText(0, newSnapshot.getLength());
			const hash = hash_string(source);
			const cached = cache.get(scriptId);
			if (cached && cached.hash === hash) {
				return cached.result;
			}

			const result = create_virtual_code_from_source(source, scriptId);
			cache.set(scriptId, { hash, result });
			return result;
		},

		disposeVirtualCode(scriptId: string) {
			cache.delete(scriptId);
		},

		typescript: {
			extraFileExtensions: [
				{
					extension: "pfm",
					isMixedContent: true,
					scriptKind: 7 as any, // ts.ScriptKind.Deferred
				},
			],
			getServiceScript(root: VirtualCode) {
				// Return the embedded TS code as the service script —
				// this tells TypeScript "when resolving this .pfm file
				// as a module, use this TS code for its exports"
				const ts_code = root.embeddedCodes?.find(
					(c) => c.languageId === "typescript",
				);
				if (ts_code) {
					return {
						code: ts_code,
						extension: ".ts" as any,
						scriptKind: 3 as any, // ts.ScriptKind.TS
					};
				}
				return undefined;
			},
			getExtraServiceScripts(_fileName: string, _root: VirtualCode) {
				// The main TS code is already returned by getServiceScript.
				// No extra scripts needed — returning it again causes duplicates.
				return [];
			},
		},
	};
}
