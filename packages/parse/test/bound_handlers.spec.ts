import { describe, expect, it } from 'vitest';

import { PFMParser, WireEmitter, parse_markdown_svelte } from '../src/main';
import { SourceTextSource, WireTextSource } from '../src/node_view';
import type { NodeView } from '../src/node_view';
import {
	PluginDispatcher,
	has_directive_handlers,
} from '../src/plugin_dispatch';
import type {
	DirectiveContext,
	DirectiveHandlers,
	ParsePlugin,
} from '../src/plugin_types';
import { TreeBuilder } from '../src/tree_builder';
import { kind_to_string } from '../src/utils';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import {
	PATHS,
	expect_linked,
	expect_parity,
	expect_parity_logged,
	shape,
} from './plugin_harness';
import type { PluginSetup } from './plugin_harness';

const NAMED = { attrs: ['name', 'args', 'id', 'i'] };

const bound = (...tables: DirectiveHandlers[]): PluginSetup => ({
	directive_handlers: tables,
});

/** the steps plugin of the design, with no parent check and no closure */
const steps = (): DirectiveHandlers => ({
	steps: {
		children: {
			heading(node, ctx) {
				ctx.state.step?.close();
				ctx.state.step = node.wrap_from('directive_container', {
					name: 'step',
				});
				node.wrap_from('directive_label').close();
			},
		},
	},
});

const step = (title: string, ...rest: unknown[]) => [
	'directive_container name="step"',
	['directive_label', ['heading', 'text:' + title]],
	...rest,
];

const STEPS =
	':::steps[]\n\nintro\n\n## One\n\nfirst\n\n```js\ncode\n```\n\n## Two\n\nsecond\n\n## Three\n\nthird\n:::\n\nafter\n';

describe('bound handlers: the steps rewrite', () => {
	it('each heading written in the container starts a step', () => {
		expect(expect_parity(STEPS, () => bound(steps()), NAMED)).toEqual([
			'root',
			[
				'directive_container name="steps"',
				['paragraph', 'text:intro'],
				step('One', ['paragraph', 'text:first'], 'code_fence'),
				step('Two', ['paragraph', 'text:second']),
				step('Three', ['paragraph', 'text:third']),
			],
			['paragraph', 'text:after'],
		]);
	});

	it('a heading outside the container is left alone', () => {
		expect(
			expect_parity(
				'# Top\n\n:::steps[]\n## One\n:::\n\n## After\n',
				() => bound(steps()),
				NAMED
			)
		).toEqual([
			'root',
			['heading', 'text:Top'],
			['directive_container name="steps"', step('One')],
			['heading', 'text:After'],
		]);
	});

	it('a heading in a nested block quote does not start a step', () => {
		expect(
			expect_parity(
				':::steps[]\n## One\n\n> ## Quoted\n>\n> text\n\n## Two\n:::\n',
				() => bound(steps()),
				NAMED
			)
		).toEqual([
			'root',
			[
				'directive_container name="steps"',
				step('One', [
					'block_quote',
					['heading', 'text:Quoted'],
					['paragraph', 'text:text'],
				]),
				step('Two'),
			],
		]);
	});

	it('a heading in another directive is not a child', () => {
		expect(
			expect_parity(
				'::::steps[]\n## One\n\n:::box[]\n## Boxed\n:::\n\n## Two\n::::\n',
				() => bound(steps()),
				NAMED
			)
		).toEqual([
			'root',
			[
				'directive_container name="steps"',
				step('One', [
					'directive_container name="box"',
					['heading', 'text:Boxed'],
				]),
				step('Two'),
			],
		]);
	});

	it('a container of another name runs nothing', () => {
		expect(
			expect_parity(':::box[]\n## One\n:::\n', () => bound(steps()), NAMED)
		).toEqual([
			'root',
			['directive_container name="box"', ['heading', 'text:One']],
		]);
	});

	it('an unclosed container ends its scope with the input', () => {
		// expect_parity checks the dispatcher is quiet, so no scope is left
		expect(
			expect_parity(
				':::steps[]\n\n## One\n\nfirst\n\n## Two\n\nsecond',
				() => bound(steps()),
				NAMED
			)
		).toEqual([
			'root',
			[
				'directive_container name="steps"',
				step('One', ['paragraph', 'text:first']),
				step('Two', ['paragraph', 'text:second']),
			],
		]);
	});

	it('every step is closed once the container is', () => {
		for (const [name, run] of PATHS) {
			const { nodes } = run(STEPS, bound(steps()));
			let synthetic = 0;
			for (let i = 1; i < nodes.size; i++) {
				if (!nodes.synthetic_at(i)) continue;
				synthetic++;
				expect(nodes.end_at(i), `${name}: wrapper ${i}`).not.toBe(0xffffffff);
			}
			// a step and a label for each heading
			expect(synthetic, name).toBe(6);
		}
	});
});

