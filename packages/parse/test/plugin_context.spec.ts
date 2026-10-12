import { describe, expect, it } from 'vitest';

import { PFMParser, parse_markdown_svelte } from '../src/main';
import type {
	DirectiveTable as RootDirectiveTable,
	DocumentContext,
	NamedDirectiveHandlers,
	PluginData as RootPluginData,
	PluginDocument,
	PluginWarning as RootPluginWarning,
	Point,
	Position,
} from '../src/main';
import { SourceTextSource } from '../src/node_view';
import type { NodeView } from '../src/node_view';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type {
	DirectiveTable,
	ParsePlugin,
	PluginContext,
	PluginData,
	PluginWarning,
} from '../src/plugin_types';
import { TreeBuilder } from '../src/tree_builder';
import { PATHS, expect_parity_logged } from './plugin_harness';
import type { PluginSetup } from './plugin_harness';

const BATCH = PATHS.filter(([name]) => name.startsWith('batch'));
const WIRE = PATHS.filter(([name]) => name.startsWith('wire'));

/** the warnings and data every path leaves, which must be the same on each */
function left(
	source: string,
	make: () => PluginSetup,
	positions = false
): { warnings: PluginWarning[] | undefined; data: PluginData | undefined } {
	let first: ReturnType<typeof left> | undefined;
	for (const [name, run] of PATHS) {
		const out = run(source, make());
		let warnings = out.dispatcher!.warnings;
		// only a tree built from the source has offsets
		if (!positions && warnings !== undefined) {
			warnings = warnings.map((w) => ({
				...w,
				start: undefined,
				end: undefined,
			}));
		}
		const now = { warnings, data: out.dispatcher!.data() };
		if (first === undefined) first = now;
		else expect(now, `${name} against ${PATHS[0][0]}`).toEqual(first);
	}
	return first!;
}

const warning = (
	plugin: string | undefined,
	code: string,
	message: string
): PluginWarning => ({
	plugin,
	code,
	message,
	start: undefined,
	end: undefined,
});

describe('plugin context: filename', () => {
	it('is undefined when nothing told the dispatcher', () => {
		const { log } = expect_parity_logged('# a\n', (log) => [
			{ heading: { parse: (_node, ctx) => void log.push(ctx.filename + '') } },
		]);
		expect(log).toEqual(['undefined']);
	});

	it('is what set_document gave, in every kind of handler', () => {
		const { log } = expect_parity_logged(
			'# a\n\n:::box\n## b\n:::\n',
			(log) => ({
				document: { filename: '/docs/a.svx' },
				plugins: [
					{
						heading: { parse: (_n, ctx) => void log.push('g ' + ctx.filename) },
					},
					{
						sequential: true,
						heading: { parse: (_n, ctx) => void log.push('s ' + ctx.filename) },
					},
				],
				directive_handlers: [
					{
						box: {
							parse: (_n, ctx) => void log.push('p ' + ctx.filename),
							children: {
								heading: (_n, ctx) => void log.push('c ' + ctx.filename),
							},
							descendants: {
								heading: (_n, ctx) => void log.push('d ' + ctx.filename),
							},
						},
					},
				],
			})
		);
		expect(log).toEqual([
			'g /docs/a.svx',
			'p /docs/a.svx',
			'c /docs/a.svx',
			'd /docs/a.svx',
			'g /docs/a.svx',
			's /docs/a.svx',
			's /docs/a.svx',
		]);
	});

	it('a reset forgets the document', () => {
		const seen: unknown[] = [];
		const dispatcher = new PluginDispatcher(
			[{ heading: { parse: (_n, ctx) => void seen.push(ctx.filename) } }],
			new SourceTextSource('# a\n')
		);
		const tree = new TreeBuilder(16, dispatcher);
		const parser = new PFMParser(tree);
		dispatcher.set_document({ filename: 'one.svx' });
		parser.parse('# a\n');
		tree.reset();
		parser.parse('# a\n');
		expect(seen).toEqual(['one.svx', undefined]);
	});
});

