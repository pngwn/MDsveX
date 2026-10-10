import { describe, expect, it } from 'vitest';

import { NodeKind, PFMParser } from '../src/main';
import { SourceTextSource, WireTextSource } from '../src/node_view';
import type { NodeView, WrapperView } from '../src/node_view';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type { ParsePlugin } from '../src/plugin_types';
import { TreeBuilder } from '../src/tree_builder';
import type { NodeBuffer } from '../src/utils';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import {
	PATHS,
	expect_linked,
	expect_parity,
	expect_parity_logged,
	run_batch,
	shape,
} from './plugin_harness';

const NONE = 0xffffffff;

type Parse = (node: NodeView) => (() => void) | void;

const on = (kind: string, parse: Parse): ParsePlugin => ({ [kind]: { parse } });

const NAMED = { attrs: ['name', 'tag'] };

/** the steps plugin of the design as a global heading handler that checks its parent */
function steps(): ParsePlugin {
	const open = new Map<number, WrapperView>();
	return on('heading', (node) => {
		const parent = node.parent;
		if (
			parent === null ||
			parent.type !== 'directive_container' ||
			parent.attrs.name !== 'steps'
		)
			return;
		open.get(parent._index)?.close();
		open.set(
			parent._index,
			node.wrap_from('directive_container', { name: 'step' })
		);
		node.wrap_from('directive_label').close();
	});
}

/** each root heading and what follows it in a section, flat or nested by depth */
function sectionize(nested = false): ParsePlugin {
	const open: { depth: number; view: WrapperView }[] = [];
	return on('heading', (node) => {
		if (node.parent?.type !== 'root') return;
		const depth = node.depth!;
		if (nested) {
			// closing the outermost of them closes the ones inside it
			let outer: WrapperView | null = null;
			while (open.length > 0 && open[open.length - 1].depth >= depth) {
				outer = open.pop()!.view;
			}
			outer?.close();
		} else {
			open.pop()?.view.close();
		}
		open.push({ depth, view: node.wrap_from('html', { tag: 'section' }) });
	});
}

/** sectionize with no parent check, so it also runs inside an html block or a quote */
function sections_anywhere(): ParsePlugin {
	const open = new Map<number, WrapperView>();
	return on('heading', (node) => {
		const parent = node.parent!._index;
		open.get(parent)?.close();
		open.set(parent, node.wrap_from('html', { tag: 'section' }));
	});
}

const STEPS =
	':::steps[]\n\nintro\n\n## One\n\nfirst\n\n```js\ncode\n```\n\n## Two\n\nsecond\n\n## Three\n\nthird\n:::\n\nafter\n';

describe('wrap_from: the steps shape', () => {
	it('three headings become three sibling step wrappers, each led by a label', () => {
		expect(expect_parity(STEPS, () => [steps()], NAMED)).toEqual([
			'root',
			[
				'directive_container name="steps"',
				// content before the first heading stays a direct child
				['paragraph', 'text:intro'],
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:One']],
					['paragraph', 'text:first'],
					'code_fence',
				],
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:Two']],
					['paragraph', 'text:second'],
				],
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:Three']],
					['paragraph', 'text:third'],
				],
			],
			// the last wrapper closed with the container
			['paragraph', 'text:after'],
		]);
	});

	it('every wrapper is synthetic and has an end once the container closed', () => {
		for (const [name, run] of PATHS) {
			const { nodes } = run(STEPS, [steps()]);
			let wrappers = 0;
			for (let i = 1; i < nodes.size; i++) {
				if (nodes.parent_at(i) === NONE) continue;
				const kind = nodes.kind_at(i);
				const made =
					kind === NodeKind.directive_label ||
					nodes.metadata_at(i)?.name === 'step';
				expect(nodes.synthetic_at(i), `${name} node ${i}`).toBe(made);
				if (!made) continue;
				wrappers++;
				expect(nodes.end_at(i), `${name} wrapper ${i}`).toBe(nodes.start_at(i));
				expect(nodes.pending_at(i), `${name} wrapper ${i}`).toBe(0);
			}
			expect(wrappers, name).toBe(6);
		}
	});

	it('a heading in a nested blockquote starts no step', () => {
		const source =
			':::steps[]\n\n## One\n\n> ## Quoted\n>\n> inside\n\nmore\n\n## Two\n\nsecond\n:::\n';
		expect(expect_parity(source, () => [steps()], NAMED)).toEqual([
			'root',
			[
				'directive_container name="steps"',
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:One']],
					[
						'block_quote',
						['heading', 'text:Quoted'],
						['paragraph', 'text:inside'],
					],
					['paragraph', 'text:more'],
				],
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:Two']],
					['paragraph', 'text:second'],
				],
			],
		]);
	});

	it('nested steps each get their own wrappers', () => {
		const source =
			'::::steps[]\n\n## One\n\n:::steps[]\n\n### Inner a\n\nia\n\n### Inner b\n\nib\n:::\n\ntail\n\n## Two\n\nsecond\n::::\n';
		expect(expect_parity(source, () => [steps()], NAMED)).toEqual([
			'root',
			[
				'directive_container name="steps"',
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:One']],
					[
						'directive_container name="steps"',
						[
							'directive_container name="step"',
							['directive_label', ['heading', 'text:Inner a']],
							['paragraph', 'text:ia'],
						],
						[
							'directive_container name="step"',
							['directive_label', ['heading', 'text:Inner b']],
							['paragraph', 'text:ib'],
						],
					],
					['paragraph', 'text:tail'],
				],
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:Two']],
					['paragraph', 'text:second'],
				],
			],
		]);
	});

	it('an unclosed container closes its last wrapper at the end of input', () => {
		const source = ':::steps[]\n\n## One\n\nfirst\n\n## Two\n\nsecond\n';
		expect(expect_parity(source, () => [steps()], NAMED)).toEqual([
			'root',
			[
				'directive_container name="steps"',
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:One']],
					['paragraph', 'text:first'],
				],
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:Two']],
					['paragraph', 'text:second'],
				],
			],
		]);
	});
});

