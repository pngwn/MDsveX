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
import { createPfmLanguagePlugin } from "@pfm/language-core";
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
	const inner = createPfmLanguagePlugin();

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
				{
					extension: "svelte",
					isMixedContent: true,
					scriptKind: 7 satisfies ts.ScriptKind.Deferred,
				},
			],
			getServiceScript(): undefined {
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
							scriptKind: 3 satisfies ts.ScriptKind.TS,
						});
					} else if (code.languageId === "javascript") {
						scripts.push({
							fileName: fileName + "." + code.id + ".js",
							code,
							extension: ".js",
							scriptKind: 1 satisfies ts.ScriptKind.JS,
						});
					}
				}
				return scripts;
			},
		},
	};
}

const connection = createConnection();
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
				languagePlugins: [createPfmLanguagePluginForServer()],
			}),
		),
		[
			...createTypeScriptServices(tsdk.typescript),
			createCssService(),
		],
	);
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);
