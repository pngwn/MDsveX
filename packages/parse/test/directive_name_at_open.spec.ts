import { describe, expect, it } from 'vitest';

import { NodeKind } from '../src/main';
import { SourceTextSource, WireTextSource } from '../src/node_view';
import type { NodeView, WrapperView } from '../src/node_view';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type { DirectiveHandlers, ParsePlugin } from '../src/plugin_types';
import { TreeBuilder } from '../src/tree_builder';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import {
	expect_parity,
	expect_parity_logged,
	type PluginSetup,
} from './plugin_harness';

const NAMED = { attrs: ['name'] };

/** logs what every directive holds when its handler runs and when it closes */
function names(log: string[]): ParsePlugin {
	const parse = (node: NodeView) => {
		const args = node.attrs.args;
		log.push(
			`open ${node.type} ${node.attrs.name}` +
				(args === undefined ? '' : ' ' + JSON.stringify(args))
		);
		return () => {
			const closed = node.attrs.args;
			log.push(
				`close ${node.attrs.name}` +
					(closed === undefined ? '' : ' ' + JSON.stringify(closed))
			);
		};
	};
	return {
		directive_container: { parse },
		directive_leaf: { parse },
		directive_inline: { parse },
	};
}

describe('a directive in its open handlers', () => {
	it('has its name, and a block directive its args', () => {
		const { log } = expect_parity_logged(
			':::note[Title](kind=tip)\nBody :badge[new](tone=info) here.\n:::\n\n::rule[x](width=2)\n',
			(log) => [names(log)]
		);
		expect(log).toEqual([
			'open directive_container note {"kind":"tip"}',
			// the args of an inline directive follow its closing bracket
			'open directive_inline badge',
			'close badge {"tone":"info"}',
			'close note {"kind":"tip"}',
			'open directive_leaf rule {"width":"2"}',
			'close rule {"width":"2"}',
		]);
	});

	it('has its name when it is written without brackets', () => {
		const { log } = expect_parity_logged(
			':::note\nBody\n:::\n\n::rule\n',
			(log) => [names(log)]
		);
		expect(log).toEqual([
			'open directive_container note',
			'close note',
			'open directive_leaf rule',
			'close rule',
		]);
	});

	it('has it in a handler bound to the directive around it', () => {
		const { log } = expect_parity_logged(
			'::::tabs\n:::tab[One]\na :kbd[x] b\n:::\n\n::rule\n::::\n',
			(log): PluginSetup => ({
				directive_handlers: [
					{
						tabs: {
							children: {
								directive_container: (node, ctx) => {
									log.push(`child ${ctx.index} ${node.attrs.name}`);
								},
								directive_leaf: (node) => {
									log.push(`leaf ${node.attrs.name}`);
								},
							},
							descendants: {
								directive_inline: (node) => {
									log.push(`inline ${node.attrs.name}`);
								},
							},
						},
					},
				],
			})
		);
		expect(log).toEqual(['child 0 tab', 'inline kbd', 'leaf rule']);
	});

	it('runs the handlers around it, then the global ones, then its own parse', () => {
		const { log } = expect_parity_logged(
			'::::box\n:::tabs(sync=os)\n:::\n::::\n',
			(log): PluginSetup => ({
				plugins: [
					{
						directive_container: {
							parse(node) {
								log.push('global ' + node.attrs.name);
								return () => log.push('global close ' + node.attrs.name);
							},
						},
					},
				],
				directive_handlers: [
					{
						box: {
							children: {
								directive_container: (node) => {
									log.push('child of box ' + node.attrs.name);
									return () => log.push('child of box closed');
								},
							},
						},
						tabs: {
							parse: (node) => {
								log.push(
									'parse ' + node.attrs.name + ' ' + node.attrs.args.sync
								);
								return () => log.push('parse close');
							},
						},
					},
				],
			})
		);
		expect(log).toEqual([
			'global box',
			'child of box tabs',
			'global tabs',
			'parse tabs os',
			'parse close',
			'child of box closed',
			'global close tabs',
			'global close box',
		]);
	});

	it('lets a written out tab close the tab a heading opened', () => {
		// headings and :::tab both start a tab, the open one is closed by name
		const tabs = (): DirectiveHandlers => ({
			tabs: {
				children: {
					heading(node, ctx) {
						(ctx.state.tab as WrapperView | undefined)?.close();
						ctx.state.tab = node.wrap_from('directive_container', {
							name: 'tab',
						});
					},
					directive_container(node, ctx) {
						if (node.attrs.name !== 'tab') return;
						(ctx.state.tab as WrapperView | undefined)?.close();
						ctx.state.tab = undefined;
					},
				},
			},
		});
		const tree = expect_parity(
			'::::tabs\n## One\n\nfirst\n\n:::tab[Two]\nsecond\n:::\n\n:::note\nkept\n:::\n::::\n',
			() => ({ directive_handlers: [tabs()] }),
			NAMED
		);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="tabs"',
				[
					'directive_container name="tab"',
					['heading', 'text:One'],
					['paragraph', 'text:first'],
				],
				[
					'directive_container name="tab"',
					['directive_label', 'text:Two'],
					['paragraph', 'text:second'],
				],
				['directive_container name="note"', ['paragraph', 'text:kept']],
			],
		]);
	});

	it('can wrap its content by name before any of it arrives', () => {
		const tree = expect_parity(
			':::note\nBody\n:::\n\n:::plain\nBody\n:::\n',
			() => [
				{
					directive_container: {
						parse(node) {
							if (node.attrs.name === 'note')
								node.wrap_inner('html', { tag: 'aside' });
						},
					},
				},
			],
			{ attrs: ['name', 'tag'] }
		);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="note"',
				['html tag="aside"', ['paragraph', 'text:Body']],
			],
			['directive_container name="plain"', ['paragraph', 'text:Body']],
		]);
	});

	it('is undone with an inline directive whose bracket never closes', () => {
		const { tree, log } = expect_parity_logged(
			'a :kbd[b c\n\nd :kbd[e] f\n',
			(log) => [
				{
					directive_inline: {
						parse(node) {
							log.push('open ' + node.attrs.name);
							node.attrs.seen = node.attrs.name;
							node.prepend('text', '<');
							return () => log.push('close ' + node.attrs.name);
						},
					},
				},
			],
			{ attrs: ['name', 'seen'] }
		);
		expect(log).toEqual(['open kbd', 'open kbd', 'close kbd']);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:a :kbd[b c'],
			[
				'paragraph',
				'text:d ',
				['directive_inline name="kbd" seen="kbd"', 'text:<e'],
				'text: f',
			],
		]);
	});
});

