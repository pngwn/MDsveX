import { code_blocks, mermaid } from '@mdsvex/plugin-kit';
import { tabs } from '@mdsvex/plugin-tabs';
import { compile } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import { expect_parity } from '../../../packages/parse/test/plugin_harness';

/** the tree on both builders, whole and fed in chunks, with tabs when asked */
function tree(source: string, with_tabs = false): unknown {
	const bundle = mermaid();
	return expect_parity(
		source,
		() => ({
			plugins: [{ name: bundle.name, ...bundle.parse! }],
			directive_handlers: with_tabs
				? [{ name: 'tabs', directives: tabs().directives! }]
				: [],
		}),
		{ attrs: ['name', 'args'] }
	);
}

function diagram(args: Record<string, string>): string {
	return 'directive_container name="mermaid" args=' + JSON.stringify(args);
}

describe('which fences are diagrams', () => {
	test('a mermaid fence is wrapped, its code is an arg', () => {
		expect(
			tree(
				'Before\n\n```mermaid\ngraph TD\n  A{Start} --> B["End"]\n```\n\nAfter\n'
			)
		).toEqual([
			'root',
			['paragraph', 'text:Before'],
			[diagram({ code: 'graph TD\n  A{Start} --> B["End"]' }), 'code_fence'],
			['paragraph', 'text:After'],
		]);
	});

	test('the title and caption of the fence go with it', () => {
		expect(
			tree('```mermaid title="Flow" caption="How it goes"\ngraph TD\n```\n')
		).toEqual([
			'root',
			[
				diagram({ title: 'Flow', caption: 'How it goes', code: 'graph TD' }),
				'code_fence',
			],
		]);
	});

	test('a fence in another language is left alone', () => {
		expect(tree('```js\nx\n```\n\n```\ngraph TD\n```\n')).toEqual([
			'root',
			'code_fence',
			'code_fence',
		]);
	});

	test('a fence in a list, a block quote or a directive', () => {
		expect(tree('> ```mermaid\n> graph TD\n> ```\n')).toEqual([
			'root',
			['block_quote', [diagram({ code: 'graph TD' }), 'code_fence']],
		]);
		expect(tree('- ```mermaid\n  graph TD\n  ```\n')).toEqual([
			'root',
			['list', ['list_item', [diagram({ code: 'graph TD' }), 'code_fence']]],
		]);
	});

	test('a fence the input ends inside still has its code', () => {
		expect(tree('```mermaid\ngraph TD\n  A --> B')).toEqual([
			'root',
			[diagram({ code: 'graph TD\n  A --> B' }), 'code_fence'],
		]);
	});

	test('in a code group the diagram is in its tab', () => {
		expect(
			tree(
				':::tabs\n```mermaid [Chart]\ngraph TD\n```\n\n```js [JS]\nx\n```\n:::\n',
				true
			)
		).toEqual([
			'root',
			[
				'directive_container name="tabs" args={"code":"true"}',
				[
					'directive_container name="tab" args={"index":"0"}',
					['directive_label', 'text:Chart'],
					[diagram({ title: 'Chart', code: 'graph TD' }), 'code_fence'],
				],
				[
					'directive_container name="tab" args={"index":"1"}',
					['directive_label', 'text:JS'],
					'code_fence',
				],
			],
		]);
	});
});

describe('compile', () => {
	const SOURCE = '```mermaid title="Flow"\ngraph TD\n  A{Start} --> B\n```\n';

	test('imports the component of the package and keeps the fence inside it', () => {
		expect(
			compile(SOURCE, { plugins: [mermaid()], highlight: false }).code
		).toBe(
			[
				'<script>',
				"import { mermaid as Mermaid_MDSVEX_D_G } from '@mdsvex/plugin-kit/mermaid';",
				'</script><Mermaid_MDSVEX_D_G title="Flow" code={"graph TD\\n  A{Start} --> B"}>',
				'<pre><code class="language-mermaid">graph TD',
				'  A&#123;Start&#125; --&gt; B</code></pre>',
				'</Mermaid_MDSVEX_D_G>',
			].join('\n')
		);
	});

	test('css false imports the component without the stylesheet', () => {
		expect(
			compile(SOURCE, { plugins: [mermaid({ css: false })] }).code
		).toContain("from '@mdsvex/plugin-kit/mermaid/unstyled';");
	});

	test('a theme is passed to every diagram', () => {
		expect(
			compile(SOURCE, { plugins: [mermaid({ theme: 'neutral' })] }).code
		).toContain('<Mermaid_MDSVEX_D_G title="Flow" theme="neutral" code=');
	});

	test('the fence inside renders through the pre of the site or of the kit', () => {
		const { code } = compile(SOURCE, {
			plugins: [mermaid(), code_blocks()],
			highlight: false,
		});
		expect(code).toContain(
			'<Mermaid_MDSVEX_D_G title="Flow" code={"graph TD\\n  A{Start} --> B"}>\n<Pre_MDSVEX_G lang={"mermaid"}'
		);
	});

	test('a document without a mermaid fence imports nothing', () => {
		expect(
			compile('```js\nx\n```\n', { plugins: [mermaid()], highlight: false })
				.code
		).toBe('<pre><code class="language-js">x</code></pre>');
	});
});