describe('bound handlers: nesting', () => {
	const NESTED =
		'::::steps[]\n## A\n\n:::steps[]\n## A1\n\n## A2\n:::\n\n## B\n::::\n';

	it('a container of the same name inside gets its own scope and state', () => {
		expect(expect_parity(NESTED, () => bound(steps()), NAMED)).toEqual([
			'root',
			[
				'directive_container name="steps"',
				step('A', ['directive_container name="steps"', step('A1'), step('A2')]),
				step('B'),
			],
		]);
	});

	it('index counts per directive', () => {
		const numbered = (): DirectiveHandlers => ({
			steps: {
				children: {
					heading(node, ctx) {
						node.attrs.i = ctx.index;
					},
				},
			},
		});
		expect(expect_parity(NESTED, () => bound(numbered()), NAMED)).toEqual([
			'root',
			[
				'directive_container name="steps"',
				['heading i=0', 'text:A'],
				[
					'directive_container name="steps"',
					['heading i=0', 'text:A1'],
					['heading i=1', 'text:A2'],
				],
				['heading i=1', 'text:B'],
			],
		]);
	});

	it('ctx.directive is the directive of the scope', () => {
		const { log } = expect_parity_logged(
			'::::steps[](n=outer)\n## A\n\n:::steps[](n=inner)\n## A1\n:::\n\n## B\n::::\n',
			(log) =>
				bound({
					steps: {
						children: {
							heading(node, ctx) {
								log.push('open ' + ctx.directive.attrs.args.n);
								// the text of a heading is there once it closed
								return () =>
									log.push(
										ctx.directive.attrs.args.n + ':' + node.text_content
									);
							},
						},
					},
				}),
			NAMED
		);
		expect(log).toEqual([
			'open outer',
			'outer:A',
			'open inner',
			'inner:A1',
			'open outer',
			'outer:B',
		]);
	});
});

describe('bound handlers: descendants', () => {
	const gallery = (log: string[]): DirectiveHandlers => ({
		gallery: {
			descendants: {
				image(node, ctx) {
					node.attrs.i = ctx.index;
					log.push('gallery ' + ctx.index);
				},
			},
		},
	});

	it('fire at any depth inside the container and nowhere else', () => {
		const { tree, log } = expect_parity_logged(
			'![o](o.png)\n\n:::gallery[]\n![a](a.png)\n\n> ![b](b.png)\n\n- x ![c](c.png)\n:::\n\n![p](p.png)\n',
			(log) => bound(gallery(log)),
			{ attrs: ['i'] }
		);
		expect(log).toEqual(['gallery 0', 'gallery 1', 'gallery 2']);
		expect(tree).toEqual([
			'root',
			['paragraph', ['image', 'text:o']],
			[
				'directive_container',
				['paragraph', ['image i=0', 'text:a']],
				['block_quote', ['paragraph', ['image i=1', 'text:b']]],
				['list', ['list_item', 'text:x ', ['image i=2', 'text:c']]],
			],
			['paragraph', ['image', 'text:p']],
		]);
	});

	it('of an outer scope still fire inside a nested scope', () => {
		const { log } = expect_parity_logged(
			'::::gallery[]\n![a](a.png)\n\n:::steps[]\n## One\n\n![b](b.png)\n:::\n\n![c](c.png)\n::::\n',
			(log) =>
				bound(gallery(log), {
					steps: {
						children: {
							heading: () => void log.push('step'),
							paragraph: () => void log.push('steps paragraph'),
						},
						descendants: {
							image: (_, ctx) => void log.push('steps image ' + ctx.index),
						},
					},
				}),
			NAMED
		);
		expect(log).toEqual([
			'gallery 0',
			'step',
			'steps paragraph',
			'steps image 0',
			'gallery 1',
			'gallery 2',
		]);
	});

	it('children and descendants of one directive count apart', () => {
		const { log } = expect_parity_logged(
			':::box[]\na\n\n> b\n\nc\n:::\n',
			(log) =>
				bound({
					box: {
						children: {
							paragraph: (_, ctx) => void log.push('child ' + ctx.index),
						},
						descendants: {
							paragraph: (_, ctx) => void log.push('descendant ' + ctx.index),
						},
					},
				}),
			NAMED
		);
		expect(log).toEqual([
			'child 0',
			'descendant 0',
			'descendant 1',
			'child 1',
			'descendant 2',
		]);
	});

	it('the label of a container is inside it', () => {
		const { log } = expect_parity_logged(
			':::box[a *b*]\nc\n:::\n',
			(log) =>
				bound({
					box: {
						children: {
							directive_label: () => void log.push('label'),
							strong_emphasis: () => void log.push('child strong'),
						},
						descendants: {
							strong_emphasis: () => void log.push('strong'),
						},
					},
				}),
			NAMED
		);
		expect(log).toEqual(['label', 'strong']);
	});
});

