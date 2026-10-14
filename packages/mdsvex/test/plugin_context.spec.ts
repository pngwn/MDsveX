import {
	PFMParser,
	PluginDispatcher,
	WireEmitter,
	WireTextSource,
} from '@mdsvex/parse';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { describe, expect, test } from 'vitest';

import {
	compile,
	compile_inputs,
	CompilerSession,
	FrontmatterError,
	heading_slug,
} from '../src/main';
import type {
	Bundle,
	CompileInputs,
	NodeView,
	ParsePlugin,
	PluginContext,
	TraceTarget,
} from '../src/main';
import { toc } from './toc_plugin';

const DOC = [
	'---',
	'title: Guide',
	'---',
	'',
	'# Guide',
	'',
	'intro',
	'',
	'## Set *up*',
	'',
	'#### Deep',
	'',
	'## Set up',
	'',
].join('\n');

const HEADINGS = [
	{ depth: 1, text: 'Guide', id: 'guide' },
	{ depth: 2, text: 'Set up', id: 'set-up' },
	{ depth: 4, text: 'Deep', id: 'deep' },
	{ depth: 2, text: 'Set up', id: 'set-up-1' },
];

const SKIPPED = {
	plugin: 'toc',
	code: 'skipped_heading_level',
	message: 'a level 4 heading follows a level 2 heading',
	start: { line: 11, column: 0 },
};

function target(): TraceTarget {
	return {
		source: '',
		html: '',
		metadata: undefined,
		template: undefined,
		warnings: undefined,
		data: undefined,
		buf: new Uint32Array(0),
		start: 0,
		split: 0,
		end: 0,
	};
}

function inputs_with(fields: Partial<CompileInputs>): CompileInputs {
	return Object.assign(compile_inputs(), fields);
}

/** runs a handler for every heading */
const on_heading = (
	parse: (node: NodeView, ctx: PluginContext) => (() => void) | void,
	name?: string
): ParsePlugin => ({ name, heading: { parse } });

