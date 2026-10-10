import { describe, expect, it } from 'vitest';

import { NodeKind, PFMParser, WireEmitter } from '../src/main';
import { SourceTextSource, WireTextSource } from '../src/node_view';
import type { NodeView } from '../src/node_view';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type { ParsePlugin } from '../src/plugin_types';
import { TreeBuilder } from '../src/tree_builder';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import {
	PATHS,
	expect_linked,
	expect_parity,
	expect_parity_logged,
	run_batch,
	run_wire,
	shape,
} from './plugin_harness';

type Parse = (node: NodeView) => (() => void) | void;

const on = (kind: string, parse: Parse): ParsePlugin => ({ [kind]: { parse } });

const sequential = (kind: string, parse: Parse): ParsePlugin => ({
	sequential: true,
	[kind]: { parse },
});

const ATTRS = { attrs: ['id', 'href', 'keep', 'seen'] };
// a closed pending node keeps its undo log, see the it.fails below
const LOGGED = { ...ATTRS, quiet: false };

const wrap: Parse = (node) => {
	node.wrap_inner('link', { id: 'W' });
};
const prepend: Parse = (node) => {
	node.prepend('link', { id: 'P' });
};
const append: Parse = (node) => {
	node.append('link', { id: 'A' });
};

describe('parse plugins: structural methods build one tree on every path', () => {
	const source = 'a *b* c\n\n# d `e`\n';

	it('wrap_inner', () => {
		expect(
			expect_parity(
				source,
				() => [on('paragraph', wrap), on('heading', wrap)],
				ATTRS
			)
		).toEqual([
			'root',
			[
				'paragraph',
				['link id="W"', 'text:a ', ['strong_emphasis', 'text:b'], 'text: c'],
			],
			['heading', ['link id="W"', 'text:d ', 'code_span']],
		]);
	});

	it('prepend', () => {
		expect(
			expect_parity(
				source,
				() => [on('paragraph', prepend), on('heading', prepend)],
				ATTRS
			)
		).toEqual([
			'root',
			[
				'paragraph',
				'link id="P"',
				'text:a ',
				['strong_emphasis', 'text:b'],
				'text: c',
			],
			['heading', 'link id="P"', 'text:d ', 'code_span'],
		]);
	});

	it('append at open comes before the children that follow', () => {
		expect(
			expect_parity(
				source,
				() => [on('paragraph', append), on('heading', append)],
				ATTRS
			)
		).toEqual([
			'root',
			[
				'paragraph',
				'link id="A"',
				'text:a ',
				['strong_emphasis', 'text:b'],
				'text: c',
			],
			['heading', 'link id="A"', 'text:d ', 'code_span'],
		]);
	});

	it('append in a close callback comes last', () => {
		expect(
			expect_parity(
				source,
				() => [on('paragraph', (node) => () => append(node))],
				ATTRS
			)
		).toEqual([
			'root',
			[
				'paragraph',
				'text:a ',
				['strong_emphasis', 'text:b'],
				'text: c',
				'link id="A"',
			],
			['heading', 'text:d ', 'code_span'],
		]);
	});

	it('all three on a pending node that closes', () => {
		const all: Parse = (node) => {
			wrap(node);
			prepend(node);
			append(node);
		};
		expect(
			expect_parity(
				'a *b* c\n\n<div>\n\nx\n\n</div>\n',
				() => [on('strong_emphasis', all), on('html', all)],
				LOGGED
			)
		).toEqual([
			'root',
			[
				'paragraph',
				'text:a ',
				[
					'strong_emphasis',
					'link id="P"',
					['link id="W"', 'text:b'],
					'link id="A"',
				],
				'text: c',
			],
			[
				'html',
				'link id="P"',
				['link id="W"', ['paragraph', 'text:x']],
				'link id="A"',
			],
		]);
	});
});

