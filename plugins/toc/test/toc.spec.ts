import { anchors } from '@mdsvex/plugin-anchors';
import { steps } from '@mdsvex/plugin-steps';
import { tabs } from '@mdsvex/plugin-tabs';
import { toc, toc_tree, TocError } from '@mdsvex/plugin-toc';
import type { TocHeading } from '@mdsvex/plugin-toc';
import { compile } from 'mdsvex';
import type { Bundle, NodeView } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import {
	expect_parity,
	PATHS,
} from '../../../packages/parse/test/plugin_harness';

type Options = Parameters<typeof compile>[1];

function run(
	source: string,
	plugins: Bundle[] = [toc()],
	options: Options = {}
) {
	return compile(source, { heading_ids: true, plugins, ...options });
}

/** depth, id and text of each entry, as `2 id text` */
function entries(
	source: string,
	plugins: Bundle[] = [toc()],
	options: Options = {}
): string[] {
	const headings: TocHeading[] =
		(run(source, plugins, options).data?.toc as any)?.headings ?? [];
	return headings.map(({ depth, id, text }) => `${depth} ${id} ${text}`);
}

function codes(source: string, plugins: Bundle[] = [toc()]): string[] {
	return (run(source, plugins).warnings ?? []).map((warning) => warning.code);
}

/** what compile throws, an error from a handler reads badly through expect */
function thrown(make: () => unknown): any {
	try {
		make();
	} catch (error) {
		return error;
	}
	return undefined;
}

describe('data', () => {
	test('each heading has its depth, id, text and position', () => {
		const { data } = run('# Title\n\n## One\n\ntext\n\n### Two *words*\n');
		expect(data).toEqual({
			toc: {
				headings: [
					{
						depth: 2,
						id: 'one',
						text: 'One',
						position: {
							start: { offset: 9, line: 3, column: 0 },
							end: { offset: 15, line: 3, column: 6 },
						},
					},
					{
						depth: 3,
						id: 'two-words',
						text: 'Two words',
						position: {
							start: { offset: 23, line: 7, column: 0 },
							end: { offset: 38, line: 7, column: 15 },
						},
					},
				],
			},
		});
	});

	test('the document exports it as plugin_data', () => {
		expect(run('## One\n').code).toContain(
			'export const plugin_data = {"toc":{"headings":[{"depth":2,"id":"one","text":"One","position":'
		);
	});

	test('the depths 2 and 3 are listed unless the options say otherwise', () => {
		const source = '# A\n\n## B\n\n### C\n\n#### D\n\n##### E\n\n###### F\n';
		expect(entries(source)).toEqual(['2 b B', '3 c C']);
		expect(entries(source, [toc({ min_depth: 1 })])).toEqual([
			'1 a A',
			'2 b B',
			'3 c C',
		]);
		expect(entries(source, [toc({ max_depth: 6 })])).toEqual([
			'2 b B',
			'3 c C',
			'4 d D',
			'5 e E',
			'6 f F',
		]);
		expect(entries(source, [toc({ min_depth: 4, max_depth: 4 })])).toEqual([
			'4 d D',
		]);
	});

	test('a document with no entry has no toc key', () => {
		expect(run('text\n').data).toBeUndefined();
		expect(run('# Title\n\ntext\n').data).toBeUndefined();
		expect(run('::toc\n').data).toBeUndefined();
	});

	test('the id is the one heading_ids made, numbered when it repeats', () => {
		expect(entries('## Same\n\n## Same\n')).toEqual([
			'2 same Same',
			'2 same-1 Same',
		]);
		expect(
			entries('## Title\n', [toc()], {
				heading_ids: { slug: (text) => 'x-' + text.length },
			})
		).toEqual(['2 x-5 Title']);
	});

	test('an id a parse plugin set is listed, with or without heading_ids', () => {
		const ids = {
			heading: {
				parse(node: NodeView) {
					node.attrs.id = 'mine';
				},
			},
		};
		for (const heading_ids of [true, false]) {
			expect(
				entries('## Two\n', [toc()], { heading_ids, parse_plugins: [ids] })
			).toEqual(['2 mine Two']);
		}
	});

	test('one plugin serves many documents', () => {
		const plugins = [toc()];
		expect(entries('## A\n', plugins)).toEqual(['2 a A']);
		expect(entries('text\n', plugins)).toEqual([]);
		expect(entries('## B\n\n## C\n', plugins)).toEqual(['2 b B', '2 c C']);
	});

	test('a document written with crlf has the lines it was written with', () => {
		const { data } = run('# T\r\n\r\n## One\r\n');
		expect((data!.toc as any).headings[0].position.start).toEqual({
			offset: 5,
			line: 3,
			column: 0,
		});
	});
});

