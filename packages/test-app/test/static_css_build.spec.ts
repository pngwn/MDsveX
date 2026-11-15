import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// vite 8 of this app, its bundler drops what vite 7 kept
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

const PAGES = ["steps", "callouts", "styled", "unstyled"];

const NOTE = [
	"<script>",
	"  let { children } = $props();",
	"  $effect(() => console.log('NOTE_COMPONENT_CODE'));",
	"</script>",
	'<div class="x-note">{@render children()}</div>',
].join("\n");

/**
 * an app with a first party plugin and a plugin package of the same shape,
 * its styled directives module a side effect in package.json importing its
 * css, its unstyled one not, each page in an entry of its own
 */
function write_app(): string {
	const root = mkdtempSync(join(HERE, ".tmp-static-css-"));
	const entry = (name: string) =>
		`${name}: new URL('./src/${name}.js', import.meta.url).pathname`;
	const files: Record<string, string> = {
		"package.json": JSON.stringify({ name: "app", private: true, type: "module" }),
		"vite.config.js": [
			"import { mdsvex } from 'mdsvex';",
			"import { steps } from '@mdsvex/plugin-steps';",
			"import { callouts } from '@mdsvex/plugin-callouts';",
			"import { svelte } from '@sveltejs/vite-plugin-svelte';",
			"export default {",
			`  build: { manifest: true, rollupOptions: { input: { ${PAGES.map(entry).join(", ")} } } },`,
			"  plugins: [",
			"    mdsvex({ plugins: [",
			"      steps(),",
			"      callouts(),",
			"      { name: 'styled', module: 'plugin-x/directives', directives: { aside: {} } },",
			"      { name: 'unstyled', module: 'plugin-x/directives/unstyled', directives: { hint: {} } },",
			"    ] }),",
			"    svelte({ extensions: ['.svelte', '.svx'] }),",
			"  ],",
			"};",
		].join("\n"),
		"node_modules/plugin-x/package.json": JSON.stringify({
			name: "plugin-x",
			type: "module",
			exports: {
				"./directives": { svelte: "./directives.js" },
				"./directives/unstyled": { svelte: "./unstyled.js" },
			},
			sideEffects: ["**/*.css", "./directives.js"],
		}),
		"node_modules/plugin-x/directives.js": [
			"import './x.css';",
			"export { default as aside } from './Note.static.svelte';",
		].join("\n"),
		"node_modules/plugin-x/unstyled.js":
			"export { default as hint } from './Tip.static.svelte';",
		"node_modules/plugin-x/x.css":
			".x-note { border: 3px solid rebeccapurple; }",
		"node_modules/plugin-x/Note.static.svelte": NOTE,
		"node_modules/plugin-x/Tip.static.svelte": NOTE.replace("x-note", "x-tip"),
		"src/steps.svx": ":::steps\n## One\n\nFirst.\n:::\n",
		"src/callouts.svx": ":::warning[Mind]\nCareful.\n:::\n",
		"src/styled.svx": ":::aside\nStyled.\n:::\n",
		"src/unstyled.svx": ":::hint\nUnstyled.\n:::\n",
	};
	for (const name of PAGES)
		files[`src/${name}.js`] =
			`import Doc from './${name}.svx';\nconsole.log(Doc);\n`;
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}

describe("the css of a plugin whose directives are all static, in a build", () => {
	let root: string;
	let manifest: Record<string, { css?: string[] }>;

	beforeAll(async () => {
		root = write_app();
		await build({
			root,
			configFile: join(root, "vite.config.js"),
			logLevel: "silent",
		});
		manifest = JSON.parse(
			readFileSync(join(root, "dist/.vite/manifest.json"), "utf8"),
		);
	}, 120_000);

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const css_of = (name: string) =>
		(manifest[`src/${name}.js`].css ?? [])
			.map((f) => readFileSync(join(root, "dist", f), "utf8"))
			.join("\n");

	test("a page of shells loads the css of the module its directives come from", () => {
		expect(css_of("steps")).toContain(":where(.steps)");
		expect(css_of("styled")).toMatch(/\.x-note\{border:3px solid/);
		expect(css_of("callouts")).toContain(":where(.callout)");
	});

	test("a page loads no css of a module it uses no directive of", () => {
		expect(css_of("steps")).not.toContain("x-note");
		expect(css_of("styled")).not.toContain(":where(.steps)");
		expect(css_of("steps")).not.toContain(":where(.callout)");
		expect(css_of("callouts")).not.toContain(":where(.steps)");
		const unstyled = css_of("unstyled");
		expect(unstyled).not.toContain("x-note");
		expect(unstyled).not.toContain(":where(.steps)");
	});

	test("the pages carry the shells and no component code", () => {
		const js = readdirSync(join(root, "dist/assets"))
			.filter((f) => f.endsWith(".js"))
			.map((f) => readFileSync(join(root, "dist/assets", f), "utf8"))
			.join("\n");
		expect(js).toContain("x-note");
		expect(js).toContain("x-tip");
		expect(js).toContain("steps");
		expect(js).toContain('data-kind="warning"');
		expect(js).not.toContain("NOTE_COMPONENT_CODE");
	});
});