describe('plugin context: frontmatter', () => {
	const FM = '---\ntitle: Hi\n---\n\n# a\n\ntext\n';

	it('is undefined when nothing reads frontmatter for the dispatcher', () => {
		const { log } = expect_parity_logged(FM, (log) => [
			{ heading: { parse: (_n, ctx) => void log.push(ctx.frontmatter + '') } },
		]);
		expect(log).toEqual(['undefined']);
	});

	it('is read when a handler asks and not before', () => {
		for (const [name, run] of PATHS) {
			let reads = 0;
			const seen: unknown[] = [];
			const frontmatter = () => (reads++, { title: 'Hi' });
			run(FM, {
				document: { frontmatter },
				plugins: [{ paragraph: { parse() {} } }],
			});
			expect(reads, name).toBe(0);
			run(FM, {
				document: { frontmatter },
				plugins: [
					{ heading: { parse: (_n, ctx) => void seen.push(ctx.frontmatter) } },
				],
			});
			expect(reads, name).toBe(1);
			expect(seen, name).toEqual([{ title: 'Hi' }]);
		}
	});

	it('bound handlers and sequential plugins read it too', () => {
		const { log } = expect_parity_logged(
			'---\nn: 1\n---\n\n:::box\n## b\n:::\n',
			(log) => ({
				document: { frontmatter: () => ({ n: 1 }) },
				plugins: [
					{
						sequential: true,
						heading: {
							parse: (_n, ctx) => void log.push('s ' + ctx.frontmatter!.n),
						},
					},
				],
				directive_handlers: [
					{
						box: {
							children: {
								heading: (_n, ctx) => void log.push('c ' + ctx.frontmatter!.n),
							},
						},
					},
				],
			})
		);
		expect(log).toEqual(['c 1', 's 1']);
	});

	// what makes a lazy read safe, the frontmatter is the first node and is
	// closed before any other node opens, however the source is fed
	it('closes before any other node opens', () => {
		const every = (log: string[]): ParsePlugin => {
			const on = (type: string) => ({
				parse(node: NodeView) {
					log.push('open ' + type);
					return () => void log.push('close ' + node.type);
				},
			});
			return {
				frontmatter: on('frontmatter'),
				heading: on('heading'),
				paragraph: on('paragraph'),
				html: on('html'),
				list: on('list'),
			};
		};
		for (const body of ['# a\n', 'text\n', '<div>\n\nx\n\n</div>\n', '- a\n']) {
			const { log } = expect_parity_logged(
				'---\ntitle: Hi\n---\n' + body,
				(log) => [every(log)]
			);
			expect(log.slice(0, 2), body).toEqual([
				'open frontmatter',
				'close frontmatter',
			]);
			expect(log.length, body).toBeGreaterThan(2);
		}
	});

	it('only the first node of a document is frontmatter', () => {
		for (const source of [
			'\n---\ntitle: Hi\n---\n',
			'a\n\n---\ntitle: Hi\n---\n',
		]) {
			const { log } = expect_parity_logged(source, (log) => [
				{ frontmatter: { parse: () => void log.push('frontmatter') } },
			]);
			expect(log, JSON.stringify(source)).toEqual([]);
		}
	});
});

