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

import { pfmToSvelte } from "@pfm/source-map/pfm-to-svelte";
import { v3ToVolarMappings } from "@pfm/source-map/v3-to-volar";
import { composeMappings } from "@pfm/source-map/compose-mappings";
import { svelte2tsx } from "svelte2tsx";
import type { CodeInformation } from "@mdsvex/render/mappings";

const PFM_EXTENSION = ".pfm";
const PFM_LANGUAGE_ID = "pfm";

export interface PfmVirtualCode extends VirtualCode {
	id: string;
	languageId: string;
	snapshot: IScriptSnapshot;
	mappings: CodeMapping[];
	embeddedCodes: VirtualCode[];
}

/** Create a simple IScriptSnapshot from a string. */
function createSnapshot(text: string): IScriptSnapshot {
	return {
		getText: (start, end) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

/** Build a minimal VirtualCode with no TS features (used as fallback on error). */
function createFallbackVirtualCode(source: string): PfmVirtualCode {
	return {
		id: "root",
		languageId: PFM_LANGUAGE_ID,
		snapshot: createSnapshot(source),
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
function createVirtualCodeFromSource(
	source: string,
	scriptId: string,
): PfmVirtualCode {
	let svelte;
	try {
		// Step 1: PFM → Svelte
		svelte = pfmToSvelte(source);
	} catch {
		return createFallbackVirtualCode(source);
	}

	let tsx;
	try {
		// Step 2: Svelte → TypeScript via svelte2tsx
		tsx = svelte2tsx(svelte.code, {
			filename: scriptId.replace(PFM_EXTENSION, ".svelte"),
			isTsFile: false,
			mode: "ts",
		});
	} catch {
		return createFallbackVirtualCode(source);
	}

	// Step 3: Convert svelte2tsx's v3 source map to Volar format
	const v3Map = tsx.map.toJSON ? tsx.map.toJSON() : tsx.map;
	const svelteToTsMappings = v3ToVolarMappings(
		v3Map as any,
		tsx.code,
		svelte.code,
	);

	// Step 4: Filter to "content" role mappings only — "node" and "syntax"
	// mappings overlap with content and produce duplicate LS results.
	const contentMappings = svelte.mappings.filter(
		(m) => (m.data as any).role === "content",
	);

	// Step 5: Compose PFM→Svelte + Svelte→TS = PFM→TS
	const pfmToTsMappings = composeMappings(
		contentMappings as any,
		svelteToTsMappings,
		(a: CodeInformation, b: CodeInformation): CodeInformation => {
			const result: CodeInformation = {};
			if (a.verification && b.verification) result.verification = true;
			if (a.completion && b.completion) result.completion = true;
			if (a.semantic && b.semantic) result.semantic = true;
			if (a.navigation && b.navigation) result.navigation = true;
			if (a.structure && b.structure) result.structure = true;
			return result;
		},
	);

	// Build the TypeScript embedded VirtualCode
	const tsVirtualCode: VirtualCode = {
		id: "ts",
		languageId: "typescript",
		snapshot: createSnapshot(tsx.code),
		mappings: pfmToTsMappings as CodeMapping[],
		embeddedCodes: [],
	};

	// Build CSS embedded VirtualCodes from <style> blocks
	const embeddedCodes: VirtualCode[] = [tsVirtualCode];
	const allCaps = {
		verification: true,
		completion: true,
		semantic: true,
		navigation: true,
		structure: true,
		format: true,
	};

	for (let i = 0; i < svelte.styleBlocks.length; i++) {
		const sb = svelte.styleBlocks[i];
		const cssText = source.slice(sb.sourceStart, sb.sourceEnd);
		embeddedCodes.push({
			id: "style_" + i,
			languageId: "css",
			snapshot: createSnapshot(cssText),
			mappings: [{
				sourceOffsets: [sb.sourceStart],
				generatedOffsets: [0],
				lengths: [cssText.length],
				data: allCaps,
			}],
			embeddedCodes: [],
		});
	}

	// Build markdown VirtualCode — PFM source with excluded regions
	// (frontmatter, script, style, imports) blanked out so the markdown
	// service sees clean markdown without setext-heading false positives.
	let mdSource = source;
	for (const region of svelte.excludedRegions) {
		// Replace excluded bytes with spaces, preserving newlines for line alignment
		const chunk = source.slice(region.start, region.end);
		const blanked = chunk.replace(/[^\n]/g, " ");
		mdSource = mdSource.slice(0, region.start) + blanked + mdSource.slice(region.end);
	}

	embeddedCodes.push({
		id: "md",
		languageId: "markdown",
		snapshot: createSnapshot(mdSource),
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
		snapshot: createSnapshot(source),
		mappings: [{
			sourceOffsets: [0],
			generatedOffsets: [0],
			lengths: [source.length],
			data: { structure: true },
		}],
		embeddedCodes,
	};
}

/**
 * Create a PFM LanguagePlugin for Volar.
 *
 * Usage:
 *   const plugin = createPfmLanguagePlugin();
 *   // Pass to @volar/language-server or @volar/kit
 */
export function createPfmLanguagePlugin(): LanguagePlugin<string, PfmVirtualCode> {
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
			return createVirtualCodeFromSource(source, scriptId);
		},

		updateVirtualCode(
			scriptId: string,
			_virtualCode: PfmVirtualCode,
			newSnapshot: IScriptSnapshot,
			_ctx: CodegenContext<string>,
		): PfmVirtualCode | undefined {
			// For now, recreate from scratch. Incremental updates are Phase 8.
			const source = newSnapshot.getText(0, newSnapshot.getLength());
			return createVirtualCodeFromSource(source, scriptId);
		},
	};
}