describe('text', () => {
	test('markup is dropped and code is kept', () => {
		expect(entries('## A *b* _c_ ~~d~~ `e<f>` [g](/h) ![i](j.png)\n')).toEqual([
			'2 a-b-c-d-ef-g-i A b c d e<f> g i',
		]);
	});

	test('a character reference is its character, in code it stays as written', () => {
		expect(
			entries('## A &amp; B &lt; C &#35; D &#x26; `&amp;`\n').map((entry) =>
				entry.replace(/^2 \S+ /, '')
			)
		).toEqual(['A & B < C # D & &amp;']);
	});

	test('a named reference outside the few html needs stays as written', () => {
		expect(entries('## Made &copy; here\n')).toEqual([
			'2 made--here Made &copy; here',
		]);
	});

	test('what svelte or a component renders is not in it', () => {
		expect(
			entries('## Version {version} <b>bold</b> <Badge>new</Badge> end\n')
		).toEqual(['2 version--bold--end Version  bold  end']);
	});

	test('a comment is not in it', () => {
		expect(entries('## One <!-- note --> two\n')).toEqual([
			'2 one--two One  two',
		]);
	});

	test('an unclosed delimiter is the text it turned out to be', () => {
		expect(entries('## One *two\n')).toEqual(['2 one-two One *two']);
		expect(entries('## A `b\n')).toEqual(['2 a-b A `b']);
		expect(entries('## See [the docs](\n')).toEqual([
			'2 see-the-docs See [the docs](',
		]);
	});
});

describe('heading ids', () => {
	test('with heading_ids off the compile fails with a typed error', () => {
		const error = thrown(() =>
			compile('# Title\n\n## One\n', {
				plugins: [toc()],
				filename: '/docs/intro.svx',
			})
		);
		expect(error).toBeInstanceOf(TocError);
		expect(error.name).toBe('TocError');
		expect(error.code).toBe('heading_ids');
		expect(error.filename).toBe('/docs/intro.svx');
		expect(error.message).toBe(
			'[@mdsvex/plugin-toc] no heading of /docs/intro.svx has an id, turn on the heading_ids option of mdsvex, this plugin makes no ids of its own'
		);
	});

	test('the error names no file when the compile was given none', () => {
		const error = thrown(() => compile('## One\n', { plugins: [toc()] }));
		expect(error.code).toBe('heading_ids');
		expect(error.filename).toBeUndefined();
		expect(error.message).toContain('no heading of the document has an id');
	});

	test('a document with no heading to list compiles with heading_ids off', () => {
		for (const source of ['text\n', '# Title\n\ntext\n', '#### Deep\n']) {
			const result = compile(source, { plugins: [toc()] });
			expect(result.data).toBeUndefined();
			expect(result.warnings).toBeUndefined();
		}
	});

	test('a heading left without an id is left out with a warning', () => {
		const source = '## {title}\n\n## Real\n\n## !!!\n';
		expect(entries(source)).toEqual(['2 real Real']);
		expect(run(source).warnings).toEqual([
			{
				plugin: 'toc',
				code: 'heading_without_id',
				message: 'a heading with no id is left out of the table of contents',
				start: { line: 1, column: 0 },
			},
			{
				plugin: 'toc',
				code: 'heading_without_id',
				message: 'a heading with no id is left out of the table of contents',
				start: { line: 5, column: 0 },
			},
		]);
	});

	test('headings that can have no id are no sign that heading_ids is off', () => {
		expect(codes('## {title}\n\n## !!!\n')).toEqual([
			'heading_without_id',
			'heading_without_id',
		]);
	});

	test('a heading typed as html is not a markdown heading', () => {
		expect(entries('<h2 id="typed">Typed</h2>\n\n## Real\n')).toEqual([
			'2 real Real',
		]);
	});
});