describe('bound handlers: global plugins', () => {
	it('a bound handler runs first and the global one sees its wrapper', () => {
		const { tree, log } = expect_parity_logged(
			'# Top\n\n:::steps[]\n## One\n:::\n',
			(log) => ({
				plugins: [
					{
						heading: {
							parse(node: NodeView) {
								node.attrs.id = node.parent!.type;
								log.push('global open');
								return () => log.push('global close');
							},
						},
					} as ParsePlugin,
				],
				directive_handlers: [
					{
						steps: {
							children: {
								heading(node) {
									node.wrap_from('directive_container', { name: 'step' });
									log.push('bound open');
									return () => log.push('bound close');
								},
							},
						},
					},
				],
			}),
			NAMED
		);
		expect(log).toEqual([
			'global open',
			'global close',
			'bound open',
			'global open',
			'bound close',
			'global close',
		]);
		expect(tree).toEqual([
			'root',
			['heading id="root"', 'text:Top'],
			[
				'directive_container name="steps"',
				[
					'directive_container name="step"',
					['heading id="directive_container"', 'text:One'],
				],
			],
		]);
	});

	it('a later table takes a name whole', () => {
		const { log } = expect_parity_logged(
			':::box[]\n## One\n\ntext\n:::\n',
			(log) =>
				bound(
					{
						box: {
							children: { heading: () => void log.push('first heading') },
							parse: () => void log.push('first parse'),
						},
					},
					{
						box: {
							children: { paragraph: () => void log.push('second paragraph') },
						},
					}
				),
			NAMED
		);
		expect(log).toEqual(['second paragraph']);
	});
});

