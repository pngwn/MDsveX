import { describe, expect, it } from 'vitest';

import type { WrapperView } from '../src/node_view';
import type {
	DirectiveEntry,
	DirectiveHandler,
	DirectiveHandlers,
} from '../src/plugin_types';
import {
	PATHS,
	expect_parity,
	expect_parity_logged,
	type PluginSetup,
} from './plugin_harness';

const bound = (handlers: DirectiveHandlers): PluginSetup => ({
	directive_handlers: [handlers],
});

/** a box whose any child handler logs the type, or the name, of each child */
const seen = (log: string[], more?: DirectiveEntry): PluginSetup =>
	bound({
		box: {
			...more,
			children: {
				...more?.children,
				'*': (node, ctx) => {
					log.push(`${ctx.index} ${node.attrs.name ?? node.type}`);
				},
			},
		},
	});

const EVERY_KIND = [
	'::::box[Label]',
	'# Heading',
	'',
	'A paragraph with _inline_ `code` and :kbd[x].',
	'',
	'- a list',
	'- of two',
	'',
	'> a quote',
	'',
	'```js',
	'code',
	'```',
	'',
	'---',
	'',
	'| a | b |',
	'| - | - |',
	'| c | d |',
	'',
	'<div>',
	'',
	'html',
	'',
	'</div>',
	'',
	':::inner',
	'deeper',
	':::',
	'',
	'::leaf',
	'::::',
	'',
	'outside',
	'',
].join('\n');

