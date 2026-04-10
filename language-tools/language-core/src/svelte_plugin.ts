/**
 * Minimal Svelte LanguagePlugin.
 *
 * Runs svelte2tsx on .svelte files to produce TypeScript VirtualCode,
 * enabling component prop types to resolve when imported from .pfm files.
 *
 * This is NOT a full Svelte language server, it only provides enough
 * for cross-file type resolution.
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

import { svelte2tsx } from "svelte2tsx";
import { v3ToVolarMappings } from "@pfm/source-map/v3-to-volar";

const SVELTE_EXTENSION = ".svelte";

import { SVELTE_SHIMS } from "./_svelte_shims";

/** Create a simple IScriptSnapshot from a string. */
function createSnapshot(text: string): IScriptSnapshot {
	return {
		getText: (start, end) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

function createSvelteVirtualCode(
	source: string,
	scriptId: string,
): VirtualCode | undefined {
	let tsx;
	try {
		tsx = svelte2tsx(source, {
			filename: scriptId,
			isTsFile: false,
			mode: "ts",
		});
	} catch {
		return undefined;
	}

	const v3Map = tsx.map.toJSON ? tsx.map.toJSON() : tsx.map;

	// Prepend svelte2tsx shims so TypeScript can resolve helper types
	const prefix = SVELTE_SHIMS ? SVELTE_SHIMS + "\n" : "";
	const tsCode = prefix + tsx.code;
	const prefixLen = prefix.length;

	// Build mappings from original tsx output, then shift generated offsets
	const rawMappings = v3ToVolarMappings(v3Map as any, tsx.code, source);
	const mappings = rawMappings.map((m) => ({
		...m,
		generatedOffsets: m.generatedOffsets.map((o) => o + prefixLen),
	}));

	const tsVirtualCode: VirtualCode = {
		id: "ts",
		languageId: "typescript",
		snapshot: createSnapshot(tsCode),
		mappings: mappings as CodeMapping[],
		embeddedCodes: [],
	};

	return {
		id: "root",
		languageId: "svelte",
		snapshot: createSnapshot(source),
		mappings: [{
			sourceOffsets: [0],
			generatedOffsets: [0],
			lengths: [source.length],
			data: { structure: true },
		}],
		embeddedCodes: [tsVirtualCode],
	};
}

/**
 * Create a minimal Svelte LanguagePlugin for cross-file type resolution.
 */
export function create_svelte_language_plugin(): LanguagePlugin<string> {
	const cache = new Map<string, { hash: number; result: VirtualCode }>();

	function hashString(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) {
			h = ((h << 5) - h + s.charCodeAt(i)) | 0;
		}
		return h;
	}

	return {
		getLanguageId(scriptId: string): string | undefined {
			if (scriptId.endsWith(SVELTE_EXTENSION)) {
				return "svelte";
			}
			return undefined;
		},

		createVirtualCode(
			scriptId: string,
			languageId: string,
			snapshot: IScriptSnapshot,
		): VirtualCode | undefined {
			if (languageId !== "svelte") return undefined;

			const source = snapshot.getText(0, snapshot.getLength());
			const hash = hashString(source);
			const cached = cache.get(scriptId);
			if (cached && cached.hash === hash) return cached.result;

			const result = createSvelteVirtualCode(source, scriptId);
			if (result) cache.set(scriptId, { hash, result });
			return result;
		},

		updateVirtualCode(
			scriptId: string,
			_virtualCode: VirtualCode,
			newSnapshot: IScriptSnapshot,
		): VirtualCode | undefined {
			const source = newSnapshot.getText(0, newSnapshot.getLength());
			const hash = hashString(source);
			const cached = cache.get(scriptId);
			if (cached && cached.hash === hash) return cached.result;

			const result = createSvelteVirtualCode(source, scriptId);
			if (result) cache.set(scriptId, { hash, result });
			return result;
		},

		disposeVirtualCode(scriptId: string) {
			cache.delete(scriptId);
		},

		typescript: {
			extraFileExtensions: [
				{
					extension: "svelte",
					isMixedContent: true,
					scriptKind: 7 as any, // ts.ScriptKind.Deferred
				},
			],
			getServiceScript(root: VirtualCode) {
				const tsCode = root.embeddedCodes?.find(
					(c) => c.languageId === "typescript",
				);
				if (tsCode) {
					return {
						code: tsCode,
						extension: ".ts" as any,
						scriptKind: 3 as any, // ts.ScriptKind.TS
					};
				}
				return undefined;
			},
			getExtraServiceScripts(fileName: string, root: VirtualCode) {
				const scripts: TypeScriptExtraServiceScript[] = [];
				for (const code of forEachEmbeddedCode(root)) {
					if (code.languageId === "typescript") {
						scripts.push({
							fileName: fileName + "." + code.id + ".ts",
							code,
							extension: ".ts",
							scriptKind: 3 as any,
						});
					}
				}
				return scripts;
			},
		},
	};
}
