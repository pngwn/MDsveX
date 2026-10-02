/**
 * PFM Volar LanguagePlugin.
 *
 * Teaches Volar how to handle .pfm files by producing TypeScript
 * VirtualCode through the pipeline:
 *
 *   PFM source -> pfmToSvelte -> svelte2tsx -> compose mappings -> VirtualCode
 */

import type {
	LanguagePlugin,
	VirtualCode,
	IScriptSnapshot,
	CodeMapping,
	CodegenContext,
} from '@volar/language-core';
import { forEachEmbeddedCode } from '@volar/language-core';
import type { TypeScriptExtraServiceScript } from '@volar/typescript';

import { pfmToSvelte } from '@mdsvex/source-map/pfm-to-svelte';
import type {
	EditorMappingData,
	PfmDiagnostic,
	PfmToSvelteOptions,
} from '@mdsvex/source-map/pfm-to-svelte';
import { v3ToVolarMappings } from '@mdsvex/source-map/v3-to-volar';
import { composeMappings } from '@mdsvex/source-map/compose-mappings';
import { svelte2tsx as svelte_2_tsx } from 'svelte2tsx';
import type { CodeInformation } from '@mdsvex/render/mappings';
import type * as TS from 'typescript';

import { create_config_loader } from './config';
import type { ConfigLoader } from './config';

const PFM_LANGUAGE_ID = 'pfm';
/** always documents, .svx is the default extension of the vite plugin */
const EXTENSIONS = ['.pfm', '.svx'];
/** never documents, so their language needs no config lookup */
const NOT_DOCUMENTS = /\.(?:[cm]?[jt]sx?|svelte|json|css|d\.ts|map)$/;

import { SVELTE_SHIMS } from './_svelte_shims';

/** Prepend shims content to svelte2tsx output and shift mappings. */
function inject_shims(
	tsx_code: string,
	raw_mappings: ReturnType<typeof v3ToVolarMappings>
): { code: string; mappings: typeof raw_mappings } {
	if (!SVELTE_SHIMS) return { code: tsx_code, mappings: raw_mappings };
	const prefix = SVELTE_SHIMS + '\n';
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
	/** compile errors and warnings, typescript reports the rest */
	diagnostics: PfmDiagnostic[];
}

export interface PfmLanguagePluginOptions {
	/** reads the exports of templates a mdsvex.config.json names, without it they replace nothing */
	typescript?: typeof TS;
	/** where the mdsvex config of a document comes from, by default the nearest manifest or json config */
	config?: ConfigLoader;
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
		id: 'root',
		languageId: PFM_LANGUAGE_ID,
		snapshot: create_snapshot(source),
		mappings: [
			{
				sourceOffsets: [0],
				generatedOffsets: [0],
				lengths: [source.length],
				data: { structure: true },
			},
		],
		embeddedCodes: [],
		diagnostics: [],
	};
}

/** the composed capabilities, a mapping the converter added keeps only what it allows */
function merge_capabilities(
	a: CodeInformation & { editor?: true },
	b: CodeInformation
): CodeInformation & { editor?: true } {
	if (!a.editor) return { ...b, format: false };
	const out: CodeInformation & { editor?: true } = { editor: true };
	if (a.verification && b.verification) out.verification = b.verification;
	if (a.completion && b.completion) out.completion = b.completion;
	if (a.semantic && b.semantic) out.semantic = b.semantic;
	if (a.navigation && b.navigation) out.navigation = b.navigation;
	if (a.structure && b.structure) out.structure = b.structure;
	return out;
}

/**
 * Run the full PFM to TypeScript pipeline and produce VirtualCode.
 * On any error (parse failure, svelte2tsx crash), returns a fallback
 * VirtualCode with no TS features instead of crashing the server.
 */
