import { describe, expect, it } from 'vitest';

import type { NodeView, WrapperView } from '../src/node_view';
import type { ParsePlugin } from '../src/plugin_types';
import {
	expect_parity,
	expect_parity_logged,
	type PluginSetup,
} from './plugin_harness';

type Parse = (node: NodeView) => (() => void) | void;

const on = (kind: string, parse: Parse, sequential = false): ParsePlugin => ({
	sequential,
	[kind]: { parse },
});

const at_close = (kind: string, close: (node: NodeView) => void) =>
	on(kind, (node) => () => close(node));

const NAMED = { attrs: ['name', 'tag'] };

describe('node.remove in a close callback', () => {
	it('takes the node and everything in it out of the tree', () => {
		const tree = expect_parity(
			'# Keep\n\n## Drop _this_\n\nA [link _in_](x) b <!-- note --> c.\n\n```js\ncode\n```\n\nlast\n',
			() => [
				at_close('heading', (node) => {
					if (node.depth === 2) node.remove();
				}),
				at_close('link', (node) => node.remove()),
				at_close('html_comment', (node) => node.remove()),
				at_close('code_fence', (node) => node.remove()),
			]
		);
		expect(tree).toEqual([
			'root',
			['heading', 'text:Keep'],
			['paragraph', 'text:A  b  c.'],
			['paragraph', 'text:last'],
		]);
	});

	it('takes a node inside the node whose callback runs', () => {
		const tree = expect_parity(
			':::box[Label]\none\n\n- a\n- b\n- c\n\ntwo\n:::\n',
			() => [
				at_close('directive_container', (node) => {
					for (let child = node.first_child; child !== null; ) {
						const next = child.next;
						if (child.type === 'directive_label') child.remove();
						child = next;
					}
				}),
				at_close('list', (node) => {
					node.first_child!.next!.remove();
				}),
			],
			NAMED
		);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="box"',
				['paragraph', 'text:one'],
				['list', ['list_item', 'text:a'], ['list_item', 'text:c']],
				['paragraph', 'text:two'],
			],
		]);
	});

	it('leaves a view that reads, with no parent, and a second call does nothing', () => {
		const { log } = expect_parity_logged('a\n\nb _c_\n\nd\n', (log) => [
			at_close('paragraph', (node) => {
				if (node.text_content !== 'b c') return;
				const root = node.parent!;
				node.remove();
				node.remove();
				log.push(
					`${node.type} "${node.text_content}" parent=${node.parent} next=${node.next}`
				);
				log.push(`root "${root.text_content}"`);
			}),
		]);
		expect(log).toEqual(['paragraph "b c" parent=null next=null', 'root "a"']);
	});

	it('takes an open wrapper, which stops taking the children that follow', () => {
		const tree = expect_parity(
			':::box\n## One\n\ntext\n:::\n\nafter\n',
			(): PluginSetup => ({
				directive_handlers: [
					{
						box: {
							parse: (node, ctx) => () => {
								(ctx.state.section as WrapperView).remove();
								node.append('text', 'emptied');
							},
							children: {
								heading: (node, ctx) => {
									ctx.state.section = node.wrap_from('html', {
										tag: 'section',
									});
								},
							},
						},
					},
				],
			}),
			NAMED
		);
		expect(tree).toEqual([
			'root',
			['directive_container name="box"', 'text:emptied'],
			['paragraph', 'text:after'],
		]);
	});

	it('with node.pending takes the nodes that closed and leaves the one that is revoked', () => {
		const tree = expect_parity('a _b_ c _d e\n\n- f _g_\n', () => [
			at_close('emphasis', (node) => {
				if (!node.pending) node.remove();
			}),
		]);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:a  c _d e'],
			['list', ['list_item', 'text:f ']],
		]);
	});
});

describe('where node.remove throws', () => {
	const caught = (log: string[], run: () => void) => {
		try {
			run();
			log.push('removed');
		} catch (e) {
			log.push((e as Error).message);
		}
	};

	it('throws in an open handler, the parser has more to send', () => {
		const { tree, log } = expect_parity_logged('# T\n\n_a_\n', (log) => [
			on('heading', (node) => caught(log, () => node.remove())),
			on('emphasis', (node) => caught(log, () => node.remove())),
		]);
		expect(log).toEqual([
			'remove was called from the open handler of a heading node, the parser has more to send, call it from the close callback or a sequential pass',
			'remove was called from the open handler of a emphasis node, the parser has more to send, call it from the close callback or a sequential pass',
		]);
		expect(tree).toEqual([
			'root',
			['heading', 'text:T'],
			['paragraph', ['emphasis', 'text:a']],
		]);
	});

	it('throws in the close callback of a node that is still pending', () => {
		const { tree, log } = expect_parity_logged('a _b c\n\n- d\n', (log) => [
			at_close('emphasis', (node) => caught(log, () => node.remove())),
			at_close('paragraph', (node) => {
				if (node.pending) caught(log, () => node.remove());
			}),
		]);
		expect(log).toEqual([
			'remove was called from the close callback of a pending emphasis node, which may still be revoked, check node.pending first',
			'remove was called from the close callback of a pending paragraph node, which may still be revoked, check node.pending first',
		]);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:a _b c'],
			['list', ['list_item', 'text:d']],
		]);
	});

	it('throws for a node outside the one whose callback runs, and for the root', () => {
		const { tree, log } = expect_parity_logged('first\n\nsecond\n', (log) => [
			at_close('paragraph', (node) => {
				if (node.text_content === 'first') return;
				caught(log, () => node.parent!.first_child!.remove());
				caught(log, () => node.parent!.remove());
			}),
		]);
		expect(log).toEqual([
			'remove: the paragraph node is not inside the paragraph node whose handler is running, a handler removes its own node or one inside it',
			'remove: the root can not be removed',
		]);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:first'],
			['paragraph', 'text:second'],
		]);
	});
});