describe('a table of contents plugin', () => {
	test('compile returns the headings with the ids heading_ids made', () => {
		const result = compile(DOC, { heading_ids: true, plugins: [toc()] });
		expect(result.data).toEqual({ toc: { headings: HEADINGS } });
		expect(result.warnings).toEqual([SKIPPED]);
		expect(result.code).toContain('<h4 id="deep">Deep</h4>');
	});

	test('without heading_ids the headings have no id', () => {
		const result = compile('# a\n\n## b\n', { plugins: [toc()] });
		expect(result.data).toEqual({
			toc: {
				headings: [
					{ depth: 1, text: 'a', id: undefined },
					{ depth: 2, text: 'b', id: undefined },
				],
			},
		});
		expect(result.warnings).toBeUndefined();
	});

	test('a document without headings has no data', () => {
		const result = compile('text\n', { plugins: [toc()] });
		expect(result.data).toBeUndefined();
		expect('data' in result).toBe(false);
	});

	test('a session gives each document its own', () => {
		const session = new CompilerSession();
		const options = { heading_ids: true, plugins: [toc()] };
		const one = session.compile(DOC, options);
		const two = session.compile('# Other\n', options);
		const three = session.compile('text\n', options);
		expect(one.data).toEqual({ toc: { headings: HEADINGS } });
		expect(one.warnings).toEqual([SKIPPED]);
		expect(two.data).toEqual({
			toc: { headings: [{ depth: 1, text: 'Other', id: 'other' }] },
		});
		expect(two.warnings).toBeUndefined();
		expect(three.data).toBeUndefined();
	});

	test('every kind of session compile returns them', () => {
		const session = new CompilerSession();
		const plugins = [toc()];
		const expected = { toc: { headings: HEADINGS } };
		const mapped = session.compile(DOC, {
			heading_ids: true,
			plugins,
			sourcemap: true,
		});
		expect(mapped.data).toEqual(expected);
		expect(mapped.warnings).toEqual([SKIPPED]);
		const inputs = inputs_with({ plugins, heading_ids: heading_slug });
		const out = target();
		session.compile_into(DOC, inputs, out);
		expect(out.data).toEqual(expected);
		expect(out.warnings).toEqual([SKIPPED]);
		// the target is kept, a document that leaves nothing clears it
		out.warnings = undefined;
		session.compile_into('text\n', inputs, out);
		expect(out.data).toBeUndefined();
		expect(out.warnings).toBeUndefined();
	});

	test('a parsed document has them before it renders', () => {
		const session = new CompilerSession();
		const inputs = inputs_with({ plugins: [toc()], heading_ids: heading_slug });
		const parsed = session.parse(DOC, inputs);
		expect(parsed.data).toEqual({ toc: { headings: HEADINGS } });
		// another document takes its turn on the session
		expect(
			session.compile('# Other\n', { plugins: inputs.plugins }).data
		).toEqual({
			toc: { headings: [{ depth: 1, text: 'Other', id: undefined }] },
		});
		const result = session.render(parsed, inputs);
		expect(result.data).toEqual({ toc: { headings: HEADINGS } });
		expect(result.warnings).toEqual([SKIPPED]);
		// the session moves on, what the document left stays its own
		session.compile('# Later\n', { plugins: inputs.plugins });
		expect(parsed.data).toEqual({ toc: { headings: HEADINGS } });
		expect(result.data).toEqual({ toc: { headings: HEADINGS } });
	});

	test('a kept document renders again with them', () => {
		const session = new CompilerSession();
		const inputs = inputs_with({ plugins: [toc()], heading_ids: heading_slug });
		const out = target();
		session.compile_into(DOC, inputs, out);
		out.warnings = undefined;
		const parsed = session.keep(DOC, inputs, out.metadata);
		session.render_into(parsed, inputs, out);
		expect(out.data).toEqual({ toc: { headings: HEADINGS } });
		expect(out.warnings).toEqual([SKIPPED]);
	});

	test('the same plugin collects over the wire', () => {
		const plugin = { ...toc().parse!, name: 'toc' };
		// heading_ids is a pass of compile, here a plugin sets the ids
		const ids: ParsePlugin = {
			heading: {
				parse: (node) => () => {
					node.attrs.id = heading_slug(node.text_content);
				},
			},
		};
		const source = '# Guide\n\n## Set *up*\n\n#### Deep\n';
		for (const chunk of [0, 5, 1]) {
			const emitter = new WireEmitter();
			const parser = new PFMParser(emitter);
			const dispatcher = new PluginDispatcher(
				[ids, plugin],
				new WireTextSource([])
			);
			const builder = new WireTreeBuilder(128, dispatcher);
			if (chunk === 0) {
				emitter.set_source(source);
				parser.parse(source);
			} else {
				parser.init();
				for (let i = 0; i < source.length; i += chunk) {
					emitter.set_source(source.slice(0, i + chunk));
					parser.feed(source.slice(i, i + chunk));
					builder.apply(emitter.flush());
				}
				emitter.set_source(source);
				parser.finish();
			}
			builder.apply(emitter.flush());
			dispatcher.run_sequential(builder.get_buffer());
			expect(dispatcher.data(), `fed ${chunk}`).toEqual({
				toc: {
					headings: [
						{ depth: 1, text: 'Guide', id: 'guide' },
						{ depth: 2, text: 'Set up', id: 'set-up' },
						{ depth: 4, text: 'Deep', id: 'deep' },
					],
				},
			});
			// the wire carries no offsets, so the warning has no position
			expect(dispatcher.warnings, `fed ${chunk}`).toEqual([
				{
					plugin: 'toc',
					code: SKIPPED.code,
					message: SKIPPED.message,
					start: undefined,
					end: undefined,
				},
			]);
		}
	});
});

describe('ctx.filename', () => {
	test('is the filename option, undefined without one', () => {
		const seen: unknown[] = [];
		const parse_plugins = [
			on_heading((_n, ctx) => void seen.push(ctx.filename)),
		];
		compile('# a\n', { parse_plugins });
		compile('# a\n', { parse_plugins, filename: '/docs/a.svx' });
		const session = new CompilerSession();
		session.compile('# a\n', { parse_plugins, filename: '/docs/b.svx' });
		session.compile('# a\n', { parse_plugins });
		expect(seen).toEqual([undefined, '/docs/a.svx', '/docs/b.svx', undefined]);
	});

	test('bound handlers read it', () => {
		const seen: unknown[] = [];
		const bundle: Bundle = {
			name: 'box',
			module: 'm',
			directives: {
				box: {
					children: { heading: (_n, ctx) => void seen.push(ctx.filename) },
				},
			},
		};
		compile(':::box\n# a\n:::\n', { plugins: [bundle], filename: 'a.svx' });
		expect(seen).toEqual(['a.svx']);
	});
});