describe('parse plugins: a revoke undoes the node on every path', () => {
	// the delimiter never closes, the paragraph end revokes it
	const unclosed = 'a *b c\n\nd\n';
	const plain = ['root', ['paragraph', 'text:a *b c'], ['paragraph', 'text:d']];

	it.each([
		['wrap_inner', wrap],
		['prepend', prepend],
		['append', append],
	])('its own %s', (_, parse) => {
		expect(
			expect_parity(unclosed, () => [on('strong_emphasis', parse)], ATTRS)
		).toEqual(plain);
	});

	it('a wrap_inner that later children went into', () => {
		// the text and the code span reach the strong after its handler ran
		expect(
			expect_parity('a *b `c` d\n', () => [on('strong_emphasis', wrap)], ATTRS)
		).toEqual(['root', ['paragraph', 'text:a *b ', 'code_span', 'text: d']]);
	});

	it('an attr it set and a type it changed', () => {
		expect(
			expect_parity(
				unclosed,
				() => [
					on('strong_emphasis', (node) => {
						node.attrs.id = 'gone';
						node.type = 'emphasis';
					}),
				],
				ATTRS
			)
		).toEqual(plain);
	});

	const keep = on('paragraph', (node) => {
		node.attrs.keep = 1;
	});
	const drop_keep = on('strong_emphasis', (node) => {
		delete node.parent!.attrs.keep;
	});

	it('an attr it deleted from another node comes back', () => {
		expect(expect_parity(unclosed, () => [keep, drop_keep], ATTRS)).toEqual([
			'root',
			['paragraph keep=1', 'text:a *b c'],
			['paragraph keep=1', 'text:d'],
		]);
	});

	it('an attr delete stays once the node does', () => {
		expect(expect_parity('a *b* c\n', () => [keep, drop_keep], LOGGED)).toEqual(
			[
				'root',
				['paragraph', 'text:a ', ['strong_emphasis', 'text:b'], 'text: c'],
			]
		);
	});

	it('an attr set then deleted on the node itself', () => {
		const plugin = on('strong_emphasis', (node) => {
			node.attrs.id = 'x';
			delete node.attrs.id;
			node.parent!.attrs.id = 'from-strong';
			delete node.parent!.attrs.id;
			node.parent!.attrs.keep = 2;
		});
		expect(expect_parity(unclosed, () => [keep, plugin], ATTRS)).toEqual([
			'root',
			['paragraph keep=1', 'text:a *b c'],
			['paragraph keep=1', 'text:d'],
		]);
	});

	it('what its handler did to another node', () => {
		expect(
			expect_parity(
				unclosed,
				() => [
					on('strong_emphasis', (node) => {
						const parent = node.parent!;
						parent.attrs.id = 'gone';
						parent.wrap_inner('link', { id: 'W' });
						parent.prepend('link', { id: 'P' });
					}),
				],
				ATTRS
			)
		).toEqual(plain);
	});

	it('a pending html block that never closes', () => {
		const all: Parse = (node) => {
			node.attrs.id = 'gone';
			wrap(node);
			prepend(node);
			append(node);
		};
		const { tree, log } = expect_parity_logged(
			'<div>\n\nx *y* z\n',
			(log) => [
				on('html', (node) => {
					all(node);
					return () => log.push('close');
				}),
			],
			ATTRS
		);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:<div>'],
			['paragraph', 'text:x ', ['strong_emphasis', 'text:y'], 'text: z'],
		]);
		// the block was revoked before it closed
		expect(log).toEqual([]);
	});

	it('nested delimiters that both stay open', () => {
		expect(
			expect_parity(
				'a _b *c d\n',
				() => [on('emphasis', wrap), on('strong_emphasis', prepend)],
				ATTRS
			)
		).toEqual(['root', ['paragraph', 'text:a _b *c d']]);
	});
});

describe('parse plugins: close callbacks and revokes', () => {
	const logging = (log: string[]) => [
		on('strong_emphasis', (node) => {
			log.push('open');
			return () => {
				log.push('close');
				node.attrs.seen = 1;
				node.parent!.attrs.seen = 1;
			};
		}),
		on('link', () => {
			log.push('link open');
			return () => log.push('link close');
		}),
	];

	it('a node that closes fires its callback once', () => {
		const { tree, log } = expect_parity_logged('a *b* c\n', logging, LOGGED);
		expect(log).toEqual(['open', 'close']);
		expect(tree).toEqual([
			'root',
			[
				'paragraph seen=1',
				'text:a ',
				['strong_emphasis seen=1', 'text:b'],
				'text: c',
			],
		]);
	});

	it('a revoke before the close discards the callback', () => {
		// a table cell revokes an open delimiter at its pipe
		const cell = expect_parity_logged(
			'| a *b | c |\n| - | - |\n',
			logging,
			ATTRS
		);
		expect(cell.log).toEqual(['open']);
		expect(JSON.stringify(cell.tree)).not.toContain('seen');

		// a link with no destination is revoked while still open
		const link = expect_parity_logged('[a b\n', logging, ATTRS);
		expect(link.log).toEqual(['link open']);
		expect(link.tree).toEqual(['root', ['paragraph', 'text:[a b']]);
	});

	it('a revoke after the close undoes what the callback wrote', () => {
		// the parser closes an unclosed delimiter at the paragraph end, then revokes it
		const { tree, log } = expect_parity_logged('a *b c\n', logging, ATTRS);
		expect(log).toEqual(['open', 'close']);
		expect(tree).toEqual(['root', ['paragraph', 'text:a *b c']]);
	});

	it('a structural change made in a callback is undone too', () => {
		expect(
			expect_parity(
				'a *b c\n',
				() => [
					on('strong_emphasis', (node) => () => {
						node.wrap_inner('link');
						node.append('link');
						node.parent!.prepend('link');
					}),
				],
				ATTRS
			)
		).toEqual(['root', ['paragraph', 'text:a *b c']]);
	});
});