describe('the any child handler of a directive', () => {
	it('runs for every node written directly inside, whatever its type', () => {
		const { log } = expect_parity_logged(EVERY_KIND, (log) => seen(log));
		expect(log).toEqual([
			'0 directive_label',
			'1 heading',
			'2 paragraph',
			'3 list',
			'4 block_quote',
			'5 code_fence',
			'6 thematic_break',
			'7 table',
			'8 html',
			'9 inner',
			'10 leaf',
		]);
	});

	it('leaves the tree as it is without the handler', () => {
		const options = { attrs: ['name'] };
		expect(expect_parity(EVERY_KIND, () => seen([]), options)).toEqual(
			expect_parity(EVERY_KIND, () => [], options)
		);
	});

	it('runs after the handler for the type of the child and before the descendants one', () => {
		const { log } = expect_parity_logged(
			':::box\n## One\n\ntext\n:::\n',
			(log) =>
				bound({
					box: {
						children: {
							'*': (node, ctx) => {
								log.push(`any ${ctx.index} ${node.type} tab=${ctx.state.tab}`);
								return () => log.push(`any closed ${node.type}`);
							},
							heading: (_node, ctx) => {
								log.push(`heading ${ctx.index}`);
								ctx.state.tab = 'open';
								return () => log.push('heading closed');
							},
						},
						descendants: {
							heading: () => {
								log.push('descendant heading');
							},
						},
					},
				})
		);
		expect(log).toEqual([
			'heading 0',
			'any 0 heading tab=open',
			'descendant heading',
			'heading closed',
			'any closed heading',
			'any 1 paragraph tab=open',
			'any closed paragraph',
		]);
	});

	it('is called for the children of its own directive only', () => {
		const { log } = expect_parity_logged(
			'::::box\nfirst\n\n:::box\ninner _one_\n\n- item\n:::\n\nlast\n::::\n\n:::other\nnot seen\n:::\n',
			(log) =>
				bound({
					box: {
						parse: (_node, ctx) => {
							ctx.state.id = log.filter((l) => l.startsWith('box')).length;
							log.push('box ' + ctx.state.id);
						},
						children: {
							'*': (node, ctx) => {
								log.push(`in ${ctx.state.id}: ${ctx.index} ${node.type}`);
							},
						},
					},
				})
		);
		expect(log).toEqual([
			'box 0',
			'in 0: 0 paragraph',
			'in 0: 1 directive_container',
			'box 1',
			'in 1: 0 paragraph',
			'in 1: 1 list',
			'in 0: 2 paragraph',
		]);
	});

	it('still lets the handlers of deeper nodes run, and places what none takes', () => {
		const { tree, log } = expect_parity_logged(
			':::box\nintro _a_\n\n## One\n\ntext [b](c)\n\n- item _d_\n:::\n',
			(log): PluginSetup => ({
				plugins: [
					{
						emphasis: {
							parse(node) {
								return () => log.push('emphasis ' + node.text_content);
							},
						},
					},
				],
				directive_handlers: [
					{
						box: {
							children: {
								// a section from each heading on, what comes before stays outside
								'*': (node, ctx) => {
									if (node.type !== 'heading') return;
									(ctx.state.section as WrapperView | undefined)?.close();
									ctx.state.section = node.wrap_from('html', {
										tag: 'section',
									});
								},
							},
							descendants: {
								link: (node) => {
									return () => log.push('link ' + node.text_content);
								},
							},
						},
					},
				],
			}),
			{ attrs: ['name', 'tag'] }
		);
		expect(log).toEqual(['emphasis a', 'link b', 'emphasis d']);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="box"',
				['paragraph', 'text:intro ', ['emphasis', 'text:a']],
				[
					'html tag="section"',
					['heading', 'text:One'],
					['paragraph', 'text:text ', ['link', 'text:b']],
					['list', ['list_item', 'text:item ', ['emphasis', 'text:d']]],
				],
			],
		]);
	});

	it('warns about content before the first tab as it arrives', () => {
		for (const [name, run] of PATHS) {
			const out = run(
				':::tabs[Group]\nstray\n\n## One\n\nfine\n\n## Two\n\nalso fine\n:::\n',
				bound({
					tabs: {
						children: {
							heading: (node, ctx) => {
								(ctx.state.tab as WrapperView | undefined)?.close();
								ctx.state.tab = node.wrap_from('directive_container', {
									name: 'tab',
								});
							},
							'*': (node, ctx) => {
								if (
									ctx.state.tab === undefined &&
									node.type !== 'directive_label'
								)
									ctx.warn(
										'before_first_tab',
										`a ${node.type} is in no tab`,
										node
									);
							},
						},
					},
				})
			);
			expect(
				out.dispatcher!.warnings?.map((w) => w.message),
				name
			).toEqual(['a paragraph is in no tab']);
		}
	});

	it('gives its index back when the child it ran for is revoked', () => {
		// fed in pieces, the element opens in a paragraph that is revoked at its
		// close and the handler runs for it then, a whole parse opens no paragraph
		for (const [name, run] of PATHS) {
			const log: string[] = [];
			run(
				':::box\none\n\n<Widget />\n\ntwo\n:::\n',
				bound({
					box: {
						children: {
							'*': (node, ctx) => {
								log.push(`${ctx.index} ${node.type}`);
								ctx.state.last = ctx.index;
							},
						},
						parse: (_node, ctx) => () => log.push('last ' + ctx.state.last),
					},
				})
			);
			// the paragraph gave its 1 back to the element it held
			const whole = ['0 paragraph', '1 html', '2 paragraph', 'last 2'];
			const fed = [whole[0], '1 paragraph', ...whole.slice(1)];
			expect([fed, whole], name).toContainEqual(log);
		}
	});

	it('alone on an entry is enough to bind it', () => {
		const { log } = expect_parity_logged(':::box\na\n:::\n', (log) =>
			bound({ box: { children: { '*': (node) => void log.push(node.type) } } })
		);
		expect(log).toEqual(['paragraph']);
	});
});

describe('where the any key is not allowed', () => {
	const run = (entry: DirectiveEntry) =>
		expect_parity(':::box\na\n:::\n', () => bound({ box: entry }));
	const handler: DirectiveHandler = () => {};

	it('throws in descendants', () => {
		expect(() => run({ descendants: { '*': handler } })).toThrow(
			'only the children handlers of a directive take "*", directive "box" has it in its descendants handlers'
		);
	});

	it('throws for a handler that is no function', () => {
		expect(() => run({ children: { '*': {} as any } })).toThrow(
			'the children.* handler of directive "box" must be a function'
		);
	});
});