describe('plugin context: warn', () => {
	it('keeps the code, the message and the name of the plugin, in order', () => {
		const out = left('# a\n\n## b\n', () => ({
			plugins: [
				{
					name: 'one',
					heading: {
						parse(node, ctx) {
							ctx.warn('open', 'depth ' + node.depth);
							return () => ctx.warn('close', node.text_content, node);
						},
					},
				},
				{ heading: { parse: (_n, ctx) => ctx.warn('bare', 'no name') } },
			],
		}));
		expect(out.warnings).toEqual([
			warning('one', 'open', 'depth 1'),
			warning(undefined, 'bare', 'no name'),
			warning('one', 'close', 'a'),
			warning('one', 'open', 'depth 2'),
			warning(undefined, 'bare', 'no name'),
			warning('one', 'close', 'b'),
		]);
	});

	it('points at the node on a tree built from the source', () => {
		const source = 'intro\n\n## b *c*\n';
		const plugins = (): ParsePlugin[] => [
			{
				name: 'p',
				heading: {
					parse(node, ctx) {
						ctx.warn('open', 'o', node);
						return () => ctx.warn('close', 'c', node);
					},
				},
				strong_emphasis: {
					parse: (node, ctx) => () => ctx.warn('strong', 's', node),
				},
			},
		];
		for (const [name, run] of BATCH) {
			expect(run(source, plugins()).dispatcher!.warnings, name).toEqual([
				// the heading is still open in its own open handler
				{ plugin: 'p', code: 'open', message: 'o', start: 7, end: undefined },
				{ plugin: 'p', code: 'strong', message: 's', start: 12, end: 15 },
				{ plugin: 'p', code: 'close', message: 'c', start: 7, end: 15 },
			]);
		}
		for (const [name, run] of WIRE) {
			expect(run(source, plugins()).dispatcher!.warnings, name).toEqual([
				warning('p', 'open', 'o'),
				warning('p', 'strong', 's'),
				warning('p', 'close', 'c'),
			]);
		}
	});

	it('has no position for a node a plugin made', () => {
		for (const [name, run] of PATHS) {
			const out = run('# a\n', [
				{
					heading: {
						parse: (node, ctx) =>
							ctx.warn('made', 'm', node.wrap_inner('link', { href: '#a' })),
					},
				},
			]);
			expect(out.dispatcher!.warnings, name).toEqual([
				warning(undefined, 'made', 'm'),
			]);
		}
	});

	it('a bound handler warns under the name its table came with', () => {
		const out = left(':::box\n## b\n:::\n', () => ({
			directive_handlers: [
				{
					name: 'boxes',
					directives: {
						box: {
							parse: (_n, ctx) => ctx.warn('box', 'a box'),
							children: { heading: (_n, ctx) => ctx.warn('child', 'a child') },
						},
					},
				},
			],
		}));
		expect(out.warnings).toEqual([
			warning('boxes', 'box', 'a box'),
			warning('boxes', 'child', 'a child'),
		]);
	});

	it('a sequential plugin warns', () => {
		const out = left('# a\n', () => ({
			plugins: [
				{
					name: 'late',
					sequential: true,
					heading: { parse: (node, ctx) => ctx.warn('seq', node.text_content) },
				},
			],
		}));
		expect(out.warnings).toEqual([warning('late', 'seq', 'a')]);
	});

	it('takes only strings', () => {
		for (const args of [
			[1, 'm'],
			['', 'm'],
			['c', undefined],
		]) {
			expect(() =>
				PATHS[0][1]('# a\n', [
					{
						heading: {
							parse: (_n, ctx) => (ctx.warn as any)(...args),
						},
					},
				])
			).toThrow('ctx.warn takes a code and a message');
		}
	});

	it('no warning leaves undefined', () => {
		expect(
			left('# a\n', () => ({ plugins: [{ heading: { parse() {} } }] }))
		).toEqual({ warnings: undefined, data: undefined });
	});
});

/** warns and writes data from the open handler and the close callback of a kind */
const tell = (type: string): ParsePlugin => ({
	name: 'tell',
	[type]: {
		parse(node: NodeView, ctx: PluginContext) {
			ctx.warn('open', type);
			ctx.data.opened = (ctx.data.opened ?? 0) + 1;
			return () => {
				ctx.warn('close', node.text_content);
				ctx.data.closed = node.text_content;
			};
		},
	},
});

