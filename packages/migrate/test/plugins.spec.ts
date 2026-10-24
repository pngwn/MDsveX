import { describe, expect, test } from "vitest";

import { migrate_config } from "../src/main";

function config(source: string) {
	const { code, notes } = migrate_config(source);
	return {
		code,
		plugins: notes.filter((n) => n.kind === "plugin"),
		kinds: notes.map((n) => n.kind),
		manual: notes.filter((n) => n.kind === "manual").map((n) => n.message),
	};
}

describe("config: remark and rehype plugins", () => {
	test("each plugin gets a note that names what replaces it", () => {
		const { plugins } = config(
			[
				"import { mdsvex } from 'mdsvex';",
				"import autolink from 'rehype-autolink-headings';",
				"import external from 'rehype-external-links';",
				"import emoji from 'remark-emoji';",
				"mdsvex({",
				"\tsmart_punctuation: true,",
				"\tremarkPlugins: [emoji],",
				"\trehypePlugins: [autolink, [external, { target: '_blank' }]],",
				"});",
			].join("\n"),
		);
		expect(plugins.map((n) => n.line)).toEqual([7, 8, 8]);
		expect(plugins[0].message).toContain("`remark-emoji` does not run now. Install `@mdsvex/plugin-emoji`");
		expect(plugins[1].message).toContain("@mdsvex/plugin-anchors");
		expect(plugins[2].message).toContain("@mdsvex/plugin-external-links");
		for (const n of plugins)
			expect(n.message).toContain("docs#coming-from-remark-and-rehype-plugins");
	});

	test("the option is left in place under a comment", () => {
		const { code } = config(
			"import { mdsvex } from 'mdsvex';\nimport emoji from 'remark-emoji';\nmdsvex({\n\tsmart_punctuation: true,\n\tremarkPlugins: [emoji],\n});",
		);
		expect(code).toContain(
			"\t// TODO(mdsvex-migrate): remarkPlugins is gone, remove it and its imports once each plugin has a replacement.",
		);
		expect(code).toContain("\tremarkPlugins: [emoji],");
	});

	test("a plugin an option replaces turns the option on", () => {
		const { code, plugins } = config(
			"import { mdsvex } from 'mdsvex';\nimport slug from 'rehype-slug';\nimport unwrap from 'remark-unwrap-images';\nmdsvex({ smart_punctuation: true, remarkPlugins: [unwrap], rehypePlugins: [slug] });",
		);
		expect(code).toContain("rehypePlugins: [slug], heading_ids: true, unwrap_images: true });");
		expect(plugins[0].message).toContain("`unwrap_images: true` was added.");
		expect(plugins[1].message).toContain("`heading_ids: true` was added.");
	});

	test("figures, mermaid and keys point at the plugin kit", () => {
		const { code, plugins } = config(
			"import { mdsvex } from 'mdsvex';\nimport figure from 'rehype-figure';\nimport mermaid from 'rehype-mermaid';\nimport kbd from 'remark-kbd';\nmdsvex({ smart_punctuation: true, remarkPlugins: [kbd], rehypePlugins: [figure, mermaid] });",
		);
		expect(plugins.map((n) => n.message.split(". ")[1])).toEqual([
			"Install `@mdsvex/plugin-kit` and add `kit()` to `plugins`",
			"Install `@mdsvex/plugin-kit` and add `figures()` to `plugins`",
			"Install `@mdsvex/plugin-kit` and `mermaid`, and add `mermaid()` to `plugins`",
		]);
		expect(plugins[1].message).toContain("`unwrap_images: true` was added.");
		expect(code).toContain("unwrap_images: true });");
	});

	test("an option that is already set is not added twice", () => {
		const { code, plugins } = config(
			"import { mdsvex } from 'mdsvex';\nimport slug from 'rehype-slug';\nimport old from 'remark-slug';\nmdsvex({ smart_punctuation: true, heading_ids: true, remarkPlugins: [old], rehypePlugins: [slug] });",
		);
		expect(code.match(/heading_ids/g)).toHaveLength(1);
		expect(plugins).toHaveLength(2);
		expect(plugins[0].message).not.toContain("was added");
	});

	test("two plugins for one option add it once", () => {
		const { code } = config(
			"import { mdsvex } from 'mdsvex';\nimport slug from 'rehype-slug';\nimport old from 'remark-slug';\nmdsvex({ smart_punctuation: true, remarkPlugins: [old], rehypePlugins: [slug] });",
		);
		expect(code.match(/heading_ids: true/g)).toHaveLength(1);
	});

	test("a plugin with options of its own is left to the reader", () => {
		const { code, plugins } = config(
			"import { mdsvex } from 'mdsvex';\nimport slug from 'rehype-slug';\nmdsvex({ smart_punctuation: true, rehypePlugins: [[slug, { prefix: 'h-' }]] });",
		);
		expect(code).not.toContain("heading_ids");
		expect(plugins[0].message).toContain("set `heading_ids` by hand");
	});

	test("required plugins, called plugins and a default member", () => {
		const { plugins } = config(
			[
				"const { mdsvex } = require('mdsvex');",
				"const slug = require('rehype-slug');",
				"const toc = require('remark-toc').default;",
				"const math = require('remark-math');",
				"module.exports = mdsvex({ smart_punctuation: true, remarkPlugins: [toc(), math.default], rehypePlugins: [slug] });",
			].join("\n"),
		);
		expect(plugins.map((n) => n.message.split("`")[1])).toEqual([
			"remark-toc",
			"remark-math",
			"rehype-slug",
		]);
		expect(plugins[1].message).toContain("math: true");
	});

	test("a plugin the docs do not list, and one with no import", () => {
		const { plugins } = config(
			"import { mdsvex } from 'mdsvex';\nimport mine from './my-plugin.js';\nmdsvex({ smart_punctuation: true, remarkPlugins: [mine, () => (tree) => tree] });",
		);
		expect(plugins[0].message).toContain("`./my-plugin.js` does not run now, and nothing is listed for it");
		expect(plugins[1].message).toContain("`() => (tree) => tree` does not run now.");
	});

	test("plugins held in a variable are followed, anything else is flagged whole", () => {
		const followed = config(
			"import { mdsvex } from 'mdsvex';\nimport slug from 'rehype-slug';\nconst rehypePlugins = [slug];\nmdsvex({ smart_punctuation: true, rehypePlugins });",
		);
		expect(followed.plugins[0].message).toContain("`rehype-slug`");
		const opaque = config(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ smart_punctuation: true, rehypePlugins: plugins() });",
		);
		expect(opaque.plugins).toHaveLength(1);
		expect(opaque.plugins[0].message).toContain("Can't tell which plugins this holds");
	});

	test("the result is javascript", () => {
		const { code } = config(
			"import { mdsvex } from 'mdsvex';\nimport slug from 'rehype-slug';\nexport default { preprocess: mdsvex({\n\textensions: ['.svx'],\n\trehypePlugins: [slug],\n}) };",
		);
		expect(() => new Function(code.replace(/^import .*$/gm, "").replace("export default", "return"))).not.toThrow();
		expect(code).toContain("\theading_ids: true,\n");
	});
});