describe('parse plugins: tight and loose list paragraphs', () => {
	// every item paragraph opens pending and closes, the list end revokes
	// them when tight and commits them when loose
	const paragraphs = (log: string[]) => [
		on('paragraph', (node) => {
			log.push('open');
			node.attrs.id = 'p';
			const link = node.wrap_inner('link');
			return () => {
				log.push('close');
				link.attrs.href = '#' + node.text_content;
				node.append('emphasis');
			};
		}),
	];

	it('a tight list revokes them and what the plugin did', () => {
		const { tree, log } = expect_parity_logged('- a\n- b\n', paragraphs, ATTRS);
		expect(tree).toEqual([
			'root',
			['list', ['list_item', 'text:a'], ['list_item', 'text:b']],
		]);
		expect(log).toEqual(['open', 'close', 'open', 'close']);
	});

	it('a loose list commits them and what the plugin did', () => {
		const { tree, log } = expect_parity_logged(
			'- a\n\n- b\n',
			paragraphs,
			ATTRS
		);
		const item = (text: string) => [
			'list_item',
			[
				'paragraph id="p"',
				['link href="#' + text + '"', 'text:' + text],
				'emphasis',
			],
		];
		expect(tree).toEqual(['root', ['list', item('a'), item('b')]]);
		expect(log).toEqual(['open', 'close', 'open', 'close']);
	});

	it('a tight list nested in a tight list', () => {
		const { tree } = expect_parity_logged(
			'- a\n  - b\n- c\n',
			paragraphs,
			ATTRS
		);
		expect(tree).toEqual([
			'root',
			[
				'list',
				['list_item', 'text:a', ['list', ['list_item', 'text:b']]],
				['list_item', 'text:c'],
			],
		]);
	});

	it('a tight list nested in a loose one', () => {
		const { tree } = expect_parity_logged(
			'- a\n\n  - b\n  - c\n\n- d\n',
			paragraphs,
			ATTRS
		);
		const loose = (text: string, ...rest: unknown[]) => [
			'list_item',
			[
				'paragraph id="p"',
				['link href="#' + text + '"', 'text:' + text],
				'emphasis',
			],
			...rest,
		];
		expect(tree).toEqual([
			'root',
			[
				'list',
				loose('a', ['list', ['list_item', 'text:b'], ['list_item', 'text:c']]),
				loose('d'),
			],
		]);
	});
});