describe('plugin context: a revoke takes back warnings and data', () => {
	it('of a delimiter that never closes', () => {
		// the strong is closed where its paragraph ends and revoked after
		expect(
			left('a *b\n', () => ({ plugins: [tell('strong_emphasis')] }))
		).toEqual({ warnings: undefined, data: undefined });
	});

	it('and keeps those of one that closes', () => {
		expect(
			left('a *b*\n', () => ({ plugins: [tell('strong_emphasis')] }))
		).toEqual({
			warnings: [
				warning('tell', 'open', 'strong_emphasis'),
				warning('tell', 'close', 'b'),
			],
			data: { tell: { opened: 1, closed: 'b' } },
		});
	});

	it('of a link with no destination, while a later one stays', () => {
		expect(
			left('[a] and [b](c)\n', () => ({ plugins: [tell('link')] }))
		).toEqual({
			warnings: [
				warning('tell', 'open', 'link'),
				warning('tell', 'close', 'b'),
			],
			data: { tell: { opened: 1, closed: 'b' } },
		});
	});

	it('of a code span that never closes, a node that opened committed', () => {
		expect(left('a `b\n', () => ({ plugins: [tell('code_span')] }))).toEqual({
			warnings: undefined,
			data: undefined,
		});
	});

	it('of frontmatter with no closing fence', () => {
		expect(
			left('---\ntitle: a\n', () => ({ plugins: [tell('frontmatter')] }))
		).toEqual({ warnings: undefined, data: undefined });
	});

	it('of the paragraphs a tight list revokes, first to last', () => {
		// each paragraph closes, its callback runs, and the list end revokes it
		expect(
			left('- a\n- b\n- c\n', () => ({ plugins: [tell('paragraph')] }))
		).toEqual({ warnings: undefined, data: undefined });
	});

	it('a loose list commits its paragraphs and what they left', () => {
		expect(
			left('- a\n\n- b\n', () => ({ plugins: [tell('paragraph')] }))
		).toEqual({
			warnings: [
				warning('tell', 'open', 'paragraph'),
				warning('tell', 'close', 'a'),
				warning('tell', 'open', 'paragraph'),
				warning('tell', 'close', 'b'),
			],
			data: { tell: { opened: 2, closed: 'b' } },
		});
	});

	it('of a bound handler', () => {
		const table = (): DirectiveTable => ({
			name: 'boxes',
			directives: {
				box: {
					descendants: {
						link(node, ctx) {
							ctx.warn('link', 'open');
							ctx.data.links = ctx.index + 1;
						},
					},
				},
			},
		});
		expect(
			left(':::box\n[a] [b](c) [d]\n:::\n', () => ({
				directive_handlers: [table()],
			}))
		).toEqual({
			warnings: [warning('boxes', 'link', 'open')],
			data: { boxes: { links: 1 } },
		});
	});

	it('a warning about another node goes with the node whose handler reported it', () => {
		const out = left('# a *b\n', () => ({
			plugins: [
				{
					strong_emphasis: {
						parse: (node, ctx) =>
							ctx.warn('parent', 'about the heading', node.parent!),
					},
				},
				{ heading: { parse: (_n, ctx) => ctx.warn('heading', 'stays') } },
			],
		}));
		expect(out.warnings).toEqual([warning(undefined, 'heading', 'stays')]);
	});
});