describe('bound handlers: revokes roll state and index back', () => {
	// each link counts itself in the state, the directive reports the count
	// when it closes, a link with no destination is revoked at its bracket
	const counting = (log: string[], kind = 'link'): DirectiveHandlers => ({
		box: {
			parse(box, ctx) {
				return () => {
					box.attrs.args = { count: String(ctx.state.count ?? 0) };
					log.push('keys ' + Object.keys(ctx.state).join());
				};
			},
			descendants: {
				[kind](node: NodeView, ctx: DirectiveContext) {
					node.attrs.i = ctx.index;
					ctx.state.count = (ctx.state.count ?? 0) + 1;
					ctx.state['seen ' + ctx.index] = true;
					log.push(kind + ' ' + ctx.index);
				},
			},
		},
	});

	it('for an inline node revoked while the directive is open', () => {
		const { tree, log } = expect_parity_logged(
			':::box[]\na [b](u) c [d] e\n\n[f](u)\n:::\n',
			(log) => bound(counting(log)),
			NAMED
		);
		// the revoked link gave its index back, the next one takes it again
		expect(log).toEqual([
			'link 0',
			'link 1',
			'link 1',
			'keys count,seen 0,seen 1',
		]);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="box" args={"count":"2"}',
				['paragraph', 'text:a ', ['link i=0', 'text:b'], 'text: c [d] e'],
				['paragraph', ['link i=1', 'text:f']],
			],
		]);
	});

	it('a key a revoked node added is gone', () => {
		const { log } = expect_parity_logged(
			':::box[]\na [b] c\n:::\n',
			(log) => bound(counting(log)),
			NAMED
		);
		expect(log).toEqual(['link 0', 'keys ']);
	});

	it('for a code span that never closes, a node that opened committed', () => {
		const { tree, log } = expect_parity_logged(
			':::box[]\na `b c\n\n`d`\n:::\n',
			(log) => bound(counting(log, 'code_span')),
			NAMED
		);
		expect(log).toEqual(['code_span 0', 'code_span 0', 'keys count,seen 0']);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="box" args={"count":"1"}',
				['paragraph', 'text:a `b c'],
				['paragraph', 'code_span i=0'],
			],
		]);
	});

	it('for the paragraphs a tight list revokes, first to last', () => {
		// every item paragraph opens pending, the list end revokes them in the
		// order they opened, so the second undo must not bring the first write back
		const { tree, log } = expect_parity_logged(
			':::box[]\n- a\n- b\n- c\n\nd\n:::\n',
			(log) => bound(counting(log, 'paragraph')),
			NAMED
		);
		expect(log).toEqual([
			'paragraph 0',
			'paragraph 1',
			'paragraph 2',
			'paragraph 0',
			'keys count,seen 0',
		]);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="box" args={"count":"1"}',
				[
					'list',
					['list_item', 'text:a'],
					['list_item', 'text:b'],
					['list_item', 'text:c'],
				],
				['paragraph i=0', 'text:d'],
			],
		]);
	});

	it('a loose list commits its paragraphs and what they wrote', () => {
		const { tree } = expect_parity_logged(
			':::box[]\n- a\n\n- b\n:::\n',
			(log) => bound(counting(log, 'paragraph')),
			NAMED
		);
		expect((tree as any)[1][0]).toBe(
			'directive_container name="box" args={"count":"2"}'
		);
	});

	it('a delete from the state comes back', () => {
		const { log } = expect_parity_logged(
			':::box[]\na [b] c\n:::\n',
			(log) =>
				bound({
					box: {
						parse(_, ctx) {
							ctx.state.kept = 'yes';
							return () => log.push(String(ctx.state.kept));
						},
						descendants: {
							link(_, ctx) {
								delete ctx.state.kept;
							},
						},
					},
				}),
			NAMED
		);
		expect(log).toEqual(['yes']);
	});

	it('a write that stays is not undone by an earlier one that goes', () => {
		// the revoked link wrote first, the paragraph close wrote after it
		const { log } = expect_parity_logged(
			':::box[]\na [b] c\n:::\n',
			(log) =>
				bound({
					box: {
						parse(_, ctx) {
							return () => log.push(String(ctx.state.last));
						},
						children: {
							paragraph(_, ctx) {
								return () => {
									ctx.state.last = 'paragraph';
								};
							},
						},
						descendants: {
							link(_, ctx) {
								ctx.state.last = 'link';
								return () => {
									ctx.state.last = 'link closed';
								};
							},
						},
					},
				}),
			NAMED
		);
		expect(log).toEqual(['paragraph']);
	});

	it('an unclosed delimiter is revoked before the close callback of its directive', () => {
		const { tree, log } = expect_parity_logged(
			':::box[]\na *b* c *d\n:::\n\nafter\n',
			(log) => bound(counting(log, 'strong_emphasis')),
			NAMED
		);
		expect(log).toEqual([
			'strong_emphasis 0',
			'strong_emphasis 1',
			'keys count,seen 0',
		]);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="box" args={"count":"1"}',
				[
					'paragraph',
					'text:a ',
					['strong_emphasis i=0', 'text:b'],
					'text: c *d',
				],
			],
			['paragraph', 'text:after'],
		]);
	});

	it('an unclosed tag is revoked after the close callback of its directive', () => {
		const { tree, log } = expect_parity_logged(
			':::box[]\na <b>b</b> c <i>d\n:::\n\nafter\n',
			(log) => bound(counting(log, 'html')),
			NAMED
		);
		expect(log).toEqual(['html 0', 'html 1', 'keys count,seen 0,seen 1']);
		expect((tree as any)[1][0]).toBe(
			'directive_container name="box" args={"count":"2"}'
		);
	});
});