describe('wrap_from: what a handler sees', () => {
	const spy = (log: string[]): ParsePlugin => {
		const name = (view: NodeView | null) =>
			view === null ? '-' : `${view.type}:${view.attrs.name ?? ''}`;
		return {
			heading: {
				parse(node) {
					log.push(`h ${name(node.parent)} prev=${name(node.prev)}`);
					return () => {
						log.push(`h close ${name(node.parent)}`);
					};
				},
			},
			paragraph: {
				parse(node) {
					log.push(`p ${name(node.parent)}`);
					return () => {
						log.push(`p close ${name(node.parent)}`);
					};
				},
			},
		};
	};

	it('node.parent is the source parent at open and the tree parent at close', () => {
		const { log } = expect_parity_logged(
			':::steps[]\n## One\nfirst\n\n## Two\nsecond\n:::\n',
			// the spy runs before the steps handler
			(log) => [spy(log), steps()],
			NAMED
		);
		expect(log).toEqual([
			'h directive_container:steps prev=-',
			'h close directive_label:',
			// the paragraph opens under steps and moves into the open step
			'p directive_container:steps',
			'p close directive_container:step',
			// the previous sibling in the tree is the open wrapper, not the paragraph
			'h directive_container:steps prev=directive_container:step',
			'h close directive_label:',
			'p directive_container:steps',
			'p close directive_container:step',
		]);
	});

	it('a child of a wrap_inner parent sees that parent at open, the wrapper at close', () => {
		const { log, tree } = expect_parity_logged(
			'> one\n>\n> two\n',
			(log) => [
				on('block_quote', (node) => {
					node.wrap_inner('html', { tag: 'div' });
				}),
				on('paragraph', (node) => {
					log.push(`open ${node.parent!.type}`);
					return () => {
						log.push(`close ${node.parent!.type}`);
					};
				}),
			],
			NAMED
		);
		expect(log).toEqual([
			'open block_quote',
			'close html',
			'open block_quote',
			'close html',
		]);
		expect(tree).toEqual([
			'root',
			[
				'block_quote',
				[
					'html tag="div"',
					['paragraph', 'text:one'],
					['paragraph', 'text:two'],
				],
			],
		]);
	});
});

describe('wrap_from: root level', () => {
	const source = 'intro\n\n## A\n\na1\n\na2\n\n## B\n\nb1\n';

	it('flat sections', () => {
		expect(expect_parity(source, () => [sectionize()], NAMED)).toEqual([
			'root',
			['paragraph', 'text:intro'],
			[
				'html tag="section"',
				['heading', 'text:A'],
				['paragraph', 'text:a1'],
				['paragraph', 'text:a2'],
			],
			['html tag="section"', ['heading', 'text:B'], ['paragraph', 'text:b1']],
		]);
	});

	it('every root section has an end once the document is done', () => {
		for (const [name, run] of PATHS) {
			const { nodes } = run(source, [sectionize()]);
			for (const child of nodes.get_node(0).children) {
				if (nodes.kind_at(child) === NodeKind.line_break) continue;
				expect(nodes.end_at(child), `${name} block ${child}`).not.toBe(NONE);
			}
		}
	});

	it('a wrapper opened inside an open wrapper nests, closing the outer closes the inner', () => {
		const doc =
			'# T\n\nt\n\n## A\n\na\n\n### A1\n\na1\n\n## B\n\nb\n\n# U\n\nu\n\n### U1\n\nu1\n';
		expect(expect_parity(doc, () => [sectionize(true)], NAMED)).toEqual([
			'root',
			[
				'html tag="section"',
				['heading', 'text:T'],
				['paragraph', 'text:t'],
				[
					'html tag="section"',
					['heading', 'text:A'],
					['paragraph', 'text:a'],
					[
						'html tag="section"',
						['heading', 'text:A1'],
						['paragraph', 'text:a1'],
					],
				],
				['html tag="section"', ['heading', 'text:B'], ['paragraph', 'text:b']],
			],
			[
				'html tag="section"',
				['heading', 'text:U'],
				['paragraph', 'text:u'],
				[
					'html tag="section"',
					['heading', 'text:U1'],
					['paragraph', 'text:u1'],
				],
			],
		]);
	});

	it('a pending <div> inside a root section is repaired as a paragraph', () => {
		const doc = '## A\n\n<div>\n\ninner\n\nlast\n';
		expect(shape(run_batch(doc).nodes, doc)).toEqual([
			'root',
			['heading', 'text:A'],
			['paragraph', 'text:<div>'],
			['paragraph', 'text:inner'],
			['paragraph', 'text:last'],
		]);
		// the repair is chosen for the root, which the section stands in for
		expect(expect_parity(doc, () => [sectionize()], NAMED)).toEqual([
			'root',
			[
				'html tag="section"',
				['heading', 'text:A'],
				['paragraph', 'text:<div>'],
				['paragraph', 'text:inner'],
				['paragraph', 'text:last'],
			],
		]);
	});

	it('a wrapper left open inside a block quote closes with it and takes nothing after', () => {
		const doc = '> ## Q\n>\n> q1\n\nafter\n\n> ## R\n';
		expect(expect_parity(doc, () => [sections_anywhere()], NAMED)).toEqual([
			'root',
			[
				'block_quote',
				['html tag="section"', ['heading', 'text:Q'], ['paragraph', 'text:q1']],
			],
			['paragraph', 'text:after'],
			['block_quote', ['html tag="section"', ['heading', 'text:R']]],
		]);
	});
});