describe('parse plugins: a revoked parent leaves a child that stays alone', () => {
	const mark = (log: string[]) => (node: NodeView) => {
		node.attrs.id = 'kept';
		node.wrap_inner('link', { id: 'W' });
		return () => {
			log.push('close');
			node.attrs.seen = 1;
		};
	};

	const kept = (kind: string, text: string) => [
		kind + ' id="kept" seen=1',
		['link id="W"', 'text:' + text],
	];

	it('a closed strong in an unclosed emphasis', () => {
		const { tree, log } = expect_parity_logged(
			'_x *b* y\n',
			(log) => [on('strong_emphasis', mark(log))],
			LOGGED
		);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:_x ', kept('strong_emphasis', 'b'), 'text: y'],
		]);
		expect(log).toEqual(['close']);
	});

	it('a closed strong in a link with no destination', () => {
		const { tree } = expect_parity_logged(
			'[a *b* c\n',
			(log) => [on('strong_emphasis', mark(log))],
			LOGGED
		);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:[a ', kept('strong_emphasis', 'b'), 'text: c'],
		]);
	});

	it('a closed strong in a heading in an unclosed html block', () => {
		const { tree } = expect_parity_logged(
			'<div>\n\n# h *a* b\n',
			(log) => [on('strong_emphasis', mark(log))],
			LOGGED
		);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:<div>'],
			['heading', 'text:h ', kept('strong_emphasis', 'a'), 'text: b'],
		]);
	});

	it('an inline html element in an unclosed strong', () => {
		const { tree, log } = expect_parity_logged(
			'*a <span>b</span> c\n',
			(log) => [on('html', mark(log))],
			LOGGED
		);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:*a ', kept('html', 'b'), 'text: c'],
		]);
		expect(log).toEqual(['close']);
	});

	it('a child revoked after its parent is still undone', () => {
		expect(
			expect_parity(
				'a _b *c d\n',
				() => [on('strong_emphasis', mark([])), on('emphasis', mark([]))],
				ATTRS
			)
		).toEqual(['root', ['paragraph', 'text:a _b *c d']]);
	});
});

describe('parse plugins: wrap_inner in a close callback', () => {
	const wrap_parent = (kind: string) =>
		on(kind, (node) => () => {
			node.parent!.wrap_inner('link', { id: 'W' });
		});

	it('later children of a parent still open go into the wrapper', () => {
		expect(
			expect_parity('a `b` c\n', () => [wrap_parent('code_span')], ATTRS)
		).toEqual([
			'root',
			['paragraph', ['link id="W"', 'text:a ', 'code_span', 'text: c']],
		]);
		expect(
			expect_parity('# a `b` c\n', () => [wrap_parent('code_span')], ATTRS)
		).toEqual([
			'root',
			['heading', ['link id="W"', 'text:a ', 'code_span', 'text: c']],
		]);
	});

	it('from a pending node that stays', () => {
		expect(
			expect_parity('a *b* c\n', () => [wrap_parent('strong_emphasis')], LOGGED)
		).toEqual([
			'root',
			[
				'paragraph',
				['link id="W"', 'text:a ', ['strong_emphasis', 'text:b'], 'text: c'],
			],
		]);
	});

	it('from a pending node revoked after its close', () => {
		expect(
			expect_parity(
				'a *b c\n\nd\n',
				() => [wrap_parent('strong_emphasis')],
				ATTRS
			)
		).toEqual(['root', ['paragraph', 'text:a *b c'], ['paragraph', 'text:d']]);
	});

	it('two children each wrap the parent, the later one outside', () => {
		// as for two wraps at open, children go to the innermost wrapper
		expect(
			expect_parity('a `b` c `d` e\n', () => [wrap_parent('code_span')], ATTRS)
		).toEqual([
			'root',
			[
				'paragraph',
				[
					'link id="W"',
					[
						'link id="W"',
						'text:a ',
						'code_span',
						'text: c ',
						'code_span',
						'text: e',
					],
				],
			],
		]);
	});

	it('on the closing node itself leaves no redirect', () => {
		// expect_parity checks every dispatcher ends quiet
		expect(
			expect_parity(
				'# a `b` c\n\nd\n',
				() => [
					on('heading', (node) => {
						const outer = node.wrap_inner('link', { id: 'W' });
						return () => {
							outer.wrap_inner('emphasis');
							node.wrap_inner('subscript');
						};
					}),
				],
				ATTRS
			)
		).toEqual([
			'root',
			[
				'heading',
				[
					'subscript',
					['link id="W"', ['emphasis', 'text:a ', 'code_span', 'text: c']],
				],
			],
			['paragraph', 'text:d'],
		]);
	});
});