describe('leaving a heading out', () => {
	test('a heading that holds the no-toc comment is not listed', () => {
		expect(
			entries(
				'## One\n\n## Changelog <!-- no-toc -->\n\n## Two <!--no-toc-->\n'
			)
		).toEqual(['2 one One']);
	});

	test('it keeps its id and the comment is not in it', () => {
		expect(run('## Changelog <!-- no-toc -->\n').code).toContain(
			'<h2 id="changelog">'
		);
	});

	test('any other comment leaves the heading in', () => {
		expect(
			entries('## One <!-- toc -->\n\n## Two <!-- no-toc please -->\n')
		).toEqual(['2 one One', '2 two Two']);
	});

	test('a heading that is left out skips no level', () => {
		expect(codes('## One\n\n### Sub <!-- no-toc -->\n\n### Two\n')).toEqual([]);
		expect(codes('# One\n\n## Mid <!-- no-toc -->\n\n### Two\n')).toEqual([
			'skipped_level',
		]);
	});
});

describe('skipped levels', () => {
	test('an entry more than one level below the heading before it is reported', () => {
		expect(run('# Title\n\n### Deep\n').warnings).toEqual([
			{
				plugin: 'toc',
				code: 'skipped_level',
				message:
					'a level 3 heading follows a level 1 heading, a level is skipped',
				start: { line: 3, column: 0 },
			},
		]);
	});

	test('going back up any number of levels is fine, and so is the first heading', () => {
		expect(codes('### First\n\n## Two\n\n### Three\n\n## Four\n')).toEqual([]);
	});

	test('a heading outside the depths is not reported', () => {
		expect(codes('## Two\n\n#### Four\n')).toEqual([]);
		expect(codes('## Two\n\n#### Four\n', [toc({ max_depth: 4 })])).toEqual([
			'skipped_level',
		]);
	});
});

describe('containers', () => {
	test('a heading is listed wherever it is written', () => {
		expect(
			entries(
				[
					'## Top',
					'',
					'> ## Quoted',
					'',
					'- ## In a list',
					'',
					'<div>',
					'',
					'## In an element',
					'',
					'</div>',
					'',
					'{#if open}',
					'',
					'## In a block',
					'',
					'{/if}',
					'',
				].join('\n')
			)
		).toEqual([
			'2 top Top',
			'2 quoted Quoted',
			'2 in-a-list In a list',
			'2 in-an-element In an element',
			'2 in-a-block In a block',
		]);
	});

	test('the headings of steps are still headings', () => {
		const source =
			'## Before\n\n:::steps\n### Install\n\ntext\n\n### Configure\n:::\n';
		const expected = [
			'2 before Before',
			'3 install Install',
			'3 configure Configure',
		];
		expect(entries(source, [steps(), toc()])).toEqual(expected);
		expect(entries(source, [toc(), steps()])).toEqual(expected);
	});

	test('the headings tabs turned into labels are not, in either order', () => {
		const source = [
			'## Before',
			'',
			':::tabs',
			'### macOS',
			'',
			'#### Inside a panel',
			'',
			'### Windows',
			':::',
			'',
			'## After',
			'',
		].join('\n');
		for (const plugins of [
			[tabs(), toc({ max_depth: 4 })],
			[toc({ max_depth: 4 }), tabs()],
		]) {
			expect(entries(source, plugins)).toEqual([
				'2 before Before',
				'4 inside-a-panel Inside a panel',
				'2 after After',
			]);
		}
	});

	test('anchors change no entry, in either order and at any position', () => {
		const source =
			'## One *two*\n\n## Out <!-- no-toc -->\n\n### See [docs](/docs)\n';
		const expected = ['2 one-two One two', '3 see-docs See docs'];
		for (const position of ['wrap', 'prepend', 'append'] as const) {
			expect(entries(source, [anchors({ position }), toc()])).toEqual(expected);
			expect(entries(source, [toc(), anchors({ position })])).toEqual(expected);
		}
	});

	test('a label of tabs skips no level, the heading in its panel does', () => {
		const source = '## A\n\n:::tabs\n### One\n\n#### Deep\n:::\n';
		expect(codes(source, [tabs(), toc({ max_depth: 4 })])).toEqual([
			'skipped_level',
		]);
	});
});