describe("bound handlers: the directive's own parse", () => {
	const own = (log: string[]): DirectiveHandlers => ({
		tabs: {
			parse(tabs, ctx) {
				log.push(
					`open ${tabs.type} ${JSON.stringify(tabs.attrs.args ?? null)} ${ctx.index}`
				);
				expect(ctx.directive).toBe(tabs);
				return () => {
					tabs.attrs.args = {
						...tabs.attrs.args,
						count: String(ctx.state.count ?? 0),
					};
					log.push('close');
				};
			},
			children: {
				heading(_, ctx) {
					ctx.state.count = ctx.index + 1;
				},
			},
		},
	});

	it('reads the args at the open and writes one at the close', () => {
		const { tree, log } = expect_parity_logged(
			':::tabs[](sync=os)\n## A\n\n## B\n:::\n',
			(log) => bound(own(log)),
			NAMED
		);
		expect(log).toEqual(['open directive_container {"sync":"os"} 0', 'close']);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="tabs" args={"sync":"os","count":"2"}',
				['heading', 'text:A'],
				['heading', 'text:B'],
			],
		]);
	});

	it('runs for a leaf directive, whose label gets no bound handlers', () => {
		const { tree, log } = expect_parity_logged(
			'::tabs[a *b*](sync=os)\n',
			(log) =>
				bound({
					tabs: {
						...own(log).tabs,
						children: {
							directive_label: () => void log.push('label'),
						},
						descendants: {
							strong_emphasis: () => void log.push('strong'),
						},
					},
				}),
			NAMED
		);
		expect(log).toEqual(['open directive_leaf {"sync":"os"} 0', 'close']);
		expect(tree).toEqual([
			'root',
			[
				'directive_leaf name="tabs" args={"sync":"os","count":"0"}',
				['directive_label', 'text:a ', ['strong_emphasis', 'text:b']],
			],
		]);
	});

	it('runs for an inline directive, whose args arrive before its close', () => {
		const { tree, log } = expect_parity_logged(
			'x :tabs[y](sync=os) z\n',
			(log) => bound(own(log)),
			NAMED
		);
		expect(log).toEqual(['open directive_inline null 0', 'close']);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:x ',
				[
					'directive_inline name="tabs" args={"sync":"os","count":"0"}',
					'text:y',
				],
				'text: z',
			],
		]);
	});

	it('an inline directive that never closes takes back what its parse wrote', () => {
		// no tree parity, over the wire an unclosed inline directive loses its
		// text with or without plugins
		for (const [name, run] of PATHS) {
			const log: string[] = [];
			const out = run(
				'x :tabs[y z\n',
				bound({
					tabs: {
						parse(tabs, ctx) {
							tabs.attrs.id = 'gone';
							tabs.parent!.attrs.id = 'gone';
							ctx.state.open = true;
							log.push('open');
							return () => log.push('close');
						},
					},
				})
			);
			expect(log, name).toEqual(['open']);
			expect_linked(out.nodes);
			expect(out.dispatcher!.quiet(), name).toBe(true);
			const tree = shape(out.nodes, out.source, 0, NAMED) as unknown[];
			expect((tree[1] as unknown[])[0], name).toBe('paragraph');
			expect(JSON.stringify(tree), name).not.toContain('directive_inline');
		}
	});

	it('runs after the open handlers of the node and closes ahead of them', () => {
		const { log } = expect_parity_logged(
			'::::box[]\n:::tabs[]\n:::\n::::\n',
			(log) => ({
				plugins: [
					{
						directive_container: {
							parse(node: NodeView) {
								log.push('global open ' + (node.attrs.name ?? 'unnamed'));
								return () => log.push('global close ' + node.attrs.name);
							},
						},
					} as ParsePlugin,
				],
				directive_handlers: [
					{
						box: {
							children: {
								directive_container: (node) => {
									log.push('child of box');
									return () => log.push('child of box closed');
								},
							},
						},
						tabs: {
							parse: () => {
								log.push('tabs parse');
								return () => log.push('tabs close');
							},
						},
					},
				],
			}),
			NAMED
		);
		expect(log).toEqual([
			'global open box',
			'child of box',
			'global open tabs',
			'tabs parse',
			'tabs close',
			'child of box closed',
			'global close tabs',
			'global close box',
		]);
	});

	it('can wrap the directive it is called for', () => {
		expect(
			expect_parity(
				'before\n\n:::box[]\ninside\n:::\n\nafter\n',
				() =>
					bound({
						box: {
							parse(box) {
								box.wrap_from('html', { tag: 'section' }).close();
							},
						},
					}),
				{ attrs: ['name', 'tag'] }
			)
		).toEqual([
			'root',
			['paragraph', 'text:before'],
			[
				'html tag="section"',
				['directive_container name="box"', ['paragraph', 'text:inside']],
			],
			['paragraph', 'text:after'],
		]);
	});
});

