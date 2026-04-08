/**
 * PFM VS Code Extension.
 */

import * as path from "path";
import * as vscode from "vscode";
import { getTsdk } from "@volar/vscode";
import {
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext) {
	const serverModule = context.asAbsolutePath(
		path.join("server", "server.cjs"),
	);

	const serverOptions: ServerOptions = {
		run: {
			module: serverModule,
			transport: TransportKind.ipc,
		},
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: { execArgv: ["--nolazy", "--inspect=6009"] },
		},
	};

	const tsdk = await getTsdk(context);

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ language: "pfm" }],
		synchronize: {
			fileEvents: vscode.workspace.createFileSystemWatcher("**/*.pfm"),
		},
		initializationOptions: {
			typescript: {
				tsdk: tsdk?.tsdk,
			},
		},
	};

	client = new LanguageClient(
		"pfm",
		"PFM Language Server",
		serverOptions,
		clientOptions,
	);

	await client.start();
}

export function deactivate(): Thenable<void> | undefined {
	return client?.stop();
}
