import { diagram, DiagramError } from '@mdsvex/plugin-diagram';
import { tabs } from '@mdsvex/plugin-tabs';
import { compile } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import {
	expect_parity,
	PATHS,
} from '../../../packages/parse/test/plugin_harness';

type Engine = 'pele' | 'mermaid';

function setup(engine: Engine, with_tabs = false) {
	const bundle = diagram({ engine });
	return {
		plugins: [{ name: bundle.name, ...bundle.parse! }],
		directive_handlers: with_tabs
			? [{ name: 'tabs', directives: tabs().directives! }]
			: [],
	};
}

/** the tree on both builders, whole and fed in chunks */
function tree(source: string, engine: Engine, with_tabs = false): unknown {
	return expect_parity(source, () => setup(engine, with_tabs), {
		attrs: ['name', 'args'],
	});
}

/** the warning codes of a document, the same on every path */
function warnings(source: string): string[] {
	let first: string[] | undefined;
	for (const [name, run] of PATHS) {
		const found = run(source, setup('pele')).dispatcher!.warnings ?? [];
		const codes = found.map((warning) => warning.code);
		if (first === undefined) first = codes;
		else expect(codes, name).toEqual(first);
	}
	return first!;
}

function diagram_node(args: Record<string, string>): string {
	return 'directive_container name="diagram" args=' + JSON.stringify(args);
}

/** the args of the first diagram of a tree */
function args_of(found: unknown): Record<string, string> {
	const text = JSON.stringify(found);
	const match =
		/directive_container name=\\"diagram\\" args=(\{.*?\})\\?",/.exec(text);
	return JSON.parse(JSON.parse('"' + match![1] + '"'));
}

const FLOW =
	'```mermaid title="Flow"\ngraph LR\n  A{Start} --> B["End"]\n```\n';

describe('with mermaid', () => {
	test('a mermaid fence is wrapped, its code is an arg', () => {
		expect(tree('Before\n\n' + FLOW + '\nAfter\n', 'mermaid')).toEqual([
			'root',
			['paragraph', 'text:Before'],
			[
				diagram_node({
					title: 'Flow',
					code: 'graph LR\n  A{Start} --> B["End"]',
				}),
				'code_fence',
			],
			['paragraph', 'text:After'],
		]);
	});

	test('a fence the input ends inside still has its code', () => {
		expect(tree('```mermaid\ngraph TD\n  A --> B', 'mermaid')).toEqual([
			'root',
			[diagram_node({ code: 'graph TD\n  A --> B' }), 'code_fence'],
		]);
	});

	test('the theme option reaches every diagram', () => {
		const { code } = compile(FLOW, {
			plugins: [diagram({ engine: 'mermaid', theme: 'neutral' })],
			highlight: false,
		});
		expect(code).toContain(
			"import { diagram as Diagram_MDSVEX_D_G } from '@mdsvex/plugin-diagram/mermaid';"
		);
		expect(code).toContain(
			'<Diagram_MDSVEX_D_G title="Flow" theme="neutral" code='
		);
	});
});

describe('with pele', () => {
	test('the diagram is drawn when its fence closes, on every path', () => {
		const found = tree('Before\n\n' + FLOW + '\nAfter\n', 'pele');
		const args = args_of(found);
		expect(args.title).toBe('Flow');
		expect(args.code).toBeUndefined();
		expect(args.svg).toMatch(/^<svg[^>]*class="pele/);
		expect(args.svg).toContain('role="graphics-document document"');
		expect(args.svg).toContain('Start');
	});

	test('each diagram gets ids of its own', () => {
		const titled = '```mermaid\ngraph LR\n  accTitle: Build\n  A --> B\n```\n';
		const found = JSON.stringify(tree(titled + '\n' + titled, 'pele'));
		expect(found).toMatch(/diagram-[a-z]/);
		expect(found).toMatch(/diagram-1-[a-z]/);
	});

	test('in a code group the diagram is in its tab', () => {
		const found = tree(
			':::tabs\n```mermaid [Chart]\ngraph TD\n  A --> B\n```\n\n```js [JS]\nx\n```\n:::\n',
			'pele',
			true
		) as unknown[];
		const group = found[1] as unknown[];
		expect(group[0]).toBe(
			'directive_container name="tabs" args={"code":"true"}'
		);
		const first = group[1] as unknown[];
		expect(first[0]).toBe('directive_container name="tab" args={"index":"0"}');
		expect(String((first[2] as unknown[])[0])).toMatch(
			/^directive_container name="diagram" args=\{"title":"Chart","svg":"<svg/
		);
	});

	test('a diagram pele can not draw warns and keeps its source', () => {
		const source = '```mermaid\ngraph TD\n  A --> B -->\n```\n';
		expect(warnings(source)).toEqual(['diagram_error']);
		const args = args_of(tree(source, 'pele'));
		expect(args.svg).toBeUndefined();
		expect(args.error).toBeTruthy();
		expect(warnings('```mermaid\nnot a diagram\n```\n')).toEqual([
			'diagram_error',
		]);
	});

	test('a fence in another language is left alone', () => {
		expect(tree('```js\nx\n```\n', 'pele')).toEqual(['root', 'code_fence']);
		expect(warnings('```js\nx\n```\n')).toEqual([]);
	});
});

describe('compile', () => {
	test('auto draws with pele when it is installed, and imports its component', () => {
		const { code, warnings: found } = compile(FLOW, {
			plugins: [diagram()],
			highlight: false,
		});
		expect(code).toContain(
			"import { diagram as Diagram_MDSVEX_D_G } from '@mdsvex/plugin-diagram/pele';"
		);
		expect(code).toContain('<Diagram_MDSVEX_D_G title="Flow" svg="&lt;svg ');
		expect(code).toContain('<pre><code class="language-mermaid">');
		expect(found).toBeUndefined();
	});

	test('css false imports the component without the stylesheet', () => {
		for (const engine of ['pele', 'mermaid'] as const) {
			expect(
				compile(FLOW, { plugins: [diagram({ engine, css: false })] }).code
			).toContain(`from '@mdsvex/plugin-diagram/${engine}/unstyled';`);
		}
	});

	test('pele options reach every render', () => {
		const { code } = compile(FLOW, {
			plugins: [diagram({ pele: { fontSize: 20 } })],
			highlight: false,
		});
		expect(code).toContain('font:20px sans-serif');
	});

	test('a warning names the line of the fence', () => {
		const { warnings: found } = compile(
			'Text.\n\n```mermaid\ngraph TD\n  A --> B -->\n```\n',
			{ plugins: [diagram()], highlight: false }
		);
		expect(found?.map((w) => [w.code, w.plugin, w.start.line])).toEqual([
			['diagram_error', 'diagram', 3],
		]);
	});

	test('strict fails the build at a diagram pele can not draw', () => {
		expect(() =>
			compile('Text.\n\n```mermaid\ngraph TD\n  A --> B -->\n```\n', {
				plugins: [diagram({ strict: true })],
				highlight: false,
			})
		).toThrow(/the diagram at line 3 could not be drawn/);
		try {
			compile('```mermaid\nnot a diagram\n```\n', {
				plugins: [diagram({ strict: true })],
			});
		} catch (error) {
			expect(error).toBeInstanceOf(DiagramError);
			expect((error as DiagramError).code).toBe('render');
		}
	});

	test('a document without a mermaid fence imports nothing', () => {
		expect(
			compile('```js\nx\n```\n', { plugins: [diagram()], highlight: false })
				.code
		).toBe('<pre><code class="language-js">x</code></pre>');
	});
});
