import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { run } from "../src/cli";
import { kind_of, migrate_file } from "../src/main";

let cwd: string;
let out: string[];
let err: string[];

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "mdsvex-migrate-"));
	out = [];
	err = [];
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

function write(path: string, source: string): void {
	mkdirSync(dirname(join(cwd, path)), { recursive: true });
	writeFileSync(join(cwd, path), source);
}

function read(path: string): string {
	return readFileSync(join(cwd, path), "utf8");
}

function cli(...args: string[]): number {
	return run(args, { cwd, out: (l) => out.push(l), err: (l) => err.push(l) });
}

describe("migrate_file", () => {
	test("a file is migrated as what its name says", () => {
		expect(kind_of("svelte.config.js")).toBe("config");
		expect(kind_of("vite.config.mts")).toBe("config");
		expect(kind_of("src/Layout.svelte")).toBe("template");
		expect(kind_of("post.svx")).toBe("document");
		expect(kind_of("README.md")).toBe("document");
	});

	test("a document with crlf line endings keeps them", () => {
		const { code } = migrate_file("a.md", "Title\r\n=====\r\n\r\n*a*\r\n");
		expect(code).toBe("# Title\r\n\r\n_a_\r\n");
	});

	test("a document with mixed line endings is written with linefeeds", () => {
		const { code } = migrate_file("a.md", "Title\r\n=====\n\n*a*\n");
		expect(code).toBe("# Title\n\n_a_\n");
	});

	test("a layout component only gets notes", () => {
		const source = "<div><slot /></div>\n";
		const result = migrate_file("Layout.svelte", source);
		expect(result.code).toBe(source);
		expect(result.notes.map((n) => n.kind)).toEqual(["slot"]);
	});
});

describe("mdsvex-migrate", () => {
	test("migrates a document in place", () => {
		write("post.svx", "Title\n=====\n\n**strong**\n");
		expect(cli("post.svx")).toBe(0);
		expect(read("post.svx")).toBe("# Title\n\n*strong*\n");
		expect(err).toEqual(["1 file read, 1 migrated, 0 notes"]);
	});

	test("a directory migrates its .md and .svx documents", () => {
		write("docs/a.md", "*a*\n");
		write("docs/nested/b.svx", "*b*\n");
		write("docs/c.txt", "*c*\n");
		write("docs/node_modules/d.md", "*d*\n");
		write("docs/.cache/e.md", "*e*\n");
		expect(cli("docs")).toBe(0);
		expect(read("docs/a.md")).toBe("_a_\n");
		expect(read("docs/nested/b.svx")).toBe("_b_\n");
		expect(read("docs/c.txt")).toBe("*c*\n");
		expect(read("docs/node_modules/d.md")).toBe("*d*\n");
		expect(read("docs/.cache/e.md")).toBe("*e*\n");
	});

	test("a config is migrated and its notes printed", () => {
		write(
			"svelte.config.js",
			"import { mdsvex } from 'mdsvex';\nexport default { preprocess: [mdsvex({ layout: './L.svelte', smartypants: false })] };\n",
		);
		expect(cli("svelte.config.js")).toBe(0);
		expect(read("svelte.config.js")).toContain("templates: { default: './L.svelte' }");
		expect(out.some((l) => l.startsWith("svelte.config.js:"))).toBe(true);
	});

	test("a layout is never written, and its notes point at the line", () => {
		const source = "<script>\n</script>\n\n<slot />\n";
		write("Layout.svelte", source);
		expect(cli("Layout.svelte")).toBe(0);
		expect(read("Layout.svelte")).toBe(source);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatch(/^Layout\.svelte:4:1 /);
	});

	test("--check writes nothing and fails when a file would change", () => {
		write("a.md", "*a*\n");
		write("b.md", "_b_\n");
		expect(cli("--check", "a.md", "b.md")).toBe(1);
		expect(read("a.md")).toBe("*a*\n");
		expect(out).toEqual(["a.md would change"]);
		expect(cli("--check", "b.md")).toBe(0);
	});

	test("--smartypants rewrites dashes for the 0.x default", () => {
		write("a.md", "a -- b\n");
		expect(cli("--smartypants", "a.md")).toBe(0);
		expect(read("a.md")).toBe("a --- b\n");
	});

	test("--smartypants takes a 0.x object as JSON", () => {
		write("a.md", "a -- b --- c\n");
		expect(cli('--smartypants={"dashes":"inverted"}', "a.md")).toBe(0);
		expect(read("a.md")).toBe("a --- b -- c\n");
	});

	test("--smartypants with a value that is not JSON fails before reading", () => {
		write("a.md", "*a*\n");
		expect(cli("--smartypants=yes", "a.md")).toBe(2);
		expect(read("a.md")).toBe("*a*\n");
	});

	test("--math reads dollars as remark-math did", () => {
		write("a.md", "$x$\n");
		expect(cli("--math", "a.md")).toBe(0);
		expect(read("a.md")).toBe("$`x`$\n");
	});

	test("a config that does not parse is reported and the rest still run", () => {
		write("broken.js", "export default {\n");
		write("a.md", "*a*\n");
		expect(cli("broken.js", "a.md")).toBe(1);
		expect(err[0]).toMatch(/^broken\.js: /);
		expect(read("a.md")).toBe("_a_\n");
	});

	test("a missing path fails", () => {
		expect(cli("nope.md")).toBe(1);
		expect(err[0]).toBe("nope.md: no such file or directory");
	});

	test("no paths prints the usage and fails, --help succeeds", () => {
		expect(cli()).toBe(2);
		expect(err[0]).toMatch(/^Usage: mdsvex-migrate/);
		expect(cli("--help")).toBe(0);
		expect(out[0]).toMatch(/^Usage: mdsvex-migrate/);
	});

	test("an unknown option fails", () => {
		expect(cli("--nope", "a.md")).toBe(2);
	});
});