describe('plugin context: data', () => {
	it('is one object per plugin name', () => {
		const out = left('# a\n\n## b\n', () => ({
			plugins: [
				{
					name: 'titles',
					heading: {
						parse: (node, ctx) => () => {
							ctx.data.last = node.text_content;
							ctx.data.count = (ctx.data.count ?? 0) + 1;
						},
					},
				},
				{
					name: 'depths',
					heading: { parse: (node, ctx) => void (ctx.data.last = node.depth) },
				},
			],
		}));
		expect(out.data).toEqual({
			titles: { last: 'b', count: 2 },
			depths: { last: 2 },
		});
	});

	it('plugins of one name share it, with the bound handlers of that name', () => {
		const out = left(':::box\n## b\n:::\n', () => ({
			plugins: [
				{ name: 'kit', heading: { parse: (_n, ctx) => void (ctx.data.a = 1) } },
				{
					name: 'kit',
					sequential: true,
					heading: { parse: (_n, ctx) => void (ctx.data.b = ctx.data.a + 1) },
				},
			],
			directive_handlers: [
				{
					name: 'kit',
					directives: {
						box: {
							children: {
								heading: (_n, ctx) => void (ctx.data.c = 3),
							},
						},
					},
				},
			],
		}));
		expect(out.data).toEqual({ kit: { a: 1, b: 2, c: 3 } });
	});

	it('throws for a plugin without a name', () => {
		for (const [name, run] of PATHS) {
			expect(
				() =>
					run('# a\n', [{ heading: { parse: (_n, ctx) => void ctx.data } }]),
				name
			).toThrow('give the plugin a name');
			expect(
				() =>
					run(':::box\n:::\n', {
						directive_handlers: [
							{ box: { parse: (_n, ctx) => void ctx.data } },
						],
					}),
				name
			).toThrow('give the plugin a name');
		}
	});

	it('a plugin that only read it leaves no key', () => {
		const out = left('# a\n', () => ({
			plugins: [
				{ name: 'reads', heading: { parse: (_n, ctx) => void ctx.data.x } },
				{
					name: 'writes',
					heading: { parse: (_n, ctx) => void (ctx.data.x = 1) },
				},
			],
		}));
		expect(out.data).toEqual({ writes: { x: 1 } });
	});

	it('a delete is undone with the node as a write is', () => {
		const out = left('# a\n\n[b]\n', () => ({
			plugins: [
				{
					name: 'p',
					heading: { parse: (_n, ctx) => void (ctx.data.kept = true) },
					link: { parse: (_n, ctx) => void delete ctx.data.kept },
				},
			],
		}));
		expect(out.data).toEqual({ p: { kept: true } });
	});

	it('a write that stays is not undone by an earlier one that goes', () => {
		// the revoked link wrote first, the heading close wrote after it
		const out = left('# a [b]\n', () => ({
			plugins: [
				{
					name: 'p',
					link: { parse: (_n, ctx) => void (ctx.data.who = 'link') },
					heading: {
						parse: (_n, ctx) => () => void (ctx.data.who = 'heading'),
					},
				},
			],
		}));
		expect(out.data).toEqual({ p: { who: 'heading' } });
	});

	it('is what the plugin left, not the proxy it wrote through', () => {
		let proxy: unknown;
		const out = PATHS[0][1]('# a\n', [
			{
				name: 'p',
				heading: {
					parse(_n, ctx) {
						proxy = ctx.data;
						ctx.data.list = [1];
					},
				},
			},
		]);
		const data = out.dispatcher!.data()!;
		expect(data.p).toEqual({ list: [1] });
		expect(data.p).not.toBe(proxy);
	});

	it('each document starts empty and leaves the last one as it was', () => {
		const dispatcher = new PluginDispatcher(
			[
				{
					name: 'p',
					heading: {
						parse: (node, ctx) => () => {
							ctx.data.titles = [...(ctx.data.titles ?? []), node.text_content];
							ctx.warn('seen', node.text_content);
						},
					},
				},
			],
			new SourceTextSource('')
		);
		const text = new SourceTextSource('');
		dispatcher.set_text_source(text);
		const tree = new TreeBuilder(16, dispatcher);
		const parser = new PFMParser(tree);
		const run = (source: string) => {
			text.set_source(source);
			parser.parse(source);
			return { data: dispatcher.data(), warnings: dispatcher.warnings };
		};
		const one = run('# a\n\n# b\n');
		tree.reset();
		const two = run('# c\n');
		tree.reset();
		const three = run('text\n');
		expect(one.data).toEqual({ p: { titles: ['a', 'b'] } });
		expect(one.warnings!.map((w) => w.message)).toEqual(['a', 'b']);
		expect(two.data).toEqual({ p: { titles: ['c'] } });
		expect(two.warnings!.map((w) => w.message)).toEqual(['c']);
		expect(three).toEqual({ data: undefined, warnings: undefined });
	});
});

