import { embeds } from '@mdsvex/plugin-embeds';
import { compile, compile_text } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import {
	expect_parity,
	PATHS,
} from '../../../packages/parse/test/plugin_harness';

function setup() {
	return {
		directive_handlers: [{ name: 'embeds', directives: embeds().directives! }],
	};
}

/** the tree on both builders, whole and fed in chunks, directive names and args printed */
function tree(source: string): unknown {
	return expect_parity(source, setup, { attrs: ['name', 'args'] });
}

/** the warning codes of a document, the same on every path */
function warnings(source: string): string[] {
	let first: string[] | undefined;
	for (const [name, run] of PATHS) {
		const found = run(source, setup()).dispatcher!.warnings ?? [];
		const codes = found.map((warning) => warning.code);
		if (first === undefined) first = codes;
		else expect(codes, name).toEqual(first);
	}
	return first!;
}

describe('embeds', () => {
	test('the label is the title of the frame, and a frame shows no label', () => {
		expect(tree('::youtube[A *talk*](id=dQw4w9WgXcQ, start=30)\n')).toEqual([
			'root',
			'directive_leaf name="youtube" args={"id":"dQw4w9WgXcQ","start":"30","title":"A talk"}',
		]);
	});

	test('with no id the label stays, the component shows it in place of a frame', () => {
		expect(tree('::youtube[A talk]\n')).toEqual([
			'root',
			[
				'directive_leaf name="youtube" args={"title":"A talk"}',
				['directive_label', 'text:A talk'],
			],
		]);
	});

	test('a title written as an arg is kept', () => {
		expect(tree('::vimeo[Label](id=76979871, title=Mine)\n')).toEqual([
			'root',
			'directive_leaf name="vimeo" args={"id":"76979871","title":"Mine"}',
		]);
	});

	test('a missing or malformed id and a missing title warn', () => {
		expect(warnings('::youtube[A talk](id=dQw4w9WgXcQ)\n')).toEqual([]);
		expect(warnings('::youtube[A talk]\n')).toEqual(['embed_id']);
		expect(warnings('::youtube[A talk](id=short)\n')).toEqual(['embed_id']);
		expect(warnings('::vimeo[A talk](id=abc)\n')).toEqual(['embed_id']);
		expect(warnings('::vimeo(id=76979871)\n')).toEqual(['embed_without_title']);
	});
});

describe('compile', () => {
	test('imports only the components a document uses', () => {
		expect(
			compile('::vimeo[A film](id=76979871)\n', { plugins: [embeds()] }).code
		).toBe(
			[
				'<script>',
				"import { vimeo as Vimeo_MDSVEX_D_G } from '@mdsvex/plugin-embeds/directives';",
				'</script><Vimeo_MDSVEX_D_G id="76979871" title="A film" />',
			].join('\n')
		);
	});

	test('css false imports the components without the stylesheet', () => {
		expect(
			compile('::vimeo[A film](id=76979871)\n', {
				plugins: [embeds({ css: false })],
			}).code
		).toContain("from '@mdsvex/plugin-embeds/directives/unstyled';");
	});

	test('the title of an embed is the text a reader sees, an expression leaves none', () => {
		const { code } = compile('::youtube[A {b} talk](id=dQw4w9WgXcQ)\n', {
			plugins: [embeds()],
		});
		expect(code).toContain('id="dQw4w9WgXcQ" title="A talk" />');
		expect(
			compile('::youtube[A \\{b\\} talk](id=dQw4w9WgXcQ)\n', {
				plugins: [embeds()],
			}).code
		).toContain('title={"A {b} talk"}');
	});

	test('the plain text of an embed is its title', async () => {
		const text = async (source: string) =>
			(await compile_text(source, { plugins: [embeds()] })).text;
		expect(await text('Watch.\n\n::vimeo[A film](id=76979871)\n')).toBe(
			'Watch.\n\nA film'
		);
		expect(await text('::vimeo[Label](id=76979871, title=Mine)\n')).toBe(
			'Mine'
		);
	});

	test('warnings come back with the plugin and the line', () => {
		const { warnings: found } = compile('Text.\n\n::youtube[](id=no)\n', {
			plugins: [embeds()],
		});
		expect(
			found?.map((warning) => [
				warning.code,
				warning.plugin,
				warning.start.line,
			])
		).toEqual([
			['embed_id', 'embeds', 3],
			['embed_without_title', 'embeds', 3],
		]);
	});
});