describe('parse plugins: a sequential pass that changes structure', () => {
	const source = '# a *b* c\n\npara `x`\n\n- i\n- j\n';

	it('wrap_inner', () => {
		expect(
			expect_parity(
				source,
				() => [
					sequential('heading', wrap),
					sequential('paragraph', wrap),
					sequential('list_item', (node) => {
						node.wrap_inner('emphasis');
					}),
				],
				ATTRS
			)
		).toEqual([
			'root',
			[
				'heading',
				['link id="W"', 'text:a ', ['strong_emphasis', 'text:b'], 'text: c'],
			],
			['paragraph', ['link id="W"', 'text:para ', 'code_span']],
			[
				'list',
				['list_item', ['emphasis', 'text:i']],
				['list_item', ['emphasis', 'text:j']],
			],
		]);
	});

	it('prepend and append', () => {
		expect(
			expect_parity(
				source,
				() => [
					sequential('heading', (node) => {
						prepend(node);
						append(node);
					}),
					sequential('list', (node) => {
						node.append('list_item', { id: 'last' });
						node.prepend('list_item', { id: 'first' });
					}),
				],
				ATTRS
			)
		).toEqual([
			'root',
			[
				'heading',
				'link id="P"',
				'text:a ',
				['strong_emphasis', 'text:b'],
				'text: c',
				'link id="A"',
			],
			['paragraph', 'text:para ', 'code_span'],
			[
				'list',
				'list_item id="first"',
				['list_item', 'text:i'],
				['list_item', 'text:j'],
				'list_item id="last"',
			],
		]);
	});

	it('a type change, later handlers of the pass see the new type', () => {
		const { tree, log } = expect_parity_logged(
			source,
			(log) => [
				{
					sequential: true,
					heading: {
						parse(node) {
							node.type = 'paragraph';
							return () => {
								node.attrs.seen = node.text_content;
							};
						},
					},
					strong_emphasis: {
						parse(node) {
							log.push('strong in ' + node.parent!.type);
						},
					},
				},
			],
			ATTRS
		);
		expect(tree).toEqual([
			'root',
			[
				'paragraph seen="a b c"',
				'text:a ',
				['strong_emphasis', 'text:b'],
				'text: c',
			],
			['paragraph', 'text:para ', 'code_span'],
			['list', ['list_item', 'text:i'], ['list_item', 'text:j']],
		]);
		expect(log).toEqual(['strong in paragraph']);
	});

	it('wraps what a fused plugin wrapped and visits the nodes it adds', () => {
		const { tree, log } = expect_parity_logged(
			'# a\n\n# b\n',
			(log) => [
				on('heading', wrap),
				sequential('heading', (node) => {
					log.push('heading');
					node.wrap_inner('emphasis');
					return () => {
						node.append('link', { id: 'A' });
					};
				}),
				sequential('link', (node) => {
					log.push('link ' + node.attrs.id);
				}),
			],
			ATTRS
		);
		const heading = (text: string) => [
			'heading',
			['emphasis', ['link id="W"', 'text:' + text]],
			'link id="A"',
		];
		expect(tree).toEqual(['root', heading('a'), heading('b')]);
		// each pass walks the whole tree, so the link pass sees both links
		expect(log).toEqual([
			'heading',
			'heading',
			'link W',
			'link A',
			'link W',
			'link A',
		]);
	});
});

describe('parse plugins: undo logs of closed pending nodes', () => {
	// the parser sends no commit for a pending node it closes, so its log stays
	it.fails.each(PATHS)(
		'%s: a delimiter that closed leaves the dispatcher quiet',
		(_, run) => {
			const out = run('a *b* c\n\nd\n', [on('strong_emphasis', wrap)]);
			expect(shape(out.nodes, out.source)).toEqual([
				'root',
				[
					'paragraph',
					'text:a ',
					['strong_emphasis', ['link', 'text:b']],
					'text: c',
				],
				['paragraph', 'text:d'],
			]);
			expect(out.dispatcher!.quiet()).toBe(true);
		}
	);
});