describe('the ::toc directive', () => {
	/** the markup of a document, without its script blocks */
	function body(source: string, plugins: Bundle[] = [toc()]): string {
		return run(source, plugins).code.replace(
			/<script( module)?>[^]*?<\/script>/g,
			''
		);
	}

	/** the headings arg the component is given, parsed back */
	function listed(source: string, plugins: Bundle[] = [toc()]): unknown {
		const match = /headings=\{("(?:[^"\\]|\\.)*")\}/.exec(
			body(source, plugins)
		);
		return match === null ? undefined : JSON.parse(JSON.parse(match[1]));
	}

	test('its component is imported from the package', () => {
		expect(run('::toc\n\n## One\n').code).toMatch(
			/^<script>\nimport \{ toc as Toc_MDSVEX_D_G \} from '@mdsvex\/plugin-toc\/directives';\n<\/script>/
		);
	});

	test('it gets the headings written after it as json', () => {
		expect(body('::toc\n\n## One\n\n### Two\n')).toBe(
			'<Toc_MDSVEX_D_G headings={"[{\\"depth\\":2,\\"id\\":\\"one\\",\\"text\\":\\"One\\"},{\\"depth\\":3,\\"id\\":\\"two\\",\\"text\\":\\"Two\\"}]"} />' +
				'<h2 id="one">One</h2><h3 id="two">Two</h3>'
		);
	});

	test('before, between and after the headings it lists the same', () => {
		const all = [
			{ depth: 2, id: 'one', text: 'One' },
			{ depth: 2, id: 'two', text: 'Two' },
		];
		expect(listed('::toc\n\n## One\n\n## Two\n')).toEqual(all);
		expect(listed('## One\n\n::toc\n\n## Two\n')).toEqual(all);
		expect(listed('## One\n\n## Two\n\n::toc\n')).toEqual(all);
	});

	test('its brackets are the label of the list', () => {
		expect(body('::toc[On *this* page]\n\n## One\n')).toContain(
			'{#snippet label()}On <strong>this</strong> page{/snippet}</Toc_MDSVEX_D_G>'
		);
	});

	test('its depth args narrow what it lists, the data keeps every entry', () => {
		const source =
			'::toc(max_depth=2)\n\n::toc(min_depth=3)\n\n## One\n\n### Two\n';
		const code = body(source);
		expect(code).toContain(
			'<Toc_MDSVEX_D_G max_depth="2" headings={"[{\\"depth\\":2,\\"id\\":\\"one\\",\\"text\\":\\"One\\"}]"} />'
		);
		expect(code).toContain(
			'<Toc_MDSVEX_D_G min_depth="3" headings={"[{\\"depth\\":3,\\"id\\":\\"two\\",\\"text\\":\\"Two\\"}]"} />'
		);
		expect(entries(source)).toEqual(['2 one One', '3 two Two']);
	});

	test('a depth arg that is no depth is reported and ignored', () => {
		const source = '::toc(max_depth=two)\n\n## One\n';
		expect(listed(source)).toEqual([{ depth: 2, id: 'one', text: 'One' }]);
		expect(run(source).warnings).toEqual([
			{
				plugin: 'toc',
				code: 'bad_depth',
				message:
					'max_depth of ::toc must be a heading depth from 1 to 6, got "two"',
				start: { line: 1, column: 0 },
			},
		]);
	});

	test('other args reach the component as they are', () => {
		expect(body('::toc(class=side)\n\n## One\n')).toContain(
			'<Toc_MDSVEX_D_G class="side" headings='
		);
	});

	test('with no headings to list it is reported', () => {
		for (const source of [
			'::toc\n',
			'::toc\n\ntext\n',
			'# Title\n\n::toc\n',
			'## One\n\n::toc(min_depth=3)\n',
		]) {
			expect(body(source)).toContain('headings="[]"');
			expect(codes(source)).toEqual(['no_headings']);
		}
	});

	test('a heading left out is not listed', () => {
		expect(listed('::toc\n\n## One\n\n## Two <!-- no-toc -->\n')).toEqual([
			{ depth: 2, id: 'one', text: 'One' },
		]);
	});

	test('as a container or inline it lists nothing and is reported', () => {
		expect(run(':::toc\n:::\n\ntext :toc[x]\n\n## One\n').warnings).toEqual([
			{
				plugin: 'toc',
				code: 'not_a_leaf',
				message:
					'toc lists nothing as a container or inline, write ::toc on a line of its own',
				start: { line: 1, column: 0 },
			},
			{
				plugin: 'toc',
				code: 'not_a_leaf',
				message:
					'toc lists nothing as a container or inline, write ::toc on a line of its own',
				start: { line: 4, column: 5 },
			},
		]);
	});

	test('inside steps and tabs it still lists the whole document', () => {
		const source = ':::steps\n## One\n\n::toc\n\n## Two\n:::\n\n## Three\n';
		expect(listed(source, [steps(), toc()])).toEqual([
			{ depth: 2, id: 'one', text: 'One' },
			{ depth: 2, id: 'two', text: 'Two' },
			{ depth: 2, id: 'three', text: 'Three' },
		]);
		expect(
			listed(':::tabs\n### A\n\n::toc\n:::\n\n## After\n', [tabs(), toc()])
		).toEqual([{ depth: 2, id: 'after', text: 'After' }]);
	});
});