describe('wrap_from: with wrap_inner', () => {
	const autolink = (): ParsePlugin =>
		on('heading', (node) => {
			node.wrap_inner('link', { href: '#x' });
		});

	it('wrap_inner on the wrapped node itself, in either plugin order', () => {
		const source =
			':::steps[]\n\n## One *em*\n\nfirst\n\n## Two\n\nsecond\n:::\n';
		const expected = [
			'root',
			[
				'directive_container name="steps"',
				[
					'directive_container name="step"',
					[
						'directive_label',
						['heading', ['link', 'text:One ', ['strong_emphasis', 'text:em']]],
					],
					['paragraph', 'text:first'],
				],
				[
					'directive_container name="step"',
					['directive_label', ['heading', ['link', 'text:Two']]],
					['paragraph', 'text:second'],
				],
			],
		];
		expect(expect_parity(source, () => [autolink(), steps()], NAMED)).toEqual(
			expected
		);
		expect(expect_parity(source, () => [steps(), autolink()], NAMED)).toEqual(
			expected
		);
	});

	it('wrap_inner on the container before any heading', () => {
		const inner = on('directive_container', (node) => {
			node.wrap_inner('block_quote');
		});
		const source =
			':::steps[]\n\nintro\n\n## One\n\nfirst\n\n## Two\n\nsecond\n:::\n\nafter\n';
		expect(expect_parity(source, () => [inner, steps()], NAMED)).toEqual([
			'root',
			[
				'directive_container name="steps"',
				[
					'block_quote',
					['paragraph', 'text:intro'],
					[
						'directive_container name="step"',
						['directive_label', ['heading', 'text:One']],
						['paragraph', 'text:first'],
					],
					[
						'directive_container name="step"',
						['directive_label', ['heading', 'text:Two']],
						['paragraph', 'text:second'],
					],
				],
			],
			['paragraph', 'text:after'],
		]);
	});

	it('wrap_inner on the container while a step is open', () => {
		// a later child wraps the children of the container, the open step among them
		const late = on('thematic_break', (node) => {
			node.parent!.wrap_inner('block_quote');
		});
		const source =
			':::steps[]\n\n## One\n\nfirst\n\n---\n\nmore\n\n## Two\n\nsecond\n:::\n';
		expect(expect_parity(source, () => [late, steps()], NAMED)).toEqual([
			'root',
			[
				'directive_container name="steps"',
				[
					'block_quote',
					[
						'directive_container name="step"',
						['directive_label', ['heading', 'text:One']],
						['paragraph', 'text:first'],
						'thematic_break',
						['paragraph', 'text:more'],
					],
					[
						'directive_container name="step"',
						['directive_label', ['heading', 'text:Two']],
						['paragraph', 'text:second'],
					],
				],
			],
		]);
	});

	it('two plugins that wrap_from one node nest, the later one inside', () => {
		const wrap = (tag: string) => (): ParsePlugin =>
			on('heading', (node) => {
				node.wrap_from('html', { tag });
			});
		expect(
			expect_parity(
				'# a\n\none\n',
				() => [wrap('outer')(), wrap('inner')()],
				NAMED
			)
		).toEqual([
			'root',
			[
				'html tag="outer"',
				['html tag="inner"', ['heading', 'text:a'], ['paragraph', 'text:one']],
			],
		]);
	});

	it('wrap_inner then wrap_from in one handler nests the wrapper in an open one', () => {
		// the second heading wraps the root while the first section is open
		let seen = 0;
		const make = (): ParsePlugin[] => {
			seen = 0;
			return [
				on('heading', (node) => {
					if (seen++ === 1) node.parent!.wrap_inner('block_quote');
					node.wrap_from('html', { tag: 'section' });
				}),
			];
		};
		expect(expect_parity('# a\n\none\n\n# b\n\ntwo\n', make, NAMED)).toEqual([
			'root',
			[
				'block_quote',
				[
					'html tag="section"',
					['heading', 'text:a'],
					['paragraph', 'text:one'],
					[
						'html tag="section"',
						['heading', 'text:b'],
						['paragraph', 'text:two'],
					],
				],
			],
		]);
	});

	it('close() removes its own link and leaves the wrap_inner link above it', () => {
		const make = (): ParsePlugin[] => {
			let open: WrapperView | null = null;
			return [
				on('block_quote', (node) => {
					node.wrap_inner('html', { tag: 'div' });
				}),
				on('heading', (node) => {
					open = node.wrap_from('html', { tag: 'section' });
				}),
				on('thematic_break', () => {
					open?.close();
				}),
			];
		};
		expect(
			expect_parity('> # a\n>\n> one\n>\n> ---\n>\n> two\n', make, NAMED)
		).toEqual([
			'root',
			[
				'block_quote',
				[
					'html tag="div"',
					[
						'html tag="section"',
						['heading', 'text:a'],
						['paragraph', 'text:one'],
					],
					'thematic_break',
					['paragraph', 'text:two'],
				],
			],
		]);
	});

	it('an open wrapper can be wrapped again once the node in hand is inside it', () => {
		const make = (at_open: boolean) => (): ParsePlugin[] => {
			let open: WrapperView | null = null;
			let done = false;
			return [
				on('heading', (node) => {
					open = node.wrap_from('html', { tag: 'section' });
				}),
				on('paragraph', () => {
					const again = () => {
						if (!done) open!.wrap_from('html', { tag: 'article' });
						done = true;
					};
					if (at_open) again();
					else return again;
				}),
			];
		};
		const source = '# a\n\none\n\ntwo\n';
		expect(expect_parity(source, make(false), NAMED)).toEqual([
			'root',
			[
				'html tag="article"',
				[
					'html tag="section"',
					['heading', 'text:a'],
					['paragraph', 'text:one'],
					['paragraph', 'text:two'],
				],
			],
		]);
		// at open the paragraph still sits after the section, under the root
		expect(() => run_batch(source, make(true)())).toThrow(
			/html node already has a later sibling/
		);
	});
});