describe('bound handlers: the builder fast path', () => {
	const SCOPED = 'a\n\n::::box[]\nb\n\n:::box[]\nc\n:::\n\nd\n::::\n\ne\n';

	/** what the dispatcher reports at each paragraph open */
	function watch(wire: boolean): string[] {
		const seen: string[] = [];
		const dispatcher: PluginDispatcher = new PluginDispatcher(
			[
				{
					paragraph: {
						parse() {
							const wants = dispatcher.open_wants;
							const kinds: string[] = [];
							for (let k = 0; k < 36; k++) {
								if (wants[k] !== 0) kinds.push(kind_to_string(k));
							}
							seen.push(
								kinds.join() + (dispatcher.quiet() ? ' quiet' : ' awake')
							);
						},
					},
				},
			],
			wire ? new WireTextSource([]) : new SourceTextSource(SCOPED),
			[
				{
					box: {
						children: { heading() {} },
						descendants: { block_quote() {} },
					},
				},
			]
		);
		if (wire) {
			const emitter = new WireEmitter();
			emitter.set_source(SCOPED);
			const builder = new WireTreeBuilder(128, dispatcher);
			new PFMParser(emitter).parse(SCOPED);
			builder.apply(emitter.flush());
		} else {
			new PFMParser(new TreeBuilder(64, dispatcher)).parse(SCOPED);
		}
		expect(dispatcher.quiet()).toBe(true);
		seen.push(
			[...dispatcher.open_wants].filter((w) => w !== 0).length + ' left'
		);
		return seen;
	}

	it.each([
		['batch', false],
		['wire', true],
	])(
		'%s: the mask follows the open scopes and a scope keeps it awake',
		(_, wire) => {
			expect(watch(wire)).toEqual([
				'paragraph quiet',
				'heading,paragraph,block_quote awake',
				'heading,paragraph,block_quote awake',
				'heading,paragraph,block_quote awake',
				'paragraph quiet',
				'1 left',
			]);
		}
	);

	it('an unhandled kind inside a scope takes the fast path of the batch builder', () => {
		const dispatcher = new PluginDispatcher(
			undefined,
			new SourceTextSource(SCOPED),
			[{ box: { children: { heading() {} } } }]
		);
		let opens = 0;
		const dispatch_open = dispatcher.dispatch_open.bind(dispatcher);
		dispatcher.dispatch_open = (idx, kind, buf) => {
			opens++;
			dispatch_open(idx, kind, buf);
		};
		new PFMParser(new TreeBuilder(64, dispatcher)).parse(
			':::box[]\na *b*\n\n## H\n\n> q\n:::\n\n## after\n'
		);
		// only the heading in the scope reached the dispatcher
		expect(opens).toBe(1);
	});

	it('parse_markdown_svelte takes the tables as an option', () => {
		const tables = [steps()];
		const { nodes, source } = parse_markdown_svelte(STEPS, {
			directive_handlers: tables,
		});
		expect_linked(nodes);
		const tree = shape(nodes, source, 0, NAMED) as unknown[];
		expect((tree[1] as unknown[]).slice(2).map((s: any) => s[0])).toEqual([
			'directive_container name="step"',
			'directive_container name="step"',
			'directive_container name="step"',
		]);
		const again = parse_markdown_svelte(STEPS, { directive_handlers: tables });
		expect(shape(again.nodes, again.source, 0, NAMED)).toEqual(tree);
	});

	it('tables with no handler need no dispatcher', () => {
		expect(has_directive_handlers(undefined)).toBe(false);
		expect(has_directive_handlers([])).toBe(false);
		expect(has_directive_handlers([{ step: {} }])).toBe(false);
		expect(has_directive_handlers([{ step: { static: true } as any }])).toBe(
			false
		);
		expect(has_directive_handlers([steps()])).toBe(true);
	});
});

describe('bound handlers: registration', () => {
	const parse = (tables: DirectiveHandlers[]) =>
		parse_markdown_svelte('x\n', { directive_handlers: tables });

	it('an unknown node type throws', () => {
		expect(() => parse([{ steps: { children: { headings() {} } } }])).toThrow(
			'unknown node type "headings" in the children handlers of directive "steps"'
		);
	});

	it('a text handler throws, neither builder dispatches text', () => {
		expect(() => parse([{ steps: { descendants: { text() {} } } }])).toThrow(
			'the descendants handlers of directive "steps" can not take text nodes'
		);
	});

	it('a handler that is not a function throws', () => {
		expect(() =>
			parse([{ steps: { children: { heading: { parse() {} } as any } } }])
		).toThrow(
			'the children.heading handler of directive "steps" must be a function'
		);
		expect(() => parse([{ steps: { parse: true as any } }])).toThrow(
			'the parse handler of directive "steps" must be a function'
		);
	});
});