describe('options', () => {
	test('a depth that is no heading depth throws when the plugin is made', () => {
		for (const [options, message] of [
			[
				{ min_depth: 0 },
				'min_depth must be a heading depth from 1 to 6, got 0',
			],
			[
				{ max_depth: 7 },
				'max_depth must be a heading depth from 1 to 6, got 7',
			],
			[
				{ max_depth: '3' },
				'max_depth must be a heading depth from 1 to 6, got "3"',
			],
			[
				{ min_depth: 2.5 },
				'min_depth must be a heading depth from 1 to 6, got 2.5',
			],
			[
				{ min_depth: 4, max_depth: 2 },
				'min_depth 4 is deeper than max_depth 2',
			],
		] as const) {
			const error = thrown(() => toc(options as any));
			expect(error).toBeInstanceOf(TocError);
			expect(error.code).toBe('option');
			expect(error.message).toBe('[@mdsvex/plugin-toc] ' + message);
		}
	});
});

describe('toc_tree', () => {
	function heading(depth: number, id: string): TocHeading {
		return { depth, id, text: id.toUpperCase() };
	}

	/** ids of a tree, children in brackets */
	function shape(nodes: ReturnType<typeof toc_tree>): string {
		return nodes
			.map((node) =>
				node.children.length === 0
					? node.id
					: `${node.id}[${shape(node.children)}]`
			)
			.join(' ');
	}

	test('each heading goes under the nearest less deep heading before it', () => {
		expect(
			shape(
				toc_tree([
					heading(2, 'a'),
					heading(3, 'b'),
					heading(3, 'c'),
					heading(2, 'd'),
					heading(3, 'e'),
					heading(4, 'f'),
					heading(2, 'g'),
				])
			)
		).toBe('a[b c] d[e[f]] g');
	});

	test('a heading that skips a level is a child of the one it follows', () => {
		expect(
			shape(toc_tree([heading(2, 'a'), heading(4, 'b'), heading(3, 'c')]))
		).toBe('a[b c]');
	});

	test('a deep first heading is at the top', () => {
		expect(
			shape(toc_tree([heading(3, 'a'), heading(2, 'b'), heading(3, 'c')]))
		).toBe('a b[c]');
	});

	test('a node keeps what its heading has and the list is not changed', () => {
		const flat: TocHeading[] = [heading(2, 'a'), heading(3, 'b')];
		const tree = toc_tree(flat);
		expect(tree).toEqual([
			{
				depth: 2,
				id: 'a',
				text: 'A',
				children: [{ depth: 3, id: 'b', text: 'B', children: [] }],
			},
		]);
		expect(flat).toEqual([heading(2, 'a'), heading(3, 'b')]);
		expect(toc_tree([])).toEqual([]);
	});
});