describe('wrap_from: close', () => {
	it('wrap_from(...).close() in the open handler wraps the node alone', () => {
		const alone = (): ParsePlugin =>
			on('heading', (node) => {
				const wrapper = node.wrap_from('block_quote');
				wrapper.close();
				// a second close is a no op
				wrapper.close();
			});
		const source = 'intro\n\n## A *em*\n\na1\n\n## B\n';
		expect(expect_parity(source, () => [alone()])).toEqual([
			'root',
			['paragraph', 'text:intro'],
			['block_quote', ['heading', 'text:A ', ['strong_emphasis', 'text:em']]],
			['paragraph', 'text:a1'],
			['block_quote', ['heading', 'text:B']],
		]);
		// the wrapper closed when its heading did
		for (const [name, run] of PATHS) {
			const { nodes } = run(source, [alone()]);
			for (const child of nodes.get_node(0).children) {
				if (nodes.kind_at(child) === NodeKind.line_break) continue;
				expect(nodes.end_at(child), `${name} block ${child}`).not.toBe(NONE);
			}
		}
	});

	it('a wrapper closed while a child is open stays open until that child closes', () => {
		for (const wire of [false, true]) {
			let wrapper: WrapperView | null = null;
			const plugins = [
				on('heading', (node) => {
					wrapper = node.wrap_from('block_quote');
					wrapper.close();
				}),
			];
			const dispatcher = new PluginDispatcher(
				plugins,
				wire ? new WireTextSource([]) : new SourceTextSource('# a')
			);
			let nodes: NodeBuffer;
			let close: () => void;
			if (wire) {
				const builder = new WireTreeBuilder(16, dispatcher);
				builder.apply([['O', 1, NodeKind.heading, 0, 0, 1]]);
				nodes = builder.get_buffer();
				close = () => builder.apply([['C', 1]]);
			} else {
				const tree = new TreeBuilder(16, dispatcher);
				tree.open(1, NodeKind.heading, 0, 0, 1, false);
				nodes = tree.get_buffer();
				close = () => tree.close(1, 3, NodeKind.heading);
			}
			const index = wrapper!._index;
			expect(nodes.end_at(index)).toBe(NONE);
			// the wait keeps the dispatcher listening for the close
			expect(dispatcher.quiet()).toBe(false);
			close();
			expect(nodes.end_at(index)).toBe(nodes.start_at(index));
			expect(dispatcher.quiet()).toBe(true);
		}
	});

	it('wrap_from in a close callback takes the siblings that follow', () => {
		const late = (): ParsePlugin =>
			on('heading', (node) => () => {
				node.wrap_from('block_quote');
			});
		expect(expect_parity('## A\n\na1\n\na2\n', () => [late()])).toEqual([
			'root',
			[
				'block_quote',
				['heading', 'text:A'],
				['paragraph', 'text:a1'],
				['paragraph', 'text:a2'],
			],
		]);
	});

	it('the builders skip the dispatcher again once the last link is gone', () => {
		const source = '## A\n\na1\n\n## B\n\nb1\n\n---\n\ntail\n';
		const make = (): ParsePlugin[] => {
			let open: WrapperView | null = null;
			return [
				on('heading', (node) => {
					open?.close();
					open = node.wrap_from('html', { tag: 'section' });
				}),
				on('thematic_break', () => {
					open?.close();
				}),
			];
		};
		const text = new SourceTextSource(source);
		const dispatcher = new PluginDispatcher(make(), text);
		const handled = dispatcher.open_wants;
		const tree = new TreeBuilder(16, dispatcher);
		const parser = new PFMParser(tree);
		parser.init();
		const cut = source.indexOf('---');
		parser.feed(source.slice(0, cut));
		// a section is open, so every open is sent through the dispatcher
		expect(dispatcher.open_wants).not.toBe(handled);
		expect(dispatcher.wants_open(NodeKind.paragraph)).toBe(true);
		parser.feed(source.slice(cut));
		expect(dispatcher.open_wants).toBe(handled);
		expect(dispatcher.wants_open(NodeKind.paragraph)).toBe(false);
		parser.finish();
		expect(dispatcher.quiet()).toBe(true);
	});
});