describe('parse plugins: a builder reset for the next document', () => {
	const documents = [
		'# One *a* b\n\ntext *open\n',
		'plain `code`\n',
		'- tight\n- list\n\n## Two\n',
		'<div>\n\n# Inside\n\nnever closed *x*\n',
		'_open *closed* rest\n\n| a *b | c |\n| - | - |\n',
		'',
		'# Last\n',
	];

	/** a wrap_inner, a close callback, attrs on another node and a sequential pass */
	const plugins = (): ParsePlugin[] => [
		{
			heading: {
				parse(node, ctx: { headings?: number }) {
					ctx.headings = (ctx.headings ?? 0) + 1;
					const count = ctx.headings;
					const link = node.wrap_inner('link');
					return () => {
						node.attrs.id = 'h' + count;
						link.attrs.href = '#' + node.text_content;
					};
				},
			},
			strong_emphasis: {
				parse(node) {
					node.attrs.id = 'strong';
					node.parent!.attrs.keep = 1;
					node.prepend('emphasis');
				},
			},
		},
		sequential('paragraph', (node) => {
			node.attrs.seen = 1;
		}),
	];

	const OPTS = { ...ATTRS, merge_text: true };

	it('a batch builder matches a fresh one on every document', () => {
		const text = new SourceTextSource('');
		const dispatcher = new PluginDispatcher(plugins(), text);
		const tree = new TreeBuilder(16, dispatcher);
		const parser = new PFMParser(tree);
		for (let pass = 0; pass < 3; pass++) {
			for (const source of documents) {
				tree.reset();
				text.set_source(source);
				parser.parse(source);
				const nodes = tree.get_buffer();
				dispatcher.run_sequential(nodes);
				expect_linked(nodes);
				const fresh = run_batch(source, plugins());
				expect(shape(nodes, source, 0, OPTS)).toEqual(
					shape(fresh.nodes, source, 0, OPTS)
				);
			}
		}
	});

	it('a wire builder matches a fresh one on every document', () => {
		const dispatcher = new PluginDispatcher(plugins(), new WireTextSource([]));
		const builder = new WireTreeBuilder(128, dispatcher);
		for (let pass = 0; pass < 3; pass++) {
			for (const source of documents) {
				builder.reset();
				const emitter = new WireEmitter();
				const parser = new PFMParser(emitter);
				parser.init();
				for (let i = 0; i < source.length; i += 3) {
					emitter.set_source(source.slice(0, i + 3));
					parser.feed(source.slice(i, i + 3));
					builder.apply(emitter.flush());
				}
				emitter.set_source(source);
				parser.finish();
				builder.apply(emitter.flush());
				const nodes = builder.get_buffer();
				dispatcher.run_sequential(nodes);
				expect_linked(nodes);
				const fresh = run_wire(source, plugins(), 3);
				expect(shape(nodes, null, 0, OPTS)).toEqual(
					shape(fresh.nodes, null, 0, OPTS)
				);
			}
		}
	});

	it('restores the kinds that need the dispatcher', () => {
		const source = '# a\n';
		const text = new SourceTextSource(source);
		const dispatcher = new PluginDispatcher([on('heading', wrap)], text);
		const tree = new TreeBuilder(16, dispatcher);
		const handled = dispatcher.open_wants;
		expect(Array.from(handled).filter((w) => w === 1)).toHaveLength(1);

		for (let i = 0; i < 3; i++) {
			new PFMParser(tree).parse(source);
			// the redirect of the wrap sent every open through the dispatcher
			expect(dispatcher.open_wants).not.toBe(handled);
			expect(dispatcher.open_wants.every((w) => w === 1)).toBe(true);
			tree.reset();
			expect(dispatcher.open_wants).toBe(handled);
			expect(dispatcher.quiet()).toBe(true);
			expect(dispatcher.wants_open(NodeKind.paragraph)).toBe(false);
		}
	});

	it('forgets the kinds a revoke rewrote', () => {
		const dispatcher = new PluginDispatcher(
			[on('link', () => {})],
			new SourceTextSource('*a\n\n# abc')
		);
		const tree = new TreeBuilder(16, dispatcher);
		// a strong at index 2 is revoked, its kind at open stays on record
		tree.open(1, NodeKind.paragraph, 0, 0, 0, false);
		tree.open(2, NodeKind.strong_emphasis, 0, 1, 0, true);
		tree.revoke(2);
		tree.text(2, 1, 2);
		expect(tree.get_buffer().get_node(2).kind).toBe('text');

		tree.reset();
		// a heading takes index 2, a text without a kind must read it as one
		tree.open(1, NodeKind.paragraph, 0, 0, 0, false);
		tree.open(2, NodeKind.heading, 4, 0, 1, false);
		tree.text(2, 6, 9);
		const nodes = tree.get_buffer();
		expect(nodes.get_node(2).kind).toBe('heading');
		expect(nodes.get_node(2).value).toEqual([6, 9]);
		expect(nodes.get_node(2).children).toEqual([]);
	});

	it('gives the next document a fresh context', () => {
		const seen: unknown[] = [];
		const text = new SourceTextSource('# a\n');
		const dispatcher = new PluginDispatcher(
			[
				on('heading', (_node, ctx: { first?: boolean }) => {
					seen.push(ctx.first);
					ctx.first = false;
				}),
			],
			text
		);
		const tree = new TreeBuilder(16, dispatcher);
		new PFMParser(tree).parse('# a\n\n# b\n');
		tree.reset();
		new PFMParser(tree).parse('# a\n');
		expect(seen).toEqual([undefined, false, undefined]);
	});

	it('is usable after a handler threw mid document', () => {
		const source = 'a *b* c\n\n# d\n';
		const make = (armed: { on: boolean }): ParsePlugin[] => [
			on('paragraph', wrap),
			on('strong_emphasis', (node) => {
				node.parent!.wrap_inner('emphasis');
				node.attrs.id = 'strong';
				if (armed.on) throw new Error('handler');
				return () => {
					node.attrs.seen = 1;
				};
			}),
		];
		const armed = { on: true };
		const text = new SourceTextSource(source);
		const dispatcher = new PluginDispatcher(make(armed), text);
		const tree = new TreeBuilder(16, dispatcher);
		expect(() => new PFMParser(tree).parse(source)).toThrow('handler');

		armed.on = false;
		tree.reset();
		new PFMParser(tree).parse(source);
		const fresh = run_batch(source, make(armed));
		expect(shape(tree.get_buffer(), source, 0, OPTS)).toEqual(
			shape(fresh.nodes, source, 0, OPTS)
		);
		expect_linked(tree.get_buffer());
	});

	const stale = /NodeView was used after its document/;

	it('a view kept from the last document throws, batch', () => {
		const kept: NodeView[] = [];
		const text = new SourceTextSource('# first\n');
		const dispatcher = new PluginDispatcher(
			[
				on('heading', (node) => {
					kept.push(node);
				}),
			],
			text
		);
		const tree = new TreeBuilder(16, dispatcher);
		new PFMParser(tree).parse('# first\n');
		const view = kept[0];
		const attrs = view.attrs;
		// its own document is still in the buffer
		expect(view.text_content).toBe('first');
		expect(view.parent!.type).toBe('root');

		tree.reset();
		text.set_source('para\n\n# second\n');
		new PFMParser(tree).parse('para\n\n# second\n');

		expect(() => view.type).toThrow(stale);
		expect(() => view.text_content).toThrow(stale);
		expect(() => view.parent).toThrow(stale);
		expect(() => view.first_child).toThrow(stale);
		expect(() => view.last_child).toThrow(stale);
		expect(() => view.next).toThrow(stale);
		expect(() => view.prev).toThrow(stale);
		expect(() => view.depth).toThrow(stale);
		expect(() => view.lang).toThrow(stale);
		expect(() => view.href).toThrow(stale);
		expect(() => view.title).toThrow(stale);
		expect(() => view.ordered).toThrow(stale);
		expect(() => view.start).toThrow(stale);
		expect(() => view.tight).toThrow(stale);
		expect(() => view.attrs).not.toThrow();
		expect(() => attrs.id).toThrow(stale);
		expect(() => (attrs.id = 'late')).toThrow(stale);
		expect(() => delete attrs.id).toThrow(stale);
		expect(() => 'id' in attrs).toThrow(stale);
		expect(() => Object.keys(attrs)).toThrow(stale);
		expect(() => (view.type = 'paragraph')).toThrow(stale);
		expect(() => view.wrap_inner('link')).toThrow(stale);
		expect(() => view.prepend('link')).toThrow(stale);
		expect(() => view.append('link')).toThrow(stale);

		const nodes = tree.get_buffer();
		expect(shape(nodes, 'para\n\n# second\n', 0, OPTS)).toEqual([
			'root',
			['paragraph', 'text:para'],
			['heading', 'text:second'],
		]);
		expect(kept[1].text_content).toBe('second');
	});

	it('a view kept from the last document throws, wire', () => {
		const kept: NodeView[] = [];
		const dispatcher = new PluginDispatcher(
			[
				on('heading', (node) => {
					kept.push(node);
				}),
			],
			new WireTextSource([])
		);
		const builder = new WireTreeBuilder(128, dispatcher);
		const feed = (source: string) => {
			const emitter = new WireEmitter();
			emitter.set_source(source);
			new PFMParser(emitter).parse(source);
			builder.apply(emitter.flush());
		};
		feed('# first\n');
		expect(kept[0].text_content).toBe('first');
		builder.reset();
		expect(() => kept[0].text_content).toThrow(stale);
		feed('# second\n');
		expect(() => kept[0].type).toThrow(stale);
		expect(kept[1].text_content).toBe('second');
	});
});