describe('a directive that gets no name', () => {
	const logged = (log: string[]): ParsePlugin => ({
		directive_container: {
			parse(node) {
				log.push('open ' + node.attrs.name);
				return () => log.push('close');
			},
		},
		paragraph: {
			parse() {
				log.push('paragraph');
			},
		},
	});

	it('runs its open handlers before the next node of a batch builder', () => {
		const log: string[] = [];
		const dispatcher = new PluginDispatcher(
			[logged(log)],
			new SourceTextSource('')
		);
		const tree = new TreeBuilder(16, dispatcher);
		tree.open(1, NodeKind.directive_container, 0, 0, 0, false);
		expect(log).toEqual([]);
		tree.open(2, NodeKind.paragraph, 0, 1, 0, false);
		tree.close(2, 1, NodeKind.paragraph);
		tree.close(1, 1, NodeKind.directive_container);
		expect(log).toEqual(['open undefined', 'paragraph', 'close']);
		expect(dispatcher.quiet()).toBe(true);
	});

	it('runs them before its own close', () => {
		const log: string[] = [];
		const dispatcher = new PluginDispatcher(
			[logged(log)],
			new SourceTextSource('')
		);
		const tree = new TreeBuilder(16, dispatcher);
		tree.open(1, NodeKind.directive_container, 0, 0, 0, false);
		tree.close(1, 1, NodeKind.directive_container);
		expect(log).toEqual(['open undefined', 'close']);
		expect(dispatcher.quiet()).toBe(true);
	});

	it('runs them over the wire too, where a name can come in a later batch', () => {
		const log: string[] = [];
		const dispatcher = new PluginDispatcher(
			[logged(log)],
			new WireTextSource([])
		);
		const builder = new WireTreeBuilder(16, dispatcher);
		const container = NodeKind.directive_container;
		builder.apply([['O', 1, container, 0, 0, 0]]);
		expect(log).toEqual([]);
		builder.apply([
			['A', 1, 'name', 'late'],
			['C', 1],
			['O', 2, container, 0, 0, 0],
			['C', 2],
		]);
		expect(log).toEqual(['open late', 'close', 'open undefined', 'close']);
		expect(dispatcher.quiet()).toBe(true);
	});
});