describe('wrap_from: inside an unclosed html block', () => {
	it('wrappers opened inside a pending <div> move to the root when it is revoked', () => {
		const source =
			'intro\n\n<div>\n\nlead\n\n## One\n\nfirst\n\n## Two\n\nsecond\n\nlast\n';
		expect(expect_parity(source, () => [sections_anywhere()], NAMED)).toEqual([
			'root',
			['paragraph', 'text:intro'],
			['paragraph', 'text:<div>'],
			['paragraph', 'text:lead'],
			[
				'html tag="section"',
				['heading', 'text:One'],
				['paragraph', 'text:first'],
			],
			[
				'html tag="section"',
				['heading', 'text:Two'],
				['paragraph', 'text:second'],
				['paragraph', 'text:last'],
			],
		]);
		// both sections were closed when the <div> went
		for (const [name, run] of PATHS) {
			const { nodes } = run(source, [sections_anywhere()]);
			for (const child of nodes.get_node(0).children) {
				if (nodes.kind_at(child) === NodeKind.line_break) continue;
				expect(nodes.end_at(child), `${name} block ${child}`).not.toBe(NONE);
			}
		}
	});

	it('a closed <div> keeps its wrappers inside it', () => {
		const source =
			'<div>\n\n## One\n\nfirst\n\n## Two\n\nsecond\n\n</div>\n\nafter\n';
		expect(expect_parity(source, () => [sections_anywhere()], NAMED)).toEqual([
			'root',
			[
				'html tag="div"',
				[
					'html tag="section"',
					['heading', 'text:One'],
					['paragraph', 'text:first'],
				],
				[
					'html tag="section"',
					['heading', 'text:Two'],
					['paragraph', 'text:second'],
				],
			],
			['paragraph', 'text:after'],
		]);
	});

	it('an unclosed <div> inside a step is revoked after the container closed', () => {
		const source =
			':::steps[]\n\n## One\n\n<div>\n\ninner\n\n## Two\n\nsecond\n:::\n\nafter\n';
		expect(expect_parity(source, () => [steps()], NAMED)).toEqual([
			'root',
			[
				'directive_container name="steps"',
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:One']],
					['paragraph', 'text:<div>'],
					['paragraph', 'text:inner'],
				],
				[
					'directive_container name="step"',
					['directive_label', ['heading', 'text:Two']],
					['paragraph', 'text:second'],
				],
			],
			['paragraph', 'text:after'],
		]);
	});

	it('a tight list paragraph beside a wrapper is unwrapped inside it', () => {
		const source = '- ## H\n  para\n- b\n\nafter\n';
		expect(expect_parity(source, () => [sections_anywhere()], NAMED)).toEqual([
			'root',
			[
				'list',
				[
					'list_item',
					['html tag="section"', ['heading', 'text:H'], 'text:para'],
				],
				['list_item', 'text:b'],
			],
			['paragraph', 'text:after'],
		]);
	});
});

