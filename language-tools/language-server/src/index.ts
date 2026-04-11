/**
 * PFM Language Server.
 */

import {
	createConnection,
	createServer,
	createTypeScriptProject,
	loadTsdkByPath,
} from "@volar/language-server/node";
import { create as createTypeScriptServices } from "volar-service-typescript";
import { create as createCssService } from "volar-service-css";
import { create as createMarkdownService } from "volar-service-markdown";
import { create_pfm_language_plugin, create_svelte_language_plugin } from "@pfm/language-core";
import { clean_svelte_hover } from "./clean_hover";
import { URI } from "vscode-uri";
import { forEachEmbeddedCode } from "@volar/language-core";
import type { LanguagePlugin, VirtualCode } from "@volar/language-core";
import type { TypeScriptExtraServiceScript } from "@volar/typescript";
import type * as ts from "typescript";

/**
 * Create the PFM LanguagePlugin for Volar's server (URI-based),
 * with the critical `typescript` property that registers .pfm
 * as a TypeScript-processable extension.
 */
function createPfmLanguagePluginForServer(): LanguagePlugin<URI> {
	const inner = create_pfm_language_plugin();

	return {
		getLanguageId(scriptId: URI): string | undefined {
			if (scriptId.path.endsWith(".pfm")) {
				return "pfm";
			}
			return undefined;
		},

		createVirtualCode(scriptId, languageId, snapshot) {
			if (languageId !== "pfm") return undefined;
			try {
				const result = inner.createVirtualCode!(
					scriptId.fsPath,
					languageId,
					snapshot,
					{ getAssociatedScript: () => undefined },
				);
				return result as VirtualCode | undefined;
			} catch (e: any) {
				console.error("[PFM] createVirtualCode error:", e.message);
				return undefined;
			}
		},

		updateVirtualCode(scriptId, virtualCode, newSnapshot) {
			try {
				const result = inner.updateVirtualCode!(
					scriptId.fsPath,
					virtualCode as any,
					newSnapshot,
					{ getAssociatedScript: () => undefined },
				);
				return result as VirtualCode | undefined;
			} catch (e: any) {
				console.error("[PFM] updateVirtualCode error:", e.message);
				return undefined;
			}
		},

		// This is the critical piece: tells TypeScript about .pfm files
		typescript: {
			extraFileExtensions: [
				{
					extension: "pfm",
					isMixedContent: true,
					scriptKind: 7 satisfies ts.ScriptKind.Deferred,
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
						scriptKind: 3 satisfies ts.ScriptKind.TS,
					};
				}
				return undefined;
			},
			getExtraServiceScripts() {
				return [];
			},
		},
	};
}

function createSvelteLanguagePluginForServer(): LanguagePlugin<URI> {
	const inner = create_svelte_language_plugin();

	return {
		getLanguageId(scriptId: URI): string | undefined {
			if (scriptId.path.endsWith(".svelte")) {
				return "svelte";
			}
			return undefined;
		},

		createVirtualCode(scriptId, languageId, snapshot) {
			if (languageId !== "svelte") return undefined;
			try {
				return inner.createVirtualCode!(
					scriptId.fsPath,
					languageId,
					snapshot,
					{ getAssociatedScript: () => undefined },
				) as VirtualCode | undefined;
			} catch {
				return undefined;
			}
		},

		updateVirtualCode(scriptId, virtualCode, newSnapshot) {
			try {
				return inner.updateVirtualCode!(
					scriptId.fsPath,
					virtualCode as any,
					newSnapshot,
					{ getAssociatedScript: () => undefined },
				) as VirtualCode | undefined;
			} catch {
				return undefined;
			}
		},

		typescript: inner.typescript as any,
	};
}

const connection = createConnection();

// Intercept hover to clean up svelte2tsx internal type noise.
const _on_hover = connection.onHover.bind(connection);
(connection as any).onHover = (handler: Function) => {
	_on_hover(async (params: any, token: any) => {
		const result = await handler(params, token);
		if (result?.contents?.kind === "markdown" && typeof result.contents.value === "string") {
			result.contents.value = clean_svelte_hover(result.contents.value);
		}
		return result;
	});
};

const server = createServer(connection);

connection.listen();

connection.onInitialize((params) => {
	const tsdk = loadTsdkByPath(
		params.initializationOptions?.typescript?.tsdk,
		params.locale,
	);

	return server.initialize(
		params,
		createTypeScriptProject(
			tsdk.typescript,
			tsdk.diagnosticMessages,
			() => ({
				languagePlugins: [
					createPfmLanguagePluginForServer(),
					createSvelteLanguagePluginForServer(),
				],
			}),
		),
		[
			...createTypeScriptServices(tsdk.typescript),
			createCssService(),
			createMarkdownService(),
		],
	);
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);
