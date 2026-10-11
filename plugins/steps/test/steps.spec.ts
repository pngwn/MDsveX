import { steps } from '@mdsvex/plugin-steps';
import { compile } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import { expect_parity } from '../../../packages/parse/test/plugin_harness';

/** the tree on both builders, whole and fed in chunks, directive names and args printed */
function tree(source: string): unknown {
	return expect_parity(
		source,
		() => ({ directive_handlers: [steps().directives!] }),
		{ attrs: ['name', 'args'] }
	);
}

/** the tree the parser builds with no plugin */
function plain(source: string): unknown {
	return expect_parity(source, () => [], { attrs: ['name', 'args'] });
}

const STEPS = 'directive_container name="steps"';
const STEP = 'directive_container name="step"';

function step(title: unknown[], ...body: unknown[]): unknown {
	return [STEP, ['directive_label', title], ...body];
}

describe('tree', () => {
	test('each heading starts a step, the heading is its label', () => {
		expect(
			tree(
				[
					':::steps[]',
					'',
					'## Install',
					'',
					'Run the *installer*.',
					'',
					'- one',
					'- two',
					'',
					'## Configure',
					'',
					'Set it up.',
					':::',
					'',
					'after',
					'',
				].join('\n')
			)
		).toEqual([
			'root',
			[
				STEPS,
				step(
					['heading', 'text:Install'],
					[
						'paragraph',
						'text:Run the ',
						['strong_emphasis', 'text:installer'],
						'text:.',
					],
					['list', ['list_item', 'text:one'], ['list_item', 'text:two']]
				),
				step(['heading', 'text:Configure'], ['paragraph', 'text:Set it up.']),
			],
			['paragraph', 'text:after'],
		]);
	});

	test('the first heading sets the depth, others are content of their step', () => {
		expect(
			tree(
				[
					':::steps[]',
					'### One',
					'',
					'#### Deeper',
					'',
					'## Shallower',
					'',
					'### Two',
					':::',
					'',
				].join('\n')
			)
		).toEqual([
			'root',
			[
				STEPS,
				step(
					['heading', 'text:One'],
					['heading', 'text:Deeper'],
					['heading', 'text:Shallower']
				),
				step(['heading', 'text:Two']),
			],
		]);
	});

	test('a level arg names the depth, whatever the first heading is', () => {
		expect(
			tree(
				[
					':::steps[](level=3)',
					'## Before',
					'',
					'### One',
					'',
					'## Inside',
					'',
					'### Two',
					':::',
					'',
				].join('\n')
			)
		).toEqual([
			'root',
			[
				STEPS + ' args={"level":"3"}',
				['heading', 'text:Before'],
				step(['heading', 'text:One'], ['heading', 'text:Inside']),
				step(['heading', 'text:Two']),
			],
		]);
	});

	test('a level that is no heading depth is ignored', () => {
		for (const level of ['0', '7', 'two', '']) {
			expect(
				tree(`:::steps[](level="${level}")\n## One\n\n### Sub\n\n## Two\n:::\n`)
			).toEqual([
				'root',
				[
					STEPS + ` args={"level":${JSON.stringify(level)}}`,
					step(['heading', 'text:One'], ['heading', 'text:Sub']),
					step(['heading', 'text:Two']),
				],
			]);
		}
	});

	test('content before the first heading stays outside any step', () => {
		expect(
			tree(
				':::steps[]\nBefore you start.\n\n> a quote\n\n## One\n\nbody\n:::\n'
			)
		).toEqual([
			'root',
			[
				STEPS,
				['paragraph', 'text:Before you start.'],
				['block_quote', ['paragraph', 'text:a quote']],
				step(['heading', 'text:One'], ['paragraph', 'text:body']),
			],
		]);
	});

	test('a container with no headings is left as the parser built it', () => {
		const source = ':::steps[]\nJust text.\n\n- a\n- b\n:::\n';
		expect(tree(source)).toEqual(plain(source));
		expect(tree(':::steps[]\n:::\n')).toEqual(plain(':::steps[]\n:::\n'));
	});

	test('the label of the container stays its label', () => {
		expect(tree(':::steps[Set *up*]\n## One\n:::\n')).toEqual([
			'root',
			[
				STEPS,
				['directive_label', 'text:Set ', ['strong_emphasis', 'text:up']],
				step(['heading', 'text:One']),
			],
		]);
	});

	test('steps nest, each container splits on its own depth', () => {
		expect(
			tree(
				[
					'::::steps[]',
					'## Outer one',
					'',
					':::steps[]',
					'#### Inner one',
					'',
					'inner body',
					'',
					'#### Inner two',
					':::',
					'',
					'## Outer two',
					'',
					'outer body',
					'::::',
					'',
				].join('\n')
			)
		).toEqual([
			'root',
			[
				STEPS,
				step(
					['heading', 'text:Outer one'],
					[
						STEPS,
						step(
							['heading', 'text:Inner one'],
							['paragraph', 'text:inner body']
						),
						step(['heading', 'text:Inner two']),
					]
				),
				step(['heading', 'text:Outer two'], ['paragraph', 'text:outer body']),
			],
		]);
	});

	test('a heading in a block quote, a list or another directive starts no step', () => {
		expect(
			tree(
				[
					'::::steps[]',
					'## One',
					'',
					'> ## Quoted',
					'',
					'- ## Listed',
					'',
					':::note[]',
					'## Noted',
					':::',
					'',
					'## Two',
					'::::',
					'',
				].join('\n')
			)
		).toEqual([
			'root',
			[
				STEPS,
				step(
					['heading', 'text:One'],
					['block_quote', ['heading', 'text:Quoted']],
					['list', ['list_item', ['heading', 'text:Listed']]],
					['directive_container name="note"', ['heading', 'text:Noted']]
				),
				step(['heading', 'text:Two']),
			],
		]);
	});

	test('a step written out sits beside the ones headings make', () => {
		expect(
			tree(
				[
					'::::steps[]',
					':::step[By *hand*]',
					'first',
					':::',
					'',
					'## By heading',
					'',
					'second',
					'::::',
					'',
				].join('\n')
			)
		).toEqual([
			'root',
			[
				STEPS,
				[
					STEP,
					['directive_label', 'text:By ', ['strong_emphasis', 'text:hand']],
					['paragraph', 'text:first'],
				],
				step(['heading', 'text:By heading'], ['paragraph', 'text:second']),
			],
		]);
	});

	test('a heading outside the container is left alone', () => {
		const source = '## Out\n\n:::other[]\n## In\n:::\n';
		expect(tree(source)).toEqual(plain(source));
	});

	test('an unclosed container closes its last step at the end of input', () => {
		expect(tree(':::steps[]\n## One\n\nbody')).toEqual([
			'root',
			[STEPS, step(['heading', 'text:One'], ['paragraph', 'text:body'])],
		]);
	});
});

