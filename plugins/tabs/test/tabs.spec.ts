import { steps } from '@mdsvex/plugin-steps';
import { tabs } from '@mdsvex/plugin-tabs';
import { compile } from 'mdsvex';
import { create_highlight } from 'mdsvex/highlight';
import { describe, expect, test } from 'vitest';

import {
	expect_parity,
	PATHS,
} from '../../../packages/parse/test/plugin_harness';

function setup() {
	return {
		directive_handlers: [{ name: 'tabs', directives: tabs().directives! }],
	};
}

/** the tree on both builders, whole and fed in chunks, directive names and args printed */
function tree(source: string): unknown {
	return expect_parity(source, setup, { attrs: ['name', 'args'] });
}

/** the tree the parser builds with no plugin */
function plain(source: string): unknown {
	return expect_parity(source, () => [], { attrs: ['name', 'args'] });
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

const TABS = 'directive_container name="tabs"';
const CODE_TABS = TABS + ' args={"code":"true"}';

function tab(index: number, label: unknown[], ...panel: unknown[]): unknown {
	return [
		`directive_container name="tab" args={"index":"${index}"}`,
		label.length === 0 ? 'directive_label' : ['directive_label', ...label],
		...panel,
	];
}

function code_tab(index: number, title: string, ...panel: unknown[]): unknown {
	return [
		`directive_container name="tab" args=${JSON.stringify({ index: String(index), title })}`,
		'code_fence',
		...panel,
	];
}

describe('headings', () => {
	test('each heading starts a tab, its text is the label', () => {
		expect(
			tree(
				[
					':::tabs',
					'',
					'## macOS *and* `Linux`',
					'',
					'Run the *installer*.',
					'',
					'```sh',
					'./install',
					'```',
					'',
					'## Windows',
					'',
					'- one',
					':::',
					'',
					'after',
					'',
				].join('\n')
			)
		).toEqual([
			'root',
			[
				TABS,
				tab(
					0,
					[
						'text:macOS ',
						['strong_emphasis', 'text:and'],
						'text: ',
						'code_span',
					],
					[
						'paragraph',
						'text:Run the ',
						['strong_emphasis', 'text:installer'],
						'text:.',
					],
					'code_fence'
				),
				tab(1, ['text:Windows'], ['list', ['list_item', 'text:one']]),
			],
			['paragraph', 'text:after'],
		]);
	});

	test('the first heading sets the depth, others are content of their tab', () => {
		expect(
			tree(
				[
					':::tabs',
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
				TABS,
				tab(
					0,
					['text:One'],
					['heading', 'text:Deeper'],
					['heading', 'text:Shallower']
				),
				tab(1, ['text:Two']),
			],
		]);
	});

	test('a heading in a block quote, a list or another directive starts no tab', () => {
		expect(
			tree(
				[
					'::::tabs',
					'## One',
					'',
					'> ## Quoted',
					'',
					'- ## Listed',
					'',
					':::note',
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
				TABS,
				tab(
					0,
					['text:One'],
					['block_quote', ['heading', 'text:Quoted']],
					['list', ['list_item', ['heading', 'text:Listed']]],
					['directive_container name="note"', ['heading', 'text:Noted']]
				),
				tab(1, ['text:Two']),
			],
		]);
	});

	test('the label of the container stays its label, the group arg stays an arg', () => {
		expect(tree(':::tabs[Pick *one*](group=os)\n## One\n:::\n')).toEqual([
			'root',
			[
				TABS + ' args={"group":"os"}',
				['directive_label', 'text:Pick ', ['strong_emphasis', 'text:one']],
				tab(0, ['text:One']),
			],
		]);
	});

	test('empty brackets are the same as none', () => {
		const bare = ':::tabs\n## One\n\nbody\n\n## Two\n:::\n';
		expect(tree(bare.replace(':::tabs', ':::tabs[]'))).toEqual(tree(bare));
	});

	test('tabs nest, each container counts and splits on its own', () => {
		expect(
			tree(
				[
					'::::tabs',
					'## Outer one',
					'',
					':::tabs',
					'#### Inner one',
					'',
					'#### Inner two',
					':::',
					'',
					':::tabs',
					'```js',
					'x',
					'```',
					':::',
					'',
					'## Outer two',
					'::::',
					'',
				].join('\n')
			)
		).toEqual([
			'root',
			[
				TABS,
				tab(
					0,
					['text:Outer one'],
					[TABS, tab(0, ['text:Inner one']), tab(1, ['text:Inner two'])],
					[CODE_TABS, code_tab(0, 'js')]
				),
				tab(1, ['text:Outer two']),
			],
		]);
	});

	test('a heading outside the container is left alone', () => {
		const source = '## Out\n\n:::other\n## In\n:::\n';
		expect(tree(source)).toEqual(plain(source));
	});
});

describe('code groups', () => {
	test('each fence is a tab, labelled by its name, its title or its language', () => {
		expect(
			tree(
				[
					':::tabs',
					'```sh [npm]',
					'npm i',
					'```',
					'',
					'```sh {1} title="pnpm add" [second]',
					'pnpm i',
					'```',
					'',
					"```sh title='yarn' /add/",
					'yarn add',
					'```',
					'',
					'```js',
					'x',
					'```',
					':::',
					'',
				].join('\n')
			)
		).toEqual([
			'root',
			[
				CODE_TABS,
				code_tab(0, 'npm'),
				code_tab(1, 'pnpm add'),
				code_tab(2, 'yarn'),
				code_tab(3, 'js'),
			],
		]);
	});

	test('a part that is no title is not read as one', () => {
		for (const [info, title] of [
			['ts title=bare', 'ts'],
			['ts []', 'ts'],
			['ts title=""', 'ts'],
			['ts [a b] title="later"', 'a b'],
			['ts caption="[not this]" [this]', 'this'],
			['ts {1,3} :line-numbers', 'ts'],
		]) {
			expect(tree(':::tabs\n```' + info + '\nx\n```\n:::\n')).toEqual([
				'root',
				[CODE_TABS, code_tab(0, title)],
			]);
		}
	});

	test('what follows a fence is in its panel, a heading too', () => {
		expect(
			tree(
				[
					':::tabs',
					'```sh [npm]',
					'npm i',
					'```',
					'',
					'A note.',
					'',
					'## Not a tab',
					'',
					'```sh [pnpm]',
					'pnpm i',
					'```',
					':::',
					'',
				].join('\n')
			)
		).toEqual([
			'root',
			[
				CODE_TABS,
				code_tab(
					0,
					'npm',
					['paragraph', 'text:A note.'],
					['heading', 'text:Not a tab']
				),
				code_tab(1, 'pnpm'),
			],
		]);
	});

	test('a fence after the first heading is content of its tab', () => {
		expect(tree(':::tabs\n## npm\n\n```sh [named]\nnpm i\n```\n:::\n')).toEqual(
			['root', [TABS, tab(0, ['text:npm'], 'code_fence')]]
		);
	});

	test('a fence in a list or a block quote is no tab', () => {
		const source = ':::tabs\n- ```js\n  x\n  ```\n\n> ```js\n> y\n> ```\n:::\n';
		expect(tree(source)).toEqual(plain(source));
	});
});

describe('warnings', () => {
	test('a container with no tabs', () => {
		for (const source of [':::tabs\n:::\n', ':::tabs\nJust text.\n:::\n']) {
			expect(warnings(source)).toEqual(['no_tabs']);
			expect(tree(source)).toEqual(plain(source));
		}
	});

	test('content before the first tab stays where it was written', () => {
		const source = ':::tabs\nBefore.\n\n> quote\n\n## One\n\nbody\n:::\n';
		expect(warnings(source)).toEqual(['content_before_first_tab']);
		expect(tree(source)).toEqual([
			'root',
			[
				TABS,
				['paragraph', 'text:Before.'],
				['block_quote', ['paragraph', 'text:quote']],
				tab(0, ['text:One'], ['paragraph', 'text:body']),
			],
		]);
		expect(warnings(':::tabs\nBefore.\n\n```js\nx\n```\n:::\n')).toEqual([
			'content_before_first_tab',
		]);
	});

	test('the label of the container is not content before the first tab', () => {
		expect(warnings(':::tabs[Pick one]\n## One\n:::\n')).toEqual([]);
	});

	test('a heading with no text is labelled by its place', () => {
		const source = ':::tabs\n##\n\nbody\n\n## Two\n:::\n';
		expect(warnings(source)).toEqual(['tab_without_label']);
		expect(tree(source)).toEqual([
			'root',
			[
				TABS,
				[
					'directive_container name="tab" args={"index":"0","title":"1"}',
					'directive_label',
					['paragraph', 'text:body'],
				],
				tab(1, ['text:Two']),
			],
		]);
	});

	test('a fence with no title and no language is labelled by its place', () => {
		const source = ':::tabs\n```js\nx\n```\n\n```\ny\n```\n:::\n';
		expect(warnings(source)).toEqual(['tab_without_label']);
		expect(tree(source)).toEqual([
			'root',
			[CODE_TABS, code_tab(0, 'js'), code_tab(1, '2')],
		]);
	});

	test('a document with nothing wrong has none', () => {
		expect(warnings(':::tabs\n## One\n\n## Two\n:::\n')).toEqual([]);
		expect(warnings('## Out\n\ntext\n')).toEqual([]);
	});
});

describe('revokes', () => {
	test('a label with a delimiter that never closes keeps it as text', () => {
		const source =
			':::tabs\n## One *open\n\nbody _open\n\n## Two `code\n\n## [Three](\n:::\n';
		expect(warnings(source)).toEqual([]);
		expect(tree(source)).toEqual([
			'root',
			[
				TABS,
				tab(0, ['text:One *open'], ['paragraph', 'text:body _open']),
				tab(1, ['text:Two `code']),
				tab(2, ['text:[Three](']),
			],
		]);
	});

	test('a label that is only a revoked delimiter is not empty', () => {
		const source = ':::tabs\n## *\n:::\n';
		expect(warnings(source)).toEqual([]);
		expect(tree(source)).toEqual(['root', [TABS, tab(0, ['text:*'])]]);
	});

	test('an unclosed container closes its last tab at the end of input', () => {
		expect(tree(':::tabs\n## One\n\nbody\n\n## Two\n\nmore')).toEqual([
			'root',
			[
				TABS,
				tab(0, ['text:One'], ['paragraph', 'text:body']),
				tab(1, ['text:Two'], ['paragraph', 'text:more']),
			],
		]);
		expect(warnings(':::tabs\n## One\n\nbody')).toEqual([]);
	});

	test('an unclosed code group labels a fence that never closes', () => {
		const source = ':::tabs\n```sh [npm]\nnpm i\n```\n\n```sh [pnpm]\npnpm i';
		expect(warnings(source)).toEqual([]);
		expect(tree(source)).toEqual([
			'root',
			[CODE_TABS, code_tab(0, 'npm'), code_tab(1, 'pnpm')],
		]);
	});

	test('an unclosed container with no tabs still warns', () => {
		expect(warnings(':::tabs\ntext')).toEqual(['no_tabs']);
	});

	test('an element that never closes inside a tab is text in its panel', () => {
		expect(tree(':::tabs\n## One\n\n<div>\n\ninside\n\n## Two\n:::\n')).toEqual(
			[
				'root',
				[
					TABS,
					tab(
						0,
						['text:One'],
						['paragraph', 'text:<div>'],
						['paragraph', 'text:inside']
					),
					tab(1, ['text:Two']),
				],
			]
		);
	});
});

describe('with steps', () => {
	const STEP = 'directive_container name="step"';

	test('steps in a tab and tabs in a step keep to their own container', () => {
		const source = [
			'::::tabs',
			'## Tab',
			'',
			':::steps',
			'### Step',
			'',
			'in the step',
			':::',
			'',
			'## Other',
			'::::',
			'',
			'::::steps',
			'## Step',
			'',
			':::tabs',
			'```sh [npm]',
			'npm i',
			'```',
			':::',
			'',
			'## Next',
			'::::',
			'',
		].join('\n');
		for (const order of [
			[tabs(), steps()],
			[steps(), tabs()],
		]) {
			const made = () => ({
				directive_handlers: order.map((bundle) => ({
					name: bundle.name,
					directives: bundle.directives!,
				})),
			});
			expect(expect_parity(source, made, { attrs: ['name', 'args'] })).toEqual([
				'root',
				[
					TABS,
					tab(
						0,
						['text:Tab'],
						[
							'directive_container name="steps"',
							[
								STEP,
								['directive_label', ['heading', 'text:Step']],
								['paragraph', 'text:in the step'],
							],
						]
					),
					tab(1, ['text:Other']),
				],
				[
					'directive_container name="steps"',
					[
						STEP,
						['directive_label', ['heading', 'text:Step']],
						[CODE_TABS, code_tab(0, 'npm')],
					],
					[STEP, ['directive_label', ['heading', 'text:Next']]],
				],
			]);
		}
	});
});

describe('compile', () => {
	const SOURCE = [
		':::tabs(group=os)',
		'## macOS',
		'',
		'Run `brew`.',
		'',
		'## Windows',
		':::',
		'',
	].join('\n');

	const IMPORT =
		"import { tabs as Tabs_MDSVEX_D_G, tab as Tab_MDSVEX_D_G } from '@mdsvex/plugin-tabs/directives';";

	test('imports the components of the package and passes each heading as a label', () => {
		expect(compile(SOURCE, { plugins: [tabs()] }).code).toBe(
			[
				'<script>',
				IMPORT,
				'</script><Tabs_MDSVEX_D_G group="os">',
				'<Tab_MDSVEX_D_G index="0">{#snippet label()}macOS{/snippet}',
				'<p>Run <code>brew</code>.</p>',
				'</Tab_MDSVEX_D_G><Tab_MDSVEX_D_G index="1">{#snippet label()}Windows{/snippet}</Tab_MDSVEX_D_G>',
				'</Tabs_MDSVEX_D_G>',
			].join('\n')
		);
	});

	test('css false imports the components without the stylesheet', () => {
		expect(compile(SOURCE, { plugins: [tabs({ css: false })] }).code).toContain(
			"from '@mdsvex/plugin-tabs/directives/unstyled';"
		);
	});

	test('a label is no heading, so it gets no id', () => {
		const code = compile('## Before\n\n' + SOURCE + '\n## After\n', {
			plugins: [tabs()],
			heading_ids: true,
		}).code;
		expect(code).toContain('<h2 id="before">Before</h2>');
		expect(code).toContain('{#snippet label()}macOS{/snippet}');
		expect(code).toContain('<h2 id="after">After</h2>');
		expect(code.match(/ id=/g)).toHaveLength(2);
	});

	test('a label keeps its expressions and inline markup', () => {
		expect(
			compile(':::tabs\n## {name} *v2* `x`\n:::\n', { plugins: [tabs()] }).code
		).toContain(
			'{#snippet label()}{name} <strong>v2</strong> <code>x</code>{/snippet}'
		);
	});

	const GROUP = [
		':::tabs',
		'```sh [npm]',
		'npm i',
		'```',
		'',
		'```sh title="pnpm"',
		'pnpm i',
		'```',
		':::',
		'',
	].join('\n');

	test('a code group passes each title as a prop, without a highlighter', () => {
		expect(compile(GROUP, { plugins: [tabs()], highlight: false }).code).toBe(
			[
				'<script>',
				IMPORT,
				'</script><Tabs_MDSVEX_D_G code="true">',
				'<Tab_MDSVEX_D_G index="0" title="npm">',
				'<pre><code class="language-sh">npm i</code></pre>',
				'</Tab_MDSVEX_D_G><Tab_MDSVEX_D_G index="1" title="pnpm">',
				'<pre><code class="language-sh">pnpm i</code></pre>',
				'</Tab_MDSVEX_D_G>',
				'</Tabs_MDSVEX_D_G>',
			].join('\n')
		);
	});

	test('a code group keeps the figure the highlighter makes for a title', async () => {
		const code = compile(GROUP, {
			plugins: [tabs()],
			highlight: await create_highlight(),
		}).code;
		expect(code).toContain(
			[
				'<Tab_MDSVEX_D_G index="0" title="npm">',
				'<figure class="twinkleplop-block" data-language="sh">',
				'<figcaption class="twinkleplop-title">npm</figcaption>',
				'<pre class="twinkleplop language-sh" data-language="sh">',
			].join('\n')
		);
	});

	test('a code group around a replaced pre gives it the title too', async () => {
		const code = compile(GROUP, {
			plugins: [tabs()],
			highlight: await create_highlight(),
			components: [{ specifier: '#lib/markdown.js', names: ['pre'] }],
		}).code;
		expect(code).toContain(
			'<Tab_MDSVEX_D_G index="1" title="pnpm">\n' +
				'<Pre_MDSVEX_G lang={"sh"} meta={"title=\\"pnpm\\""} title={"pnpm"} code={"pnpm i"}>'
		);
	});

	test('warnings come back with the line they are about', () => {
		const { warnings: found } = compile(
			':::tabs\nBefore.\n\n##\n\n## Two\n:::\n\n:::tabs\n:::\n',
			{ plugins: [tabs()] }
		);
		expect(
			found?.map((warning) => [
				warning.code,
				(warning as { plugin?: string }).plugin,
				warning.start?.line,
			])
		).toEqual([
			['tab_without_label', 'tabs', 4],
			['content_before_first_tab', 'tabs', 2],
			['no_tabs', 'tabs', 9],
		]);
	});

	test('a document without the directive imports nothing', () => {
		expect(compile('## Plain\n', { plugins: [tabs()] }).code).toBe(
			'<h2>Plain</h2>'
		);
	});

	test('one plugin serves many documents', () => {
		const plugins = [tabs()];
		const first = compile(SOURCE, { plugins }).code;
		expect(compile(GROUP, { plugins, highlight: false }).code).toContain(
			'title="npm"'
		);
		expect(compile(SOURCE, { plugins }).code).toBe(first);
	});
});
