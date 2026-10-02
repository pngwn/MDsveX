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
import {
	create_config_loader,
	create_pfm_language_plugin,
	create_svelte_language_plugin,
} from "@mdsvex/language-core";
import type { ConfigLoader } from "@mdsvex/language-core";
import { watch } from "node:fs";
import { clean_svelte_hover } from "./clean_hover";
import { create_compile_diagnostics } from "./compile_diagnostics";
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
function createPfmLanguagePluginForServer(
	typescript: typeof ts,
	config: ConfigLoader,
): LanguagePlugin<URI> {
	const inner = create_pfm_language_plugin({ typescript, config });

	return {
		getLanguageId(scriptId: URI): string | undefined {
			if (scriptId.scheme !== "file" && scriptId.scheme !== "untitled") {
				return undefined;
			}
			return inner.getLanguageId(scriptId.fsPath);
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

		// tells typescript about the document extensions
		typescript: {
			extraFileExtensions: inner.typescript!.extraFileExtensions,
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

// the manifest sits in node_modules, which editors do not watch, so the server does
const watched = new Set<string>();
let reload_timer: ReturnType<typeof setTimeout> | undefined;
function config_changed() {
	clearTimeout(reload_timer);
	reload_timer = setTimeout(() => {
		server.project.reload();
		server.languageFeatures.requestRefresh(false);
	}, 100);
}
function watch_config(file: string) {
	if (watched.has(file)) return;
	watched.add(file);
	try {
		// a rename replaces the manifest, which ends a watch on its old inode
		const watcher = watch(file, () => {
			watcher.close();
			watched.delete(file);
			config_changed();
		});
		watcher.on("error", () => watched.delete(file));
	} catch {
		watched.delete(file);
	}
}

connection.onInitialize((params) => {
	const tsdk = loadTsdkByPath(
		params.initializationOptions?.typescript?.tsdk,
		params.locale,
	);
	// the tsdk types against the typescript volar was built with
	const typescript = tsdk.typescript as unknown as typeof ts;
	const config = create_config_loader({ typescript, on_read: watch_config });

	return server.initialize(
		params,
		createTypeScriptProject(
			tsdk.typescript,
			tsdk.diagnosticMessages,
			() => ({
				languagePlugins: [
					createPfmLanguagePluginForServer(typescript, config),
					createSvelteLanguagePluginForServer(),
				],
			}),
		),
		[
			...createTypeScriptServices(tsdk.typescript),
			createCssService(),
			createMarkdownService(),
			create_compile_diagnostics(),
		],
	);
});

connection.onInitialized(() => {
	server.initialized();
	// a config that appears later, or one an editor does watch, reloads too
	server.fileWatcher.watchFiles([
		"**/mdsvex.config.json",
		"**/node_modules/.mdsvex/manifest.json",
	]);
	server.fileWatcher.onDidChangeWatchedFiles(({ changes }) => {
		if (
			changes.some(
				(c) =>
					c.uri.endsWith("/mdsvex.config.json") ||
					c.uri.endsWith("/.mdsvex/manifest.json"),
			)
		) {
			config_changed();
		}
	});
});

connection.onShutdown(server.shutdown);