describe('plugin context: one per plugin', () => {
	it('what a plugin keeps on its context no other plugin sees', () => {
		const { log } = expect_parity_logged('# a\n\n# b\n', (log) => {
			const counter = (tag: string): ParsePlugin => ({
				heading: {
					parse(_node, ctx) {
						ctx.count = (ctx.count ?? 0) + 1;
						log.push(tag + ctx.count + ' ' + Object.keys(ctx).join());
					},
				},
			});
			return [
				counter('a'),
				counter('b'),
				{ ...counter('s'), sequential: true },
			];
		});
		expect(log).toEqual([
			'a1 count',
			'b1 count',
			'a2 count',
			'b2 count',
			's1 count',
			's2 count',
		]);
	});
});

describe('node view: position', () => {
	const source = 'intro\nmore\n\n## b *c*\n\n- item\n';

	it('gives offsets, lines from 1 and columns from 0', () => {
		for (const [name, run] of BATCH) {
			const seen: unknown[] = [];
			run(source, [
				{
					heading: {
						parse(node) {
							seen.push(['open', node.position]);
							return () => seen.push(['close', node.position]);
						},
					},
					strong_emphasis: {
						parse: (node) => () => seen.push(['strong', node.position]),
					},
					list_item: {
						parse: (node) => () => seen.push(['item', node.position?.start]),
					},
				},
			]);
			expect(seen, name).toEqual([
				['open', { start: { offset: 12, line: 4, column: 0 }, end: undefined }],
				[
					'strong',
					{
						start: { offset: 17, line: 4, column: 5 },
						end: { offset: 20, line: 4, column: 8 },
					},
				],
				[
					'close',
					{
						start: { offset: 12, line: 4, column: 0 },
						end: { offset: 20, line: 4, column: 8 },
					},
				],
				['item', { offset: 22, line: 6, column: 0 }],
			]);
		}
	});

	it('a text node reached from its parent has one', () => {
		for (const [name, run] of BATCH) {
			const seen: unknown[] = [];
			run('a\n\nbc *d*\n', [
				{
					strong_emphasis: {
						parse: (node) => () => seen.push(node.first_child!.position),
					},
				},
			]);
			expect(seen, name).toEqual([
				{
					start: { offset: 7, line: 3, column: 4 },
					end: { offset: 8, line: 3, column: 5 },
				},
			]);
		}
	});

	it('is undefined for a node a plugin made', () => {
		for (const [name, run] of BATCH) {
			const seen: unknown[] = [];
			run('# a\n', [
				{
					heading: {
						parse(node) {
							seen.push(node.wrap_inner('link').position);
							seen.push(node.wrap_from('html', { tag: 'section' }).position);
						},
					},
				},
			]);
			expect(seen, name).toEqual([undefined, undefined]);
		}
	});

	it('is undefined over the wire, which carries no offsets', () => {
		for (const [name, run] of WIRE) {
			const seen: unknown[] = [];
			run(source, [
				{ heading: { parse: (node) => () => seen.push(node.position) } },
			]);
			expect(seen, name).toEqual([undefined]);
		}
	});

	it('a sequential plugin reads the positions of the finished tree', () => {
		for (const [name, run] of BATCH) {
			const seen: unknown[] = [];
			run(source, [
				{
					sequential: true,
					heading: { parse: (node) => void seen.push(node.position!.end) },
				},
			]);
			expect(seen, name).toEqual([{ offset: 20, line: 4, column: 8 }]);
		}
	});
});