describe("config: external links", () => {
	test("a 0.x config is told that nofollow is gone", () => {
		const { kinds } = config("import { mdsvex } from 'mdsvex';\nmdsvex({ extensions: ['.svx'] });");
		expect(kinds).toEqual(["external_links", "smart_punctuation"]);
		expect(config("import { mdsvex } from 'mdsvex';\nmdsvex();").kinds).toContain("external_links");
	});

	test("a config that was migrated before is not told again", () => {
		const { kinds } = config(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ smart_punctuation: true });",
		);
		expect(kinds).toEqual([]);
	});
});

describe("config: extension and frontmatter", () => {
	test("extension becomes extensions", () => {
		expect(
			config("import { mdsvex } from 'mdsvex';\nmdsvex({ smart_punctuation: true, extension: '.md' });").code,
		).toContain("mdsvex({ smart_punctuation: true, extensions: ['.md'] });");
		expect(
			config("import { mdsvex } from 'mdsvex';\nconst extension = '.md';\nmdsvex({ smart_punctuation: true, extension });").code,
		).toContain("mdsvex({ smart_punctuation: true, extensions: [extension] });");
	});

	test("extension beside extensions is flagged", () => {
		const { code, manual } = config(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ smart_punctuation: true, extension: '.md', extensions: ['.svx'] });",
		);
		expect(code).toContain("extension: '.md'");
		expect(manual[0]).toContain("Both `extension` and `extensions` are set");
	});

	test("a frontmatter marker and type are flagged", () => {
		const { manual } = config(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ smart_punctuation: true, frontmatter: { marker: '+', type: 'toml', parse: (fm) => toml.parse(fm) } });",
		);
		expect(manual).toHaveLength(2);
		expect(manual[0]).toContain("`frontmatter.marker` is gone");
		expect(manual[1]).toContain("`frontmatter.type` is gone");
	});

	test("a frontmatter parser that takes messages is flagged", () => {
		const { manual } = config(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ smart_punctuation: true, frontmatter: { parse(fm, messages) { return yaml.load(fm); } } });",
		);
		expect(manual).toHaveLength(1);
		expect(manual[0]).toContain("no longer gets a `messages` array");
	});
});
