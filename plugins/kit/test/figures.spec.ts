import { figures } from '@mdsvex/plugin-kit';
import { compile } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import {
	expect_parity,
	PATHS,
} from '../../../packages/parse/test/plugin_harness';

function setup(unwrap_images = true) {
	return {
		directive_handlers: [
			{ name: 'figures', directives: figures().directives! },
		],
		syntax: { unwrap_images },
	};
}

/** the tree on both builders, whole and fed in chunks */
function tree(source: string, unwrap_images = true): unknown {
	return expect_parity(source, () => setup(unwrap_images), {
		attrs: ['name', 'args'],
	});
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

describe('the figure directive', () => {
	test('holds what is written inside it, the label is the caption', () => {
		const source =
			':::figure[Sales by *month*](id=fig:sales)\n![A chart](/c.png)\n:::\n';
		expect(warnings(source)).toEqual([]);
		expect(tree(source)).toEqual([
			'root',
			[
				'directive_container name="figure" args={"id":"fig:sales"}',
				[
					'directive_label',
					'text:Sales by ',
					['strong_emphasis', 'text:month'],
				],
				['image', 'text:A chart'],
			],
		]);
	});

	test('without unwrap_images the image keeps its paragraph', () => {
		expect(tree(':::figure[Chart]\n![A chart](/c.png)\n:::\n', false)).toEqual([
			'root',
			[
				'directive_container name="figure"',
				['directive_label', 'text:Chart'],
				['paragraph', ['image', 'text:A chart']],
			],
		]);
	});

	test('a lone image with a title stays an image', () => {
		expect(tree('![A chart](/c.png "Sales")\n')).toEqual([
			'root',
			['image', 'text:A chart'],
		]);
	});

	test('a figure with nothing in it warns', () => {
		expect(warnings(':::figure[Empty]\n:::\n')).toEqual(['empty_figure']);
		expect(warnings(':::figure(id=fig:x)\n:::\n')).toEqual(['empty_figure']);
		expect(warnings(':::figure\n```js\nx\n```\n:::\n')).toEqual([]);
	});
});

describe('compile', () => {
	test('imports the figure component of the package', () => {
		expect(
			compile(':::figure[Sales](id=fig:sales)\n![A chart](/c.png)\n:::\n', {
				plugins: [figures()],
				unwrap_images: true,
			}).code
		).toBe(
			[
				'<script>',
				"import { figure as Figure_MDSVEX_D_G } from '@mdsvex/plugin-kit/figures';",
				'</script><Figure_MDSVEX_D_G id="fig:sales">{#snippet label()}Sales{/snippet}',
				'<img src="/c.png" alt="A chart" />',
				'</Figure_MDSVEX_D_G>',
			].join('\n')
		);
	});

	test('css false imports the component without the stylesheet', () => {
		expect(
			compile(':::figure\n![a](/a.png)\n:::\n', {
				plugins: [figures({ css: false })],
			}).code
		).toContain("from '@mdsvex/plugin-kit/figures/unstyled';");
	});

	test('a code block or a table can be a figure', () => {
		const { code } = compile(
			':::figure[Plans]\n| plan | price |\n| - | - |\n| free | 0 |\n:::\n',
			{ plugins: [figures()] }
		);
		expect(code).toContain(
			'<Figure_MDSVEX_D_G>{#snippet label()}Plans{/snippet}\n<table>'
		);
	});

	test('the id of a figure is the author id, one a heading took fails the build', () => {
		expect(() =>
			compile('## Results\n\n:::figure[x](id=results)\n![a](/a.png)\n:::\n', {
				plugins: [figures()],
				heading_ids: true,
			})
		).toThrow(/the id "results" of the directive container/);
		expect(
			compile(':::figure[x](id=results)\n![a](/a.png)\n:::\n\n## Results\n', {
				plugins: [figures()],
				heading_ids: true,
			}).code
		).toContain('<h2 id="results-1">Results</h2>');
	});

	test('a lone image with a title is not a figure', () => {
		const { code } = compile('![A chart](/c.png "Sales")\n', {
			plugins: [figures()],
			unwrap_images: true,
		});
		expect(code).toBe('<img src="/c.png" alt="A chart" title="Sales" />');
	});
});
