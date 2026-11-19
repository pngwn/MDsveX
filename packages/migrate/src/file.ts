import { check_template } from "./template.js";
import { migrate_config } from "./config.js";
import { migrate_document, type MigrateOptions } from "./main.js";
import type { MigrateResult } from "./notes.js";

export type FileKind = "document" | "config" | "template";

export interface FileResult extends MigrateResult {
	kind: FileKind;
}

const CONFIG = /\.[cm]?[jt]s$/i;
const TEMPLATE = /\.svelte$/i;

/** a script is a config, a svelte component is a layout, anything else is a document */
export function kind_of(filename: string): FileKind {
	if (CONFIG.test(filename)) return "config";
	if (TEMPLATE.test(filename)) return "template";
	return "document";
}

/**
 * migrate a file as kind_of says from its name, a document read with crlf is
 * written with crlf, throws a SyntaxError for a config that does not parse
 */
export function migrate_file(
	filename: string,
	source: string,
	options: MigrateOptions = {},
): FileResult {
	const kind = kind_of(filename);
	if (kind === "config") return { kind, ...migrate_config(source) };
	if (kind === "template") return { kind, code: source, notes: check_template(source) };

	const { code, notes } = migrate_document(source, options);
	const crlf = /\r\n/.test(source) && !/(^|[^\r])\n/.test(source);
	return { kind, code: crlf ? code.replace(/\n/g, "\r\n") : code, notes };
}