describe('parse_markdown_svelte: the plugin context', () => {
	const doc = '---\ntitle: t\n---\n\n# a\n\n## b\n';

	it('gives handlers the filename option', () => {
		const seen: unknown[] = [];
		parse_markdown_svelte('# a\n', {
			filename: '/docs/a.svx',
			plugins: [
				{ heading: { parse: (_n, ctx) => void seen.push(ctx.filename) } },
			],
			directive_handlers: [],
		});
		expect(seen).toEqual(['/docs/a.svx']);
	});

	it('parses the frontmatter once, when a handler first reads it', () => {
		const texts: string[] = [];
		const seen: unknown[] = [];
		parse_markdown_svelte(doc, {
			frontmatter(text) {
				texts.push(text);
				return { title: text.trim().slice(7) };
			},
			plugins: [
				{
					frontmatter: { parse: (_n, ctx) => void seen.push(ctx.frontmatter) },
					heading: { parse: (_n, ctx) => void seen.push(ctx.frontmatter) },
				},
			],
		});
		expect(texts).toEqual(['title: t\n']);
		expect(seen).toEqual([undefined, { title: 't' }, { title: 't' }]);
	});

	it('never calls the frontmatter option when no handler reads it', () => {
		let calls = 0;
		parse_markdown_svelte(doc, {
			frontmatter: () => void calls++,
			plugins: [{ heading: { parse() {} } }],
		});
		parse_markdown_svelte(doc, { frontmatter: () => void calls++ });
		expect(calls).toBe(0);
	});

	it('gives undefined for a document with no frontmatter', () => {
		const seen: unknown[] = [];
		parse_markdown_svelte('# a\n', {
			frontmatter: () => ({ never: true }),
			plugins: [
				{ heading: { parse: (_n, ctx) => void seen.push(ctx.frontmatter) } },
			],
		});
		expect(seen).toEqual([undefined]);
	});

	it('returns the warnings and the data the handlers left', () => {
		const toc: ParsePlugin = {
			name: 'toc',
			heading: {
				parse(node, ctx) {
					ctx.data.count = (ctx.data.count ?? 0) + 1;
					if (ctx.data.count === 2)
						ctx.warn('second', 'a second heading', node);
				},
			},
		};
		const seq: ParsePlugin = {
			name: 'seq',
			sequential: true,
			heading: { parse: (_n, ctx) => void (ctx.data.ran = true) },
		};
		const result = parse_markdown_svelte(doc, { plugins: [toc, seq] });
		const warnings: RootPluginWarning[] | undefined = result.warnings;
		const data: RootPluginData | undefined = result.data;
		expect(warnings).toEqual([
			{
				plugin: 'toc',
				code: 'second',
				message: 'a second heading',
				start: 23,
				end: undefined,
			},
		]);
		expect(data).toEqual({ toc: { count: 2 }, seq: { ran: true } });
	});

	it('returns undefined for both when there is nothing', () => {
		const plain = parse_markdown_svelte('# a\n');
		expect(plain.warnings).toBeUndefined();
		expect(plain.data).toBeUndefined();
		const plugged = parse_markdown_svelte('# a\n', {
			plugins: [{ name: 'quiet', heading: { parse() {} } }],
		});
		expect(plugged.warnings).toBeUndefined();
		expect(plugged.data).toBeUndefined();
	});

	it('exports the context types from the package root', () => {
		const table: RootDirectiveTable = { name: 'x', directives: {} };
		const named: NamedDirectiveHandlers = { name: 'x', directives: {} };
		const document: PluginDocument = { filename: 'a' };
		const point: Point = { offset: 0, line: 1, column: 0 };
		const position: Position = { start: point, end: undefined };
		const members: (keyof DocumentContext)[] = [
			'filename',
			'frontmatter',
			'warn',
			'data',
		];
		expect([table, named, document, position, members]).toHaveLength(5);
	});
});