describe('compile', () => {
	const SOURCE = [
		':::steps[]',
		'## Install',
		'',
		'Run `pnpm i`.',
		'',
		'## Configure',
		':::',
		'',
	].join('\n');

	test('imports the components of the package and passes each heading as a label', () => {
		expect(compile(SOURCE, { plugins: [steps()] }).code).toBe(
			[
				'<script>',
				"import { steps as Steps_MDSVEX_D_G, step as Step_MDSVEX_D_G } from '@mdsvex/plugin-steps/directives';",
				'</script><Steps_MDSVEX_D_G>',
				'<Step_MDSVEX_D_G>{#snippet label()}<h2>Install</h2>{/snippet}',
				'<p>Run <code>pnpm i</code>.</p>',
				'</Step_MDSVEX_D_G><Step_MDSVEX_D_G>{#snippet label()}<h2>Configure</h2>{/snippet}</Step_MDSVEX_D_G>',
				'</Steps_MDSVEX_D_G>',
			].join('\n')
		);
	});

	test('css false imports the components without the stylesheet', () => {
		expect(
			compile(SOURCE, { plugins: [steps({ css: false })] }).code
		).toContain("from '@mdsvex/plugin-steps/directives/unstyled';");
	});

	test('heading ids reach the headings inside the labels', () => {
		expect(
			compile(SOURCE, { plugins: [steps()], heading_ids: true }).code
		).toContain('{#snippet label()}<h2 id="install">Install</h2>{/snippet}');
	});

	test('a document without the directive imports nothing', () => {
		expect(compile('## Plain\n', { plugins: [steps()] }).code).toBe(
			'<h2>Plain</h2>'
		);
	});
});
