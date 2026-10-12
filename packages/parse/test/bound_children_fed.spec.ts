import { describe, expect, it } from 'vitest';

import type { DirectiveHandlers } from '../src/plugin_types';
import { expect_parity, expect_parity_logged } from './plugin_harness';
import type { PluginSetup } from './plugin_harness';

const SHOWN = { attrs: ['name', 'tag', 'i', 'any', 'closed'] };

const bound = (...tables: DirectiveHandlers[]): PluginSetup => ({
	directive_handlers: tables,
});

/** marks each child with the index its handler got */
const numbered = (): DirectiveHandlers => ({
	box: {
		children: {
			html(node, ctx) {
				node.attrs.i = ctx.index;
			},
			paragraph(node, ctx) {
				node.attrs.i = ctx.index;
			},
			'*'(node, ctx) {
				node.attrs.any = ctx.index;
			},
		},
	},
});

describe('a bound children handler and an element alone on its line', () => {
	it('runs for a component, however the document is fed', () => {
		expect(
			expect_parity(
				':::box\n<Widget />\n\ntext\n:::\n',
				() => bound(numbered()),
				SHOWN
			)
		).toEqual([
			'root',
			[
				'directive_container name="box"',
				'html tag="Widget" i=0 any=0',
				['paragraph i=0 any=1', 'text:text'],
			],
		]);
	});

	it('counts each element once', () => {
		expect(
			expect_parity(
				':::box\n<A />\n\n<B />\n<C />\n\nx <D /> y\n\n<E />\n:::\n',
				() => bound(numbered()),
				SHOWN
			)
		).toEqual([
			'root',
			[
				'directive_container name="box"',
				'html tag="A" i=0 any=0',
				'html tag="B" i=1 any=1',
				'soft_break',
				'html tag="C" i=2 any=2',
				['paragraph i=0 any=3', 'text:x ', 'html tag="D"', 'text: y'],
				'html tag="E" i=3 any=4',
			],
		]);
	});

	it('runs for an element that holds blocks', () => {
		expect(
			expect_parity(
				':::box\n<Card>\n\ninner\n\n</Card>\n:::\n',
				() => bound(numbered()),
				SHOWN
			)
		).toEqual([
			'root',
			[
				'directive_container name="box"',
				['html tag="Card" i=0 any=0', ['paragraph', 'text:inner']],
			],
		]);
	});

	it('runs the callback a handler returns when the element closes', () => {
		const { tree, log } = expect_parity_logged(
			':::box\n<Widget />\n\n<Card>\n\ninner\n\n</Card>\n:::\n',
			(log) =>
				bound({
					box: {
						children: {
							html(node, ctx) {
								const index = ctx.index;
								return () => {
									log.push(`closed ${node.attrs.tag} ${index}`);
								};
							},
						},
					},
				}),
			SHOWN
		);
		expect(log).toEqual(['closed Widget 0', 'closed Card 1']);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="box"',
				'html tag="Widget"',
				['html tag="Card"', ['paragraph', 'text:inner']],
			],
		]);
	});

	it('a handler in an outer directive does not run for it', () => {
		expect(
			expect_parity(
				':::box\n:::inner\n<Widget />\n:::\n:::\n',
				() => bound(numbered()),
				SHOWN
			)
		).toEqual([
			'root',
			[
				'directive_container name="box"',
				['directive_container name="inner" any=0', 'html tag="Widget"'],
			],
		]);
	});
});