// a table cell and a code span open committed and are still revoked, the
// cell when it turns out to be a merge marker, the span when it never closes
describe('wrap_from: revoke', () => {
	const TABLE = '| a | b | c |\n|---|---|---|\n| x |>  | z |\n';
	const in_body = (node: NodeView) => node.parent?.type === 'table_row';

	it('a wrapper whose trigger node is revoked is removed', () => {
		const plain = shape(run_batch(TABLE).nodes, TABLE);
		// every cell of the document is wrapped alone, the marker cell too
		const each = (): ParsePlugin =>
			on('table_cell', (node) => {
				node.wrap_from('emphasis').close();
			});
		const tree = expect_parity(TABLE, () => [each()]);
		const cells = JSON.stringify(tree).match(/"emphasis"/g)!;
		// three head cells and two body cells, the marker left nothing behind
		expect(cells).toHaveLength(5);
		expect(
			JSON.stringify(tree).replace(/\["emphasis",(\[.*?\]|".*?")\]/g, '$1')
		).toBe(JSON.stringify(plain));
	});

	it('a wrapper left open by a revoked node is removed, the next node is not inside it', () => {
		const open = (): ParsePlugin =>
			on('code_span', (node) => {
				node.wrap_from('strikethrough');
			});
		// the span never closes, its backtick becomes text
		const source = 'a `b *c* d\n\nnext\n';
		expect(expect_parity(source, () => [open()])).toEqual(
			shape(run_batch(source).nodes, source, 0, { merge_text: true })
		);
	});

	it('close() from a node that is then revoked reopens the wrapper', () => {
		// the first cell of a row opens a wrapper, the second closes it
		const make = (closes: boolean) => (): ParsePlugin[] => {
			let open: WrapperView | null = null;
			let column = 0;
			return [
				on('table_row', () => {
					column = 0;
				}),
				on('table_cell', (node) => {
					if (!in_body(node)) return;
					if (column === 0) open = node.wrap_from('emphasis');
					else if (column === 1 && closes) open!.close();
					column++;
				}),
			];
		};
		// the second cell is a merge marker, so the wrapper it closed takes
		// the third cell as if it had never been closed
		expect(expect_parity(TABLE, make(true))).toEqual(
			expect_parity(TABLE, make(false))
		);
		// a real second cell keeps the wrapper closed
		const real = '| a | b | c |\n|---|---|---|\n| x | y | z |\n';
		const kept = JSON.stringify(expect_parity(real, make(true)));
		expect(kept).toContain(
			'["emphasis",["table_cell","text:x"]],["table_cell","text:y"],["table_cell","text:z"]'
		);
	});

	it('the steps pattern from a revoked node leaves the earlier wrapper open', () => {
		const make = (): ParsePlugin[] => {
			let open: WrapperView | null = null;
			return [
				on('table_cell', (node) => {
					if (!in_body(node)) return;
					open?.close();
					open = node.wrap_from('emphasis');
					node.wrap_from('strong_emphasis').close();
				}),
			];
		};
		const source = '| a | b | c | d |\n|---|---|---|---|\n| x |>  | y | z |\n';
		// the marker cell closed the wrapper of x and opened its own, both are
		// undone. what the plugin keeps is not: it still holds the wrapper that
		// was removed, so its next close does nothing and y nests in the
		// wrapper of x
		expect(JSON.stringify(expect_parity(source, make))).toContain(
			'["table_row",["emphasis",["strong_emphasis",["table_cell","text:x"]],' +
				'["emphasis",["strong_emphasis",["table_cell","text:y"]]],' +
				'["emphasis",["strong_emphasis",["table_cell","text:z"]]]]]'
		);
	});

	it('an undone wrap_from gives back the siblings it took, on both builders', () => {
		for (const wire of [false, true]) {
			const plugins = [
				on('code_span', (node) => {
					node.wrap_from('strikethrough');
				}),
			];
			const dispatcher = new PluginDispatcher(
				plugins,
				wire ? new WireTextSource([]) : new SourceTextSource('a `b c d')
			);
			let nodes: NodeBuffer;
			if (wire) {
				const builder = new WireTreeBuilder(16, dispatcher);
				builder.apply([
					['O', 1, NodeKind.paragraph, 0, 0, 0],
					['T', 1, 'a '],
					// the span stays open, a closed committed node has no undo log left
					['O', 2, NodeKind.code_span, 1, 0, 0],
					['T', 1, ' c '],
					['O', 3, NodeKind.strong_emphasis, 1, 0, 0],
					['C', 3],
					['R', 2, '`'],
					['T', 1, 'd'],
					['C', 1],
					['C', 0],
				]);
				nodes = builder.get_buffer();
			} else {
				const tree = new TreeBuilder(16, dispatcher);
				tree.open(1, NodeKind.paragraph, 0, 0, 0, false);
				tree.text(1, 0, 2);
				tree.open(2, NodeKind.code_span, 2, 1, 0, false);
				tree.text(1, 4, 6);
				tree.open(3, NodeKind.strong_emphasis, 6, 1, 0, false);
				tree.close(3, 7, NodeKind.strong_emphasis);
				tree.revoke(2, '`', 2);
				tree.text(1, 7, 8);
				tree.close(1, 8, NodeKind.paragraph);
				tree.close(0, 8, NodeKind.root);
				nodes = tree.get_buffer();
			}
			expect_linked(nodes);
			expect(dispatcher.quiet()).toBe(true);
			const kinds = nodes
				.get_node(nodes.get_node(0).children[0])
				.children.map((c) => nodes.get_node(c).kind);
			// the text and the strong joined the wrapper and are back in the paragraph
			expect(kinds).toEqual([
				'text',
				'text',
				'text',
				'strong_emphasis',
				'text',
			]);
		}
	});

	it('an undone close takes back what arrived while the wrapper was closed', () => {
		let open: WrapperView | null = null;
		const plugins = [
			on('emphasis', (node) => {
				open = node.wrap_from('strikethrough');
			}),
			on('code_span', () => {
				open!.close();
			}),
		];
		const dispatcher = new PluginDispatcher(plugins, new SourceTextSource(''));
		const tree = new TreeBuilder(16, dispatcher);
		tree.open(1, NodeKind.paragraph, 0, 0, 0, false);
		tree.open(2, NodeKind.emphasis, 0, 1, 0, false);
		tree.close(2, 1, NodeKind.emphasis);
		tree.open(3, NodeKind.code_span, 1, 1, 0, false);
		tree.open(4, NodeKind.strong_emphasis, 2, 1, 0, false);
		tree.close(4, 3, NodeKind.strong_emphasis);
		const nodes = tree.get_buffer();
		const wrapper = open!._index;
		// closed, the span and the strong sit beside it
		expect(nodes.end_at(wrapper)).not.toBe(NONE);
		expect(nodes.get_node(wrapper).children).toHaveLength(1);
		tree.revoke(3, '`', 1);
		expect(nodes.end_at(wrapper)).toBe(NONE);
		tree.open(5, NodeKind.subscript, 3, 1, 0, false);
		tree.close(5, 4, NodeKind.subscript);
		tree.close(1, 4, NodeKind.paragraph);
		expect_linked(nodes);
		expect(
			nodes.get_node(wrapper).children.map((c) => nodes.get_node(c).kind)
		).toEqual(['emphasis', 'text', 'strong_emphasis', 'subscript']);
		expect(nodes.get_node(1).children).toEqual([wrapper]);
		expect(nodes.end_at(wrapper)).toBe(nodes.start_at(wrapper));
		expect(dispatcher.quiet()).toBe(true);
	});
});

