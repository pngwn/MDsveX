import { figures } from '@mdsvex/plugin-kit';
import { compile } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import { expect_parity } from '../../../packages/parse/test/plugin_harness';

const bundle = figures();

/** the tree on both builders, whole and fed in chunks, with the plugin and unwrap_images as given */
function tree(source: string, unwrap_images = true): unknown {
	return expect_parity(
		source,
		() => ({
			plugins: [{ name: bundle.name, ...bundle.parse! }],
			syntax: { unwrap_images },
		}),
		{ attrs: ['title', 'figure'] }
	);
}

const FIGURE = 'image title="T" figure="true"';
const IMAGE = 'image title="T"';

describe('which images are figures', () => {
	test('an image unwrapped from its paragraph', () => {
		expect(tree('![a](/a.png "T")\n')).toEqual(['root', [FIGURE, 'text:a']]);
		expect(tree('![a](/a.png "T") ![b](/b.png "T")\n')).toEqual([
			'root',
			[FIGURE, 'text:a'],
			'text: ',
			[FIGURE, 'text:b'],
		]);
	});

	test('an unwrapped image in a link, a block quote and a directive', () => {
		expect(tree('[![a](/a.png "T")](/full.png)\n')).toEqual([
			'root',
			['link', [FIGURE, 'text:a']],
		]);
		expect(tree('> ![a](/a.png "T")\n')).toEqual([
			'root',
			['block_quote', [FIGURE, 'text:a']],
		]);
		expect(tree(':::note\n![a](/a.png "T")\n:::\n')).toEqual([
			'root',
			['directive_container', [FIGURE, 'text:a']],
		]);
	});

	test('an image beside text stays an image', () => {
		expect(tree('See ![a](/a.png "T")\n')).toEqual([
			'root',
			['paragraph', 'text:See ', [IMAGE, 'text:a']],
		]);
	});

	test('an image in a heading or a table cell stays an image', () => {
		expect(tree('# ![a](/a.png "T")\n')).toEqual([
			'root',
			['heading', [IMAGE, 'text:a']],
		]);
		const table = tree('| a |\n| - |\n| ![a](/a.png "T") |\n') as unknown[];
		expect(JSON.stringify(table)).toContain(JSON.stringify([IMAGE, 'text:a']));
		expect(JSON.stringify(table)).not.toContain('figure');
	});

	test('without unwrap_images every paragraph keeps its image', () => {
		expect(tree('![a](/a.png "T")\n', false)).toEqual([
			'root',
			['paragraph', [IMAGE, 'text:a']],
		]);
	});

	test('a tight list item holds no paragraph, so its image is a figure either way', () => {
		for (const unwrap of [true, false]) {
			expect(tree('- ![a](/a.png "T")\n', unwrap)).toEqual([
				'root',
				['list', ['list_item', [FIGURE, 'text:a']]],
			]);
		}
	});

	test('an image with no title has no caption, so it stays an image', () => {
		expect(tree('![a](/a.png)\n')).toEqual(['root', ['image', 'text:a']]);
		expect(tree('![a](/a.png "")\n')).toEqual([
			'root',
			['image title=""', 'text:a'],
		]);
	});
});

describe('compile', () => {
	test('imports the img component of the package', () => {
		expect(
			compile('![A chart](/c.png "Sales by month")\n', {
				plugins: [figures()],
				unwrap_images: true,
			}).code
		).toBe(
			[
				'<script>',
				"import { img as Img_MDSVEX_G } from '@mdsvex/plugin-kit/figures';",
				'</script><Img_MDSVEX_G src="/c.png" alt="A chart" title="Sales by month" figure="true" />',
			].join('\n')
		);
	});

	test('css false imports the component without the stylesheet', () => {
		expect(
			compile('![a](/a.png)\n', { plugins: [figures({ css: false })] }).code
		).toContain("from '@mdsvex/plugin-kit/figures/unstyled';");
	});

	test('an imported image is a figure too', () => {
		const { code } = compile('![a](./a.png "T")\n', {
			plugins: [figures()],
			unwrap_images: true,
			import_images: true,
		});
		expect(code).toMatch(
			/<Img_MDSVEX_G src=\{\w+\} alt="a" title="T" figure="true" \/>/
		);
	});

	test('an img of the site replaces the one of the plugin and still gets figure', () => {
		const { code } = compile('![a](/a.png "T")\n', {
			plugins: [figures()],
			unwrap_images: true,
			components: [{ specifier: '#lib/markdown.js', names: ['img'] }],
		});
		expect(code).toContain("from '#lib/markdown.js';");
		expect(code).not.toContain('plugin-kit');
		expect(code).toContain('figure="true"');
	});
});
