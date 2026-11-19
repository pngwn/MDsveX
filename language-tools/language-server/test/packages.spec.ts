import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// reads the built packages, so it needs the language tools built
const TOOLS = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGES = ["source-map", "language-core", "language-server"];

interface Manifest {
	name: string;
	types?: string;
	bin?: Record<string, string>;
	files?: string[];
	exports: Record<string, Record<string, string>>;
}

const manifest = (dir: string): Manifest =>
	JSON.parse(readFileSync(resolve(TOOLS, dir, "package.json"), "utf8"));

/** every file a manifest points at, by where it names it */
function targets(m: Manifest): [string, string][] {
	const out: [string, string][] = [];
	for (const [sub, conditions] of Object.entries(m.exports))
		for (const [condition, file] of Object.entries(conditions))
			out.push([`exports["${sub}"].${condition}`, file]);
	if (m.types) out.push(["types", m.types]);
	for (const [name, file] of Object.entries(m.bin ?? {}))
		out.push([`bin.${name}`, file]);
	return out;
}

/** runs code as an es module in plain node from dir, no vite and no typescript */
function node(dir: string, code: string): string {
	return execFileSync(process.execPath, ["--input-type=module", "-e", code], {
		cwd: resolve(TOOLS, dir),
		encoding: "utf8",
		timeout: 20_000,
	});
}

describe.each(PACKAGES)("@mdsvex/%s as published", (dir) => {
	const m = manifest(dir);

	it("names built files, never typescript source", () => {
		for (const [where, file] of targets(m)) {
			expect(file, where).toMatch(/^\.\/dist\//);
			expect(file, where).not.toMatch(/(?<!\.d)\.ts$/);
			expect(existsSync(resolve(TOOLS, dir, file)), `${where} ${file}`).toBe(
				true,
			);
		}
		expect(m.files).toEqual(["dist"]);
	});

	it("imports from node", () => {
		const subpaths = Object.keys(m.exports).map((sub) => m.name + sub.slice(1));
		// from the package itself, the specifier resolves through its own exports
		const out = node(
			dir,
			`for (const s of ${JSON.stringify(subpaths)}) console.log(s, Object.keys(await import(s)).length);`,
		);
		for (const s of subpaths)
			expect(out).toMatch(new RegExp(`^${s} [1-9]`, "m"));
	});
});

describe("@mdsvex/language-server", () => {
	it("starts no server on import, the command starts it", () => {
		// a started server waits on a connection, so the process would not end
		const out = node(
			"language-server",
			"const m = await import('@mdsvex/language-server'); console.log(typeof m.start);",
		);
		expect(out.trim()).toBe("function");
	});

	it("has a command node runs directly", () => {
		const bin = manifest("language-server").bin!["pfm-language-server"];
		const text = readFileSync(resolve(TOOLS, "language-server", bin), "utf8");
		expect(text.startsWith("#!/usr/bin/env node\n")).toBe(true);
	});
});
