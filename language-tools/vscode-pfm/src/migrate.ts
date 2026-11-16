/** the mdsvex.migrate command, one undo puts the file back */

import * as vscode from "vscode";
import type { MigrateOptions } from "@mdsvex/migrate";

export const COMMAND = "mdsvex.migrate";

function options_for(uri: vscode.Uri): MigrateOptions {
	const config = vscode.workspace.getConfiguration("mdsvex.migrate", uri);
	const options: MigrateOptions = {};
	const smartypants = config.get<MigrateOptions["smartypants"]>("smartypants");
	if (smartypants !== undefined && smartypants !== false) options.smartypants = smartypants;
	if (config.get<boolean>("math") === true) options.math = true;
	return options;
}

export function register_migrate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel("mdsvex migrate");

	const migrate = async (editor: vscode.TextEditor) => {
		const document = editor.document;
		const version = document.version;
		const source = document.getText();
		const name = vscode.workspace.asRelativePath(document.uri);

		let result;
		try {
			// remark and acorn are most of the bundle, only this command needs them
			const { migrate_file } = await import("@mdsvex/migrate");
			result = migrate_file(document.fileName, source, options_for(document.uri));
		} catch (error) {
			void vscode.window.showErrorMessage(
				`Could not migrate ${name}: ${(error as Error).message}`,
			);
			return;
		}

		const changed = result.code !== source;
		if (changed) {
			const applied =
				document.version === version &&
				(await editor.edit((edit) =>
					edit.replace(
						new vscode.Range(document.positionAt(0), document.positionAt(source.length)),
						result.code,
					),
				).then(
					(ok) => ok,
					// the editor was closed
					() => false,
				));
			if (!applied) {
				void vscode.window.showWarningMessage(
					`${name} changed while it was migrated. Run the command again.`,
				);
				return;
			}
		}

		const count = result.notes.length;
		if (count > 0) {
			output.appendLine(
				changed
					? `${name}, at the lines before the migration:`
					: `${name}:`,
			);
			for (const note of result.notes) {
				output.appendLine(`  ${note.line}:${note.column} ${note.message}`);
			}
			output.appendLine("");
			output.show(true);
		}

		const notes = count === 0 ? "" : ` ${count} ${count === 1 ? "note" : "notes"} to check.`;
		const done = changed
			? `Migrated ${name}.`
			: result.kind === "template"
				? `Checked ${name}, a layout is never rewritten.`
				: `${name} needed no changes.`;
		void vscode.window.showInformationMessage(done + notes);
	};

	context.subscriptions.push(
		output,
		vscode.commands.registerTextEditorCommand(COMMAND, migrate),
	);
}
