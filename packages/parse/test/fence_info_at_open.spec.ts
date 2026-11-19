import { describe, expect, it } from 'vitest';

import { NodeKind } from '../src/main';
import { SourceTextSource, WireTextSource } from '../src/node_view';
import type { WrapperView } from '../src/node_view';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type { ParsePlugin } from '../src/plugin_types';
import { TreeBuilder } from '../src/tree_builder';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import {
	expect_parity,
	expect_parity_logged,
	type PluginSetup,
} from './plugin_harness';

/** logs the info string a fence has when its handler runs and when it closes */
const fences = (log: string[]): ParsePlugin => ({
	code_fence: {
		parse(node) {
			log.push(`open ${JSON.stringify(node.info)}`);
			return () =>
				log.push(
					`close ${JSON.stringify(node.info)} ${node.text_content.length}`
				);
		},
	},
});

describe('a code fence in its open handlers', () => {
	it.each([
		[
			'a language and meta',
			'```ts title="a.ts" {1,3}\nlet a;\n```\n',
			'ts title="a.ts" {1,3}',
			6,
		],
		['a language alone', '```js\nlet a;\n```\n', 'js', 6],
		['no info string', '```\nlet a;\n```\n', '', 6],
		['no code', '```js\n```\n', 'js', 0],
		['neither', '```\n```\n', '', 0],
		['a longer fence', '````md [x]\n```js\n```\n````\n', 'md [x]', 9],
		['no closing fence', '```js\nlet a;\n', 'js', 7],
		['an info string at the end of input', '```js', 'js', 0],
		['only its fence', '```', '', 0],
	])('has its info string with %s', (_name, source, info, length) => {
		const { log } = expect_parity_logged(source, (log) => [fences(log)]);
		const text = JSON.stringify(info);
		expect(log).toEqual([`open ${text}`, `close ${text} ${length}`]);
	});

	it('has it wherever the fence is written', () => {
		const { log } = expect_parity_logged(
			'- item\n\n  ```a one\n  x\n  ```\n\n> ```b two\n> y\n> ```\n\n:::box\n```c three\nz\n```\n:::\n',
			(log) => [fences(log)]
		);
		expect(log.filter((line) => line.startsWith('open'))).toEqual([
			'open "a one"',
			'open "b two"',
			'open "c three"',
		]);
	});

	it('runs in document order with the handlers of the nodes around it', () => {
		const { log } = expect_parity_logged(
			'before\n\n```js\ncode\n```\n\nafter\n\n```\nmore\n```\n\nlast\n',
			(log) => [
				{
					paragraph: {
						parse(node) {
							return () => log.push('paragraph ' + node.text_content);
						},
					},
					code_fence: {
						parse(node) {
							log.push('fence ' + node.info);
							return () => log.push('fence closed');
						},
					},
				},
			]
		);
		expect(log).toEqual([
			'paragraph before',
			'fence js',
			'fence closed',
			'paragraph after',
			'fence ',
			'fence closed',
			'paragraph last',
		]);
	});

	it('is the same string as lang, and undefined on any other node', () => {
		const { log } = expect_parity_logged('# T\n\n```js x\n```\n', (log) => [
			{
				heading: {
					parse(node) {
						log.push(`heading ${node.info} ${node.lang}`);
					},
				},
				code_fence: {
					parse(node) {
						log.push(`fence ${node.info} | ${node.lang}`);
					},
				},
			},
		]);
		expect(log).toEqual(['heading undefined undefined', 'fence js x | js x']);
	});

	it('lets a handler bound to a directive group fences by their info string', () => {
		const tree = expect_parity(
			':::tabs\n```js [app.js]\na\n```\n\n```\nb\n```\n\n```css\nc\n```\n:::\n',
			(): PluginSetup => ({
				directive_handlers: [
					{
						tabs: {
							children: {
								code_fence(node, ctx) {
									(ctx.state.tab as WrapperView | undefined)?.close();
									const info = node.info!;
									const label = /\[(.+)\]/.exec(info)?.[1] ?? info;
									ctx.state.tab = node.wrap_from('directive_container', {
										name: 'tab',
										args: {
											title: label === '' ? String(ctx.index + 1) : label,
										},
									});
								},
							},
						},
					},
				],
			}),
			{ attrs: ['name', 'args'] }
		);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="tabs"',
				[
					'directive_container name="tab" args={"title":"app.js"}',
					'code_fence',
				],
				['directive_container name="tab" args={"title":"2"}', 'code_fence'],
				['directive_container name="tab" args={"title":"css"}', 'code_fence'],
			],
		]);
	});
});

describe('a code fence that is sent no info string', () => {
	it('runs its open handlers before its close on a batch builder', () => {
		const log: string[] = [];
		const dispatcher = new PluginDispatcher(
			[fences(log)],
			new SourceTextSource('')
		);
		const tree = new TreeBuilder(16, dispatcher);
		tree.open(1, NodeKind.code_fence, 0, 0, 0, false);
		expect(log).toEqual([]);
		tree.close(1, 1, NodeKind.code_fence);
		expect(log).toEqual(['open ""', 'close "" 0']);
		expect(dispatcher.quiet()).toBe(true);
	});

	it('runs them at its text over the wire, or at its info string in a later batch', () => {
		const log: string[] = [];
		const dispatcher = new PluginDispatcher(
			[fences(log)],
			new WireTextSource([])
		);
		const builder = new WireTreeBuilder(16, dispatcher);
		const fence = NodeKind.code_fence;
		builder.apply([['O', 1, fence, 0, 0, 0]]);
		expect(log).toEqual([]);
		builder.apply([['T', 1, 'code']]);
		expect(log).toEqual(['open ""']);
		builder.apply([
			['C', 1],
			['O', 2, fence, 0, 0, 0],
		]);
		builder.apply([['A', 2, 'info', 'js late']]);
		expect(log).toEqual(['open ""', 'close "" 4', 'open "js late"']);
		builder.apply([
			['T', 2, 'x'],
			['C', 2],
		]);
		expect(log[3]).toBe('close "js late" 1');
		expect(dispatcher.quiet()).toBe(true);
	});
});