describe('wrap_from: what it refuses', () => {
	it('a node that already has a later sibling', () => {
		const back = on('paragraph', (node) => {
			node.parent!.first_child!.wrap_from('block_quote');
		});
		for (const [name, run] of PATHS) {
			expect(() => run('## A\n\na1\n', [back]), name).toThrow(
				/heading node already has a later sibling/
			);
		}
	});

	it('wrap_from from the handler of a pending node', () => {
		// an emphasis is pending until its closer, a tight list paragraph until the list ends
		const cases: [string, string][] = [
			['a *b* c\n', 'strong_emphasis'],
			['- a\n- b\n', 'paragraph'],
			['<div>\n\ntext\n\n</div>\n', 'html'],
		];
		for (const [source, kind] of cases) {
			const plugin = on(kind, (node) => {
				node.wrap_from('block_quote');
			});
			for (const [name, run] of PATHS) {
				expect(() => run(source, [plugin]), `${kind} ${name}`).toThrow(
					`wrap_from was called from the handler of a pending ${kind} node`
				);
			}
		}
	});

	it('wrap_from on another node from the handler of a pending node', () => {
		const plugin = on('strong_emphasis', (node) => {
			node.parent!.wrap_from('block_quote');
		});
		expect(() => run_batch('*b* c\n', [plugin])).toThrow(/pending/);
	});

	it('close() from the handler of a pending node', () => {
		const make = (): ParsePlugin[] => {
			let open: WrapperView | null = null;
			return [
				on('code_span', (node) => {
					open = node.wrap_from('strikethrough');
				}),
				on('strong_emphasis', () => {
					open?.close();
				}),
			];
		};
		for (const [name, run] of PATHS) {
			expect(() => run('a `c` b *em* d\n', make()), name).toThrow(
				'close was called from the handler of a pending strong_emphasis node'
			);
		}
		// closing a wrapper that is closed already is a no op, pending or not
		const twice = (): ParsePlugin[] => {
			let open: WrapperView | null = null;
			return [
				on('code_span', (node) => {
					open = node.wrap_from('strikethrough');
					open.close();
				}),
				on('strong_emphasis', () => {
					open?.close();
				}),
			];
		};
		expect_parity('a `c` b *em* d\n', twice);
	});

	it('the root and an unknown type', () => {
		const up = on('heading', (node) => {
			node.parent!.wrap_from('block_quote');
		});
		expect(() => run_batch('# a\n', [up])).toThrow(/no parent/);
		const unknown = on('heading', (node) => {
			node.wrap_from('nope');
		});
		expect(() => run_batch('# a\n', [unknown])).toThrow(
			'Unknown node type: nope'
		);
	});
});

describe('wrap_from: directive args', () => {
	const with_args = (args: unknown) =>
		on('heading', (node) => {
			node.wrap_from('directive_container', { name: 'tab', args });
		});

	it('takes an object of strings, or none', () => {
		for (const args of [{ selected: 'true' }, {}, null, undefined]) {
			expect(() => run_batch('# a\n', [with_args(args)])).not.toThrow();
		}
	});

	it('refuses a value that is not a string where it is set', () => {
		expect(() => run_batch('# a\n', [with_args({ count: 3 })])).toThrow(
			'the args of a directive must be strings, "count" is number'
		);
		expect(() => run_batch('# a\n', [with_args({ on: true })])).toThrow(
			/"on" is boolean/
		);
		expect(() => run_batch('# a\n', [with_args('selected')])).toThrow(
			/must be an object of strings, got string/
		);
		const later = on('heading', (node) => {
			const tab = node.wrap_from('directive_container', { name: 'tab' });
			tab.attrs.args = { count: 3 };
		});
		expect(() => run_batch('# a\n', [later])).toThrow(/"count" is number/);
	});

	it('leaves the args attr of any other node alone', () => {
		const other = on('heading', (node) => {
			node.wrap_from('html', { tag: 'section', args: { count: 3 } });
			node.attrs.args = 3;
		});
		expect(() => run_batch('# a\n', [other])).not.toThrow();
	});
});

describe('wrap_from: a sequential pass', () => {
	it('wraps the node alone, the tree is complete so nothing follows it', () => {
		const last: ParsePlugin = {
			sequential: true,
			paragraph: {
				parse(node) {
					if (node.next === null) node.wrap_from('block_quote').close();
				},
			},
		};
		const tree = expect_parity('one\n\ntwo', () => [last]);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:one'],
			['block_quote', ['paragraph', 'text:two']],
		]);
		for (const [name, run] of PATHS) {
			const { nodes, dispatcher } = run('one\n\ntwo', [last]);
			const wrapper = nodes.last_child_at(0);
			expect(nodes.end_at(wrapper), name).toBe(nodes.start_at(wrapper));
			expect(dispatcher!.wants_open(NodeKind.heading), name).toBe(false);
		}
	});
});