function create_virtual_code_from_source(
	source: string,
	script_id: string,
	options: PfmToSvelteOptions
): PfmVirtualCode {
	let svelte;
	try {
		// Step 1: PFM to Svelte
		svelte = pfmToSvelte(source, options);
	} catch {
		return create_fallback_virtual_code(source);
	}

	let tsx;
	try {
		// Step 2: Svelte to TypeScript via svelte2tsx
		tsx = svelte_2_tsx(svelte.code, {
			filename: script_id.replace(/\.[^./\\]+$/, '.svelte'),
			isTsFile: false,
			mode: 'ts',
		});
	} catch {
		return create_fallback_virtual_code(source);
	}

	// Step 3: Convert svelte2tsx's v3 source map to Volar format + inject shims
	const v3_map = tsx.map.toJSON ? tsx.map.toJSON() : tsx.map;
	const raw_svelte_to_ts = v3ToVolarMappings(
		v3_map as any,
		tsx.code,
		svelte.code
	);
	const { code: ts_code, mappings: svelte_to_ts_mappings } = inject_shims(
		tsx.code,
		raw_svelte_to_ts
	);

	// Step 4: Filter mappings for composition.
	// - Exclude "node" role (broadest spans cause duplicate hover results)
	// - Exclude zero-length source mappings
	// - Upgrade capabilities to full, let svelte2tsx's B-side gate features
	const ALL_CAPS: CodeInformation = {
		verification: true,
		completion: true,
		semantic: true,
		navigation: true,
		structure: true,
	};
	const filtered_mappings = svelte.mappings
		.filter((m) => (m.data as any).role !== 'node' && m.lengths[0] > 0)
		// mappings read through accessors, so a spread would drop the arrays
		.map((m) => ({
			sourceOffsets: m.sourceOffsets,
			generatedOffsets: m.generatedOffsets,
			lengths: m.lengths,
			...(m.generatedLengths ? { generatedLengths: m.generatedLengths } : {}),
			// a mapping the converter added keeps its own capabilities
			data: (m.data as EditorMappingData).editor
				? editor_caps(m.data as EditorMappingData)
				: ALL_CAPS,
		}));

	// Step 5: Compose PFM to Svelte + Svelte to TS = PFM to TS
	// Use B's capabilities but disable format (overlapping ranges crash the formatter).
	const pfm_to_ts = composeMappings(
		filtered_mappings as any,
		svelte_to_ts_mappings,
		merge_capabilities
	).filter((m) => !is_empty(m.data));

	// Step 5b: Merge single-char non-identity mappings into adjacent
	// neighbors.  svelte2tsx splits attribute names at the first character
	// (e.g. "v" to '"' + "alue=" to 'alue"') and maps syntax chars to filler
	// spaces.  These 1-char mappings cause two problems via Volar's
	// inclusive-end (<=) translateOffset:
	//  1. Diagnostic highlights bleed through whitespace (char to space anchors)
	//  2. Duplicate hover at attribute-name boundaries (v/alue overlap)
	// Merging them into the next mapping eliminates the boundary overlap
	// while preserving hover on the first character.
	pfm_to_ts.sort((a, b) => a.sourceOffsets[0] - b.sourceOffsets[0]);
	for (let i = pfm_to_ts.length - 2; i >= 0; i--) {
		const m = pfm_to_ts[i];
		if (m.lengths[0] !== 1) continue;
		const gen_len = m.generatedLengths ? m.generatedLengths[0] : 1;
		if (gen_len !== 1) continue;
		const src_ch = source.charCodeAt(m.sourceOffsets[0]);
		const gen_ch = ts_code.charCodeAt(m.generatedOffsets[0]);
		if (src_ch === gen_ch) continue; // identity, leave as-is

		const next = pfm_to_ts[i + 1];
		// a mapping the converter added keeps its capabilities apart
		if (!m.data.editor !== !next.data.editor) continue;
		const next_gen_len = next.generatedLengths
			? next.generatedLengths[0]
			: next.lengths[0];

		// Merge into next if source-adjacent and generated gap <= 1
		if (
			m.sourceOffsets[0] + 1 === next.sourceOffsets[0] &&
			next.generatedOffsets[0] - (m.generatedOffsets[0] + 1) <= 1
		) {
			const new_gen_start = m.generatedOffsets[0];
			const new_gen_end = next.generatedOffsets[0] + next_gen_len;
			next.sourceOffsets[0] = m.sourceOffsets[0];
			next.lengths[0] += 1;
			next.generatedOffsets[0] = new_gen_start;
			const new_gen_len = new_gen_end - new_gen_start;
			next.generatedLengths =
				new_gen_len !== next.lengths[0] ? [new_gen_len] : undefined;
			pfm_to_ts.splice(i, 1);
		}
	}

	// svelte2tsx quotes a prop key and typescript spans both quotes, so an arg takes the closing one
	for (const m of pfm_to_ts) {
		if (!m.data.editor) continue;
		const start = m.generatedOffsets[0];
		const len = m.generatedLengths ? m.generatedLengths[0] : m.lengths[0];
		if (ts_code[start] === '"' && ts_code[start + len] === '"' && len > 1)
			m.generatedLengths = [len + 1];
	}

	// Step 6: Shrink non-identity trailing boundaries at adjacency points.
	// Volar's translateOffset uses inclusive end (<=) so adjacent mappings
	// share boundary offsets.  When the last source char differs from the
	// last generated char (e.g. "}" becomes ","), the previous mapping wrongly
	// claims the next token's start, causing diagnostic highlights to
	// bleed through inter-attribute whitespace.  We only shrink when the
	// next mapping starts at exactly this mapping's generated end, to
	// avoid dropping diagnostics at the final mapping.
	const by_gen_offset = pfm_to_ts
		.slice()
		.sort((a, b) => a.generatedOffsets[0] - b.generatedOffsets[0]);
	for (let i = 0; i < by_gen_offset.length - 1; i++) {
		const m = by_gen_offset[i];
		const next = by_gen_offset[i + 1];
		if (m.data.editor) continue;
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
			// a frontmatter key maps once to hover and once to check
			const key =
				m.sourceOffsets[0] + ':' + m.lengths[0] + ':' + caps_key(m.data);
			if (seen.has(key)) continue;
			seen.add(key);
			pfm_to_ts[write++] = m;
		}
		pfm_to_ts.length = write;
	}

	// Build the TypeScript embedded VirtualCode
	const ts_virtual_code: VirtualCode = {
		id: 'ts',
		languageId: 'typescript',
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
			id: 'style_' + i,
			languageId: 'css',
			snapshot: create_snapshot(css_text),
			mappings: [
				{
					sourceOffsets: [sb.sourceStart],
					generatedOffsets: [0],
					lengths: [css_text.length],
					data: all_caps,
				},
			],
			embeddedCodes: [],
		});
	}

	// Build markdown VirtualCode: PFM source with excluded regions
	// (frontmatter, script, style, imports) blanked out so the markdown
	// service sees clean markdown without setext-heading false positives.
	let md_source = source;
	for (const region of svelte.excludedRegions) {
		// Replace excluded bytes with spaces, preserving newlines for line alignment
		const chunk = source.slice(region.start, region.end);
		const blanked = chunk.replace(/[^\n]/g, ' ');
		md_source =
			md_source.slice(0, region.start) + blanked + md_source.slice(region.end);
	}

	embedded_codes.push({
		id: 'md',
		languageId: 'markdown',
		snapshot: create_snapshot(md_source),
		mappings: [
			{
				sourceOffsets: [0],
				generatedOffsets: [0],
				lengths: [source.length],
				data: {
					structure: true,
					navigation: true,
				},
			},
		],
		embeddedCodes: [],
	});

	return {
		id: 'root',
		languageId: PFM_LANGUAGE_ID,
		snapshot: create_snapshot(source),
		mappings: [
			{
				sourceOffsets: [0],
				generatedOffsets: [0],
				lengths: [source.length],
				// verification lets a service report compile diagnostics on the root
				data: { structure: true, verification: true },
			},
		],
		embeddedCodes: embedded_codes,
		diagnostics: svelte.diagnostics,
	};
}