describe('every parser path', () => {
	/** ids the way a fused plugin sets them, the harness runs no heading_ids */
	const ids = {
		heading: {
			parse(node: NodeView) {
				return () => {
					const id = node.text_content
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, '-')
						.replace(/^-|-$/g, '');
					if (id !== '') node.attrs.id = id;
				};
			},
		},
	};

	function setup() {
		const bundle = toc();
		return {
			// mdsvex names the parse plugin of a bundle after the bundle
			plugins: [ids, { name: bundle.name, ...bundle.parse! }],
			directive_handlers: [{ name: 'toc', directives: bundle.directives! }],
		};
	}

	function tree(source: string): unknown {
		return expect_parity(source, setup, { attrs: ['name', 'args'] });
	}

	/**
	 * the entries and warning codes of a document, the same on every path, a
	 * tree built from the wire has no positions and the others agree on theirs
	 */
	function parsed(source: string): { entries: string[]; codes: string[] } {
		let first: { entries: string[]; codes: string[] } | undefined;
		let positions: unknown;
		for (const [name, path] of PATHS) {
			const { dispatcher } = path(source, setup());
			const headings: TocHeading[] = dispatcher!.data()?.toc?.headings ?? [];
			const found = {
				entries: headings.map(
					({ depth, id, text }) => `${depth} ${id} ${text}`
				),
				codes: (dispatcher!.warnings ?? []).map((warning) => warning.code),
			};
			if (first === undefined) first = found;
			else expect(found, name).toEqual(first);
			const where = headings.map((heading) => heading.position);
			if (name.startsWith('wire')) {
				expect(
					where.every((position) => position === undefined),
					name
				).toBe(true);
			} else if (positions === undefined) {
				positions = where;
				expect(
					where.every((position) => position !== undefined),
					name
				).toBe(true);
			} else expect(where, name).toEqual(positions);
		}
		return first!;
	}

	test('whole, fed and over the wire give the same entries', () => {
		expect(
			parsed(
				'# Title\n\n::toc[On this page]\n\n## One *two* `three`\n\ntext\n\n> ### Quoted\n\n## Four <!-- no-toc -->\n\n#### Deep\n\n## Five\n'
			)
		).toEqual({
			entries: [
				'2 one-two-three One two three',
				'3 quoted Quoted',
				'2 five Five',
			],
			codes: [],
		});
	});

	test('the directive is given its list and keeps no helper node', () => {
		expect(tree('::toc[Contents]\n\n## One\n\n### Two\n')).toEqual([
			'root',
			[
				'directive_leaf name="toc" args={"headings":"[{\\"depth\\":2,\\"id\\":\\"one\\",\\"text\\":\\"One\\"},{\\"depth\\":3,\\"id\\":\\"two\\",\\"text\\":\\"Two\\"}]"}',
				['directive_label', 'text:Contents'],
			],
			['heading', 'text:One'],
			['heading', 'text:Two'],
		]);
		expect(tree('::toc\n')).toEqual([
			'root',
			'directive_leaf name="toc" args={"headings":"[]"}',
		]);
	});

	test('a heading that holds an unclosed delimiter', () => {
		expect(parsed('## One *two\n\n## A `b\n\n## See [docs](\n')).toEqual({
			entries: ['2 one-two One *two', '2 a-b A `b', '2 see-docs See [docs]('],
			codes: [],
		});
	});

	test('a heading in an element that never closes', () => {
		expect(parsed('<div>\n\n## Inside\n\ntext\n')).toEqual({
			entries: ['2 inside Inside'],
			codes: [],
		});
	});

	test('an unclosed delimiter ahead of a heading and of the directive', () => {
		expect(
			parsed('text *open\n\n::toc\n\n## One\n\n- item _open\n\n## Two\n')
		).toEqual({ entries: ['2 one One', '2 two Two'], codes: [] });
	});

	test('a marker in a heading whose delimiter never closes', () => {
		expect(parsed('## Out *of <!-- no-toc -->\n\n## In\n')).toEqual({
			entries: ['2 in In'],
			codes: [],
		});
	});

	test('warnings are the same on every path', () => {
		expect(
			parsed('# T\n\n### Skips\n\n::toc(min_depth=6)\n\n:::toc\n:::\n')
		).toEqual({
			entries: ['3 skips Skips'],
			codes: ['not_a_leaf', 'skipped_level', 'no_headings'],
		});
	});
});