describe('the synthetic flag', () => {
	it('is set on every node a plugin makes and on no other', () => {
		const all = on('heading', (node) => {
			node.wrap_inner('link');
			node.prepend('emphasis');
			node.append('strikethrough');
			node.wrap_from('block_quote');
		});
		for (const [name, run] of PATHS) {
			const { nodes } = run('# a *b*\n\ntext\n', [all]);
			const made: string[] = [];
			for (let i = 1; i < nodes.size; i++) {
				if (nodes.synthetic_at(i)) made.push(nodes.get_node(i).kind);
				expect(nodes.pending_at(i), `${name} node ${i}`).toBe(0);
			}
			expect(made.sort(), name).toEqual([
				'block_quote',
				'emphasis',
				'link',
				'strikethrough',
			]);
		}
	});

	it('a repair sees through a wrap_inner wrapper to the parent the parser made', () => {
		const inner = on('block_quote', (node) => {
			node.wrap_inner('html', { tag: 'div' });
		});
		// without the flag the unclosed tag became bare text in the wrapper
		const source = '> <div>\n>\n> text\n';
		const plain = shape(run_batch(source).nodes, source) as unknown[];
		const tree = expect_parity(source, () => [inner], NAMED) as unknown[];
		// the same children as without the plugin, one level down
		expect((tree[1] as unknown[])[1]).toEqual([
			'html tag="div"',
			...(plain[1] as unknown[]).slice(1),
		]);
	});
});

/** a tree without the nodes plugins made, their children in their place */
function bare(nodes: NodeBuffer, source: string | null, index = 0): unknown[] {
	const node = nodes.get_node(index);
	if (node.kind === 'text') {
		const stored = nodes._strings[index];
		return [
			'text:' +
				(stored !== undefined || source === null
					? stored
					: source.slice(node.value[0], node.value[1])),
		];
	}
	const kids: unknown[] = [];
	for (const c of node.children) {
		if (nodes.get_node(c).kind === 'line_break') continue;
		for (const kid of bare(nodes, source, c)) {
			const last = kids[kids.length - 1];
			if (typeof kid === 'string' && typeof last === 'string') {
				kids[kids.length - 1] = last + kid.slice(5);
			} else kids.push(kid);
		}
	}
	if (nodes.synthetic_at(index)) return kids;
	return [kids.length === 0 ? node.kind : [node.kind, ...kids]];
}

describe('wrap_from: random documents', () => {
	const PIECES = [
		'# h1\n\n',
		'## h2 *em*\n\n',
		'### h3 `c`\n\n',
		'para one\n\n',
		'para *two* `x` three\n\n',
		'> quote\n>\n> ## inq\n>\n> more\n\n',
		'- a\n- b\n\n',
		'- ## lh\n  text\n- c\n\n',
		'- loose\n\n  more\n\n- z\n\n',
		'<div>\n\n',
		'</div>\n\n',
		':::steps[]\n\n',
		':::\n\n',
		'::::steps[]\n\n',
		'::::\n\n',
		'| a | b | c |\n|---|---|---|\n| x |>  | z |\n|^  | q | r |\n\n',
		'a `unclosed b\n\n',
		'---\n\n',
		'```js\ncode\n```\n\n',
		'text [not link] tail\n\n',
	];

	/** the steps pattern on every cell and code span, both can be revoked */
	const cells = (): ParsePlugin => {
		let open: WrapperView | null = null;
		const step: Parse = (node) => {
			open?.close();
			open = node.wrap_from('emphasis');
			node.wrap_from('strong_emphasis').close();
		};
		return { table_cell: { parse: step }, code_span: { parse: step } };
	};
	const inner = (): ParsePlugin => ({
		block_quote: {
			parse(node) {
				node.wrap_inner('html', { tag: 'div' });
			},
		},
		heading: {
			parse(node) {
				node.wrap_inner('link');
			},
		},
		thematic_break: {
			parse(node) {
				node.parent!.wrap_inner('block_quote');
			},
		},
	});
	const MAKERS: (() => ParsePlugin[])[] = [
		() => [sections_anywhere()],
		() => [steps()],
		() => [sectionize(true)],
		() => [cells()],
		() => [inner(), sections_anywhere()],
		() => [steps(), inner()],
		() => [cells(), sectionize(true)],
	];

	it('every path builds one tree, and without the plugin nodes it is the plain tree', () => {
		let seed = 1;
		const random = () =>
			(seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
		for (let round = 0; round < 280; round++) {
			let source = '';
			const count = 2 + Math.floor(random() * 9);
			for (let i = 0; i < count; i++) {
				source += PIECES[Math.floor(random() * PIECES.length)];
			}
			if (random() < 0.3) source = source.trimEnd();
			const make = MAKERS[round % MAKERS.length];
			const where = `round ${round} ${JSON.stringify(source)}`;

			const plain = run_batch(source);
			const expected = bare(plain.nodes, plain.source);
			let first: unknown;
			for (let i = 0; i < PATHS.length; i++) {
				const [name, run] = PATHS[i];
				const out = run(source, make());
				expect_linked(out.nodes);
				expect(out.dispatcher!.quiet(), `${name} ${where}`).toBe(true);
				expect(bare(out.nodes, out.source), `${name} ${where}`).toEqual(
					expected
				);
				const tree = shape(out.nodes, out.source, 0, {
					...NAMED,
					merge_text: true,
				});
				if (i === 0) first = tree;
				else expect(tree, `${name} ${where}`).toEqual(first);
			}
		}
	});
});