describe('node.remove in a sequential pass', () => {
	it('takes a node from its handler, and the walk goes on with the next', () => {
		const { tree, log } = expect_parity_logged(
			'one\n\n> two\n>\n> three\n\nfour\n\n- five\n\nsix\n',
			(log) => [
				{
					sequential: true,
					paragraph: {
						parse(node) {
							const text = node.text_content;
							log.push(text);
							if (text === 'one' || text === 'three' || text === 'four')
								node.remove();
						},
					},
					block_quote: {
						parse(node) {
							log.push('quote');
							return () => log.push('quote closed ' + node.text_content);
						},
					},
				},
			]
		);
		expect(log).toEqual([
			'one',
			'quote',
			'two',
			'three',
			'quote closed two',
			'four',
			'six',
		]);
		expect(tree).toEqual([
			'root',
			['block_quote', ['paragraph', 'text:two']],
			['list', ['list_item', 'text:five']],
			['paragraph', 'text:six'],
		]);
	});

	it('takes a node from its close callback, and one inside it from its handler', () => {
		const { tree, log } = expect_parity_logged(
			':::a\nx\n:::\n\n:::b[Label]\ny _z_\n:::\n\n:::c\nw\n:::\n\nend\n',
			(log) => [
				{
					sequential: true,
					directive_container: {
						parse(node) {
							log.push('open ' + node.attrs.name);
							node.first_child!.type === 'directive_label' &&
								node.first_child!.remove();
							return () => {
								log.push('close ' + node.attrs.name);
								if (node.attrs.name !== 'b') node.remove();
							};
						},
					},
					paragraph: {
						parse(node) {
							log.push('paragraph ' + node.text_content);
						},
					},
					emphasis: {
						// a node inside one that is removed later is still visited first
						parse(node) {
							return () => node.remove();
						},
					},
				},
			],
			NAMED
		);
		expect(log).toEqual([
			'open a',
			'paragraph x',
			'close a',
			'open b',
			'paragraph y z',
			'close b',
			'open c',
			'paragraph w',
			'close c',
			'paragraph end',
		]);
		expect(tree).toEqual([
			'root',
			['directive_container name="b"', ['paragraph', 'text:y ']],
			['paragraph', 'text:end'],
		]);
	});

	it('does not visit what a removed node held, nor run its close callback', () => {
		const { log } = expect_parity_logged('> a _b_\n\nc\n', (log) => [
			{
				sequential: true,
				block_quote: {
					parse(node) {
						node.remove();
						return () => log.push('quote closed');
					},
				},
				paragraph: {
					parse(node) {
						log.push('paragraph ' + node.text_content);
					},
				},
				emphasis: {
					parse() {
						log.push('emphasis');
					},
				},
			},
		]);
		expect(log).toEqual(['paragraph c']);
	});

	it('throws for a node outside the one whose handler runs', () => {
		expect(() =>
			expect_parity('a\n\nb', () => [
				on('paragraph', (node) => node.parent!.last_child!.remove(), true),
			])
		).toThrow(
			'remove: the paragraph node is not inside the paragraph node whose handler is running'
		);
	});
});

describe('a revoke that arrives for a node a plugin removed', () => {
	// a delimiter with no closer is closed where its block ends and revoked
	// after the paragraph around it closed
	const SOURCE = 'a _b *c* d\n\nend\n';

	it('has nothing to repair when the node itself was removed', () => {
		const { tree, log } = expect_parity_logged(SOURCE, (log) => [
			at_close('emphasis', (node) =>
				log.push(`emphasis pending=${node.pending}`)
			),
			at_close('paragraph', (node) => {
				const emphasis = node.last_child!;
				if (emphasis.type !== 'emphasis') return;
				log.push('paragraph removes ' + emphasis.type);
				emphasis.remove();
			}),
		]);
		expect(log).toEqual([
			'emphasis pending=true',
			'paragraph removes emphasis',
		]);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:a '],
			['paragraph', 'text:end'],
		]);
	});

	it('repairs inside what was removed when the node around it was', () => {
		const tree = expect_parity(SOURCE, () => [
			at_close('paragraph', (node) => {
				if (node.text_content !== 'end') node.remove();
			}),
		]);
		expect(tree).toEqual(['root', ['paragraph', 'text:end']]);
	});
});
