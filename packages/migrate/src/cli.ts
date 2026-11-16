import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

import { migrate_file } from "./file.js";
import type { MigrateOptions } from "./main.js";
import type { LegacySmartypants } from "./serialize.js";

export const HELP = `Usage: mdsvex-migrate [options] <path...>

Migrates mdsvex 0.x files to mdsvex next, in place.

  a directory          every .md and .svx document in it, outside
                       node_modules and folders that start with a dot
  .js .ts .mjs ...     a config: layout, highlight, smartypants, extension
                       and plugin options
  .svelte              a layout component, checked for what a template
                       needs changed, never written
  any other file       a document, CommonMark or GFM written as PFM

Options
  --smartypants        the documents were written for the 0.x smartypants
                       default, so dashes and backtick quotes are rewritten
                       to render as they did
  --smartypants=<json> the same for a 0.x smartypants object,
                       '{"dashes":"inverted","backticks":"all"}'
  --math               the documents were written for remark-math
  --check              write nothing, exit 1 when a file would change
  -h, --help           show this

Notes on what to check by hand are printed as path:line:column, at the line
in the file before it was migrated.`;

export interface Io {
	cwd: string;
	out: (line: string) => void;
	err: (line: string) => void;
}

const DOCUMENT = /\.(md|svx)$/i;

/** sorted, skipping node_modules and dot folders */
function documents_in(dir: string): string[] {
	const found: string[] = [];
	const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...documents_in(path));
		else if (entry.isFile() && DOCUMENT.test(entry.name)) found.push(path);
	}
	return found;
}

function read_smartypants(value: string): LegacySmartypants {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error(
			`--smartypants takes the 0.x option as JSON, such as '{"dashes":"inverted"}', not ${value}`,
		);
	}
	if (typeof parsed === "boolean" || (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)))
		return parsed as LegacySmartypants;
	throw new Error(`--smartypants takes true, false or an object, not ${value}`);
}

/** returns the exit code */
export function run(args: string[], io: Io = {
	cwd: process.cwd(),
	out: (line) => console.log(line),
	err: (line) => console.error(line),
}): number {
	// parseArgs has no option that is a flag alone and also takes a value
	let smartypants: LegacySmartypants | undefined;
	const rest: string[] = [];
	for (const arg of args) {
		if (arg === "--smartypants") smartypants = true;
		else if (arg.startsWith("--smartypants=")) {
			try {
				smartypants = read_smartypants(arg.slice("--smartypants=".length));
			} catch (error) {
				io.err((error as Error).message);
				return 2;
			}
		} else rest.push(arg);
	}

	let parsed;
	try {
		parsed = parseArgs({
			args: rest,
			allowPositionals: true,
			options: {
				math: { type: "boolean" },
				check: { type: "boolean" },
				help: { type: "boolean", short: "h" },
			},
		});
	} catch (error) {
		io.err((error as Error).message);
		io.err("Run mdsvex-migrate --help for the options.");
		return 2;
	}
	const { values, positionals } = parsed;

	if (values.help) {
		io.out(HELP);
		return 0;
	}
	if (positionals.length === 0) {
		io.err(HELP);
		return 2;
	}

	const options: MigrateOptions = {};
	if (smartypants !== undefined) options.smartypants = smartypants;
	if (values.math) options.math = true;
	const check = values.check === true;

	const files = new Set<string>();
	let failed = false;
	for (const positional of positionals) {
		const path = resolve(io.cwd, positional);
		let stat;
		try {
			stat = statSync(path);
		} catch {
			io.err(`${positional}: no such file or directory`);
			failed = true;
			continue;
		}
		if (stat.isDirectory()) for (const file of documents_in(path)) files.add(file);
		else files.add(path);
	}

	let changed = 0;
	let notes = 0;
	for (const path of files) {
		const name = relative(io.cwd, path) || path;
		const source = readFileSync(path, "utf8");
		let result;
		try {
			result = migrate_file(path, source, options);
		} catch (error) {
			io.err(`${name}: ${(error as Error).message}`);
			failed = true;
			continue;
		}
		for (const note of result.notes) {
			io.out(`${name}:${note.line}:${note.column} ${note.message}`);
			notes++;
		}
		if (result.code === source) continue;
		changed++;
		if (check) io.out(`${name} would change`);
		else writeFileSync(path, result.code);
	}

	const files_word = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;
	const verb = check ? "would change" : "migrated";
	io.err(
		`${files_word(files.size)} read, ${changed} ${verb}, ${notes} ${notes === 1 ? "note" : "notes"}`,
	);

	if (failed) return 1;
	return check && changed > 0 ? 1 : 0;
}