describe('ctx.frontmatter', () => {
	const FM = '---\ntitle: Hi\ntags: [a, b]\n---\n\n# a\n';

	test('is the metadata of the document', () => {
		const seen: unknown[] = [];
		const result = compile(FM, {
			parse_plugins: [on_heading((_n, ctx) => void seen.push(ctx.frontmatter))],
		});
		expect(seen).toEqual([{ title: 'Hi', tags: ['a', 'b'] }]);
		expect(seen[0]).toBe(result.metadata);
	});

	test('is undefined without frontmatter', () => {
		const seen: unknown[] = [];
		compile('# a\n', {
			parse_plugins: [on_heading((_n, ctx) => void seen.push(ctx.frontmatter))],
		});
		expect(seen).toEqual([undefined]);
	});

	test('honours frontmatter.parse, which runs once for a document', () => {
		for (const reads of [0, 1, 3]) {
			const raws: string[] = [];
			const seen: unknown[] = [];
			const result = compile('---\na = 1\n---\n\n# a\n', {
				frontmatter: { parse: (raw) => (raws.push(raw), { a: 1 }) },
				parse_plugins: [
					on_heading((_n, ctx) => {
						for (let i = 0; i < reads; i++) seen.push(ctx.frontmatter);
					}),
				],
			});
			expect(raws, `${reads} reads`).toEqual(['a = 1\n']);
			expect(seen).toEqual(new Array(reads).fill({ a: 1 }));
			expect(result.metadata).toEqual({ a: 1 });
			expect(result.code).toContain('export const metadata = {"a":1};');
		}
	});

	test('a session reads the frontmatter of each document', () => {
		const session = new CompilerSession();
		const seen: unknown[] = [];
		const options = {
			parse_plugins: [on_heading((_n, ctx) => void seen.push(ctx.frontmatter))],
		};
		session.compile('---\nn: 1\n---\n# a\n', options);
		session.compile('# b\n', options);
		session.compile('---\nn: 3\n---\n# c\n', options);
		expect(seen).toEqual([{ n: 1 }, undefined, { n: 3 }]);
	});

	test('every handler after the frontmatter node has it, its own open handler does not', () => {
		const seen: unknown[] = [];
		const plugin: ParsePlugin = {
			frontmatter: {
				parse(_node, ctx) {
					seen.push(['open', ctx.frontmatter]);
					return () => seen.push(['close', ctx.frontmatter]);
				},
			},
			paragraph: { parse: (_n, ctx) => void seen.push(['p', ctx.frontmatter]) },
		};
		compile('---\nn: 1\n---\ntext\n', { parse_plugins: [plugin] });
		expect(seen).toEqual([
			['open', undefined],
			['close', { n: 1 }],
			['p', { n: 1 }],
		]);
	});

	test('frontmatter that does not parse throws from the handler that reads it', () => {
		const run = (parse_plugins: ParsePlugin[]) =>
			compile('---\na: &x 1\n---\n\n# a\n', { parse_plugins });
		let thrown: unknown;
		try {
			run([on_heading((_n, ctx) => void ctx.frontmatter)]);
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toBeInstanceOf(FrontmatterError);
		// the error a compile gives when no handler reads it
		expect(() => run([on_heading(() => {})])).toThrow(
			(thrown as Error).message
		);
	});
});

describe('ctx.warn', () => {
	test('a warning points at its node, line from 1 and column from 0', () => {
		const result = compile('intro\n\ntext and *strong*\n', {
			parse_plugins: [
				{
					name: 'lint',
					strong_emphasis: {
						parse: (node, ctx) => ctx.warn('no_strong', 'no strong here', node),
					},
				},
			],
		});
		expect(result.warnings).toEqual([
			{
				plugin: 'lint',
				code: 'no_strong',
				message: 'no strong here',
				start: { line: 3, column: 9 },
			},
		]);
	});

	test('the line and column hold in a source with \\r\\n', () => {
		const result = compile('intro\r\n\r\ntext and *strong*\r\n', {
			parse_plugins: [
				{
					strong_emphasis: {
						parse: (node, ctx) => ctx.warn('no_strong', 'm', node),
					},
				},
			],
		});
		expect(result.warnings).toEqual([
			{ code: 'no_strong', message: 'm', start: { line: 3, column: 9 } },
		]);
	});

	test('without a node it points at the start of the document', () => {
		const result = compile('\n\n# a\n', {
			parse_plugins: [on_heading((_n, ctx) => ctx.warn('any', 'm'))],
		});
		expect(result.warnings).toEqual([
			{ code: 'any', message: 'm', start: { line: 1, column: 0 } },
		]);
	});

	test('a warning from a node that is revoked is not reported', () => {
		const lint: ParsePlugin = {
			name: 'links',
			link: {
				parse(node, ctx) {
					ctx.warn('link', 'a link opened', node);
					ctx.add('links', node.type);
				},
			},
		};
		// the first bracket never gets a destination
		const result = compile('[a] and [b](c)\n', { parse_plugins: [lint] });
		expect(result.warnings).toEqual([
			{
				plugin: 'links',
				code: 'link',
				message: 'a link opened',
				start: { line: 1, column: 8 },
			},
		]);
		expect(result.data).toEqual({ links: { links: ['link'] } });
		const none = compile('[a] and *b\n', { parse_plugins: [lint] });
		expect(none.warnings).toBeUndefined();
		expect(none.data).toBeUndefined();
	});

	test('plugin warnings come ahead of those of the render', () => {
		const result = compile('# a\n\n<p on:click={go}>b</p>\n', {
			components: [{ specifier: '$lib/md.ts', names: ['p'] }],
			component_mode: 'all',
			parse_plugins: [
				on_heading((node, ctx) => ctx.warn('h', 'a heading', node)),
			],
		});
		expect(result.warnings!.map((w) => w.code)).toEqual([
			'h',
			'element_directive',
		]);
	});
});

describe('ctx.set and ctx.add', () => {
	test('the parse plugin and the bound handlers of a bundle share one object', () => {
		const bundle: Bundle = {
			name: 'kit',
			module: 'm',
			// a name of its own is replaced by that of the bundle
			parse: {
				name: 'other',
				heading: { parse: (_n, ctx) => ctx.set('headings', true) },
			},
			directives: {
				box: { parse: (_n, ctx) => ctx.set('boxes', true) },
			},
		};
		const result = compile('# a\n\n:::box\n:::\n', { plugins: [bundle] });
		expect(result.data).toEqual({ kit: { headings: true, boxes: true } });
	});

	test('two plugins keep apart', () => {
		const result = compile('# a\n', {
			parse_plugins: [
				on_heading((_n, ctx) => ctx.set('value', 1), 'one'),
				on_heading((_n, ctx) => ctx.set('value', 2), 'two'),
			],
		});
		expect(result.data).toEqual({ one: { value: 1 }, two: { value: 2 } });
	});

	test('a parse plugin without a name can not use it', () => {
		expect(() =>
			compile('# a\n', {
				parse_plugins: [on_heading((_n, ctx) => void ctx.data)],
			})
		).toThrow('give the plugin a name');
	});

	test('a compile started in a handler keeps its own', () => {
		const session = new CompilerSession();
		const inner: unknown[] = [];
		const options = {
			parse_plugins: [
				on_heading(
					(node, ctx) => () => {
						const text = node.text_content;
						ctx.set('title', text);
						ctx.warn('title', text);
						if (text === 'outer')
							inner.push(session.compile('# inner\n', options));
					},
					'titles'
				),
			],
		};
		const outer = session.compile('# outer\n', options);
		expect(outer.data).toEqual({ titles: { title: 'outer' } });
		expect(outer.warnings!.map((w) => w.message)).toEqual(['outer']);
		expect((inner[0] as typeof outer).data).toEqual({
			titles: { title: 'inner' },
		});
		expect((inner[0] as typeof outer).warnings!.map((w) => w.message)).toEqual([
			'inner',
		]);
	});
});

describe('a compile without plugins', () => {
	test('has no data and no plugin on its warnings', () => {
		const result = compile('---\na: 1\n---\n# a\n');
		expect(Object.keys(result)).toEqual(['code', 'metadata', 'template']);
		const session = new CompilerSession();
		expect(Object.keys(session.compile('# a\n'))).toEqual([
			'code',
			'metadata',
			'template',
		]);
	});
});