function editor_caps(
	data: EditorMappingData
): CodeInformation & { editor: true } {
	const out: CodeInformation & { editor: true } = { editor: true };
	if (data.verification) out.verification = true;
	if (data.completion) out.completion = true;
	if (data.semantic) out.semantic = true;
	if (data.navigation) out.navigation = true;
	if (data.structure) out.structure = true;
	return out;
}

function is_empty(data: CodeInformation): boolean {
	return (
		!data.verification &&
		!data.completion &&
		!data.semantic &&
		!data.navigation &&
		!data.structure &&
		!data.format
	);
}

function caps_key(data: CodeInformation): string {
	return (
		(data.verification ? 'v' : '') +
		(data.semantic ? 's' : '') +
		(data.navigation ? 'n' : '') +
		(data.completion ? 'c' : '')
	);
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
export function create_pfm_language_plugin(
	plugin_options: PfmLanguagePluginOptions = {}
): LanguagePlugin<string, PfmVirtualCode> {
	// a file converts again only when its content or config changed
	const cache = new Map<
		string,
		{ hash: number; stamp: string; result: PfmVirtualCode }
	>();
	const config =
		plugin_options.config ??
		create_config_loader({ typescript: plugin_options.typescript });

	function virtual_code(scriptId: string, snapshot: IScriptSnapshot) {
		const source = snapshot.getText(0, snapshot.getLength());
		const hash = hash_string(source);
		const { stamp, options } = config.options_for(scriptId);
		const cached = cache.get(scriptId);
		if (cached && cached.hash === hash && cached.stamp === stamp) {
			return cached.result;
		}

		const result = create_virtual_code_from_source(source, scriptId, options);
		cache.set(scriptId, { hash, stamp, result });
		return result;
	}

	return {
		getLanguageId(scriptId: string): string | undefined {
			return is_document(scriptId, config) ? PFM_LANGUAGE_ID : undefined;
		},

		createVirtualCode(
			scriptId: string,
			languageId: string,
			snapshot: IScriptSnapshot,
			_ctx: CodegenContext<string>
		): PfmVirtualCode | undefined {
			if (languageId !== PFM_LANGUAGE_ID) return undefined;
			return virtual_code(scriptId, snapshot);
		},

		updateVirtualCode(
			scriptId: string,
			_virtualCode: PfmVirtualCode,
			newSnapshot: IScriptSnapshot,
			_ctx: CodegenContext<string>
		): PfmVirtualCode | undefined {
			return virtual_code(scriptId, newSnapshot);
		},

		disposeVirtualCode(scriptId: string) {
			cache.delete(scriptId);
		},

		typescript: {
			extraFileExtensions: [
				...EXTENSIONS.map((ext) => ({
					extension: ext.slice(1),
					isMixedContent: true,
					scriptKind: 7 as any, // ts.ScriptKind.Deferred
				})),
			],
			getServiceScript(root: VirtualCode) {
				// Return the embedded TS code as the service script:
				// this tells TypeScript "when resolving this .pfm file
				// as a module, use this TS code for its exports"
				const ts_code = root.embeddedCodes?.find(
					(c) => c.languageId === 'typescript'
				);
				if (ts_code) {
					return {
						code: ts_code,
						extension: '.ts' as any,
						scriptKind: 3 as any, // ts.ScriptKind.TS
					};
				}
				return undefined;
			},
		},
	};
}

/** .pfm and .svx always, another extension when the config of the file lists it */
export function is_document(file: string, config: ConfigLoader): boolean {
	for (const ext of EXTENSIONS) if (file.endsWith(ext)) return true;
	if (NOT_DOCUMENTS.test(file) || !/\.[^./\\]+$/.test(file)) return false;
	const extensions = config.load(file)?.manifest.extensions;
	return extensions !== undefined && extensions.some((e) => file.endsWith(e));
}
