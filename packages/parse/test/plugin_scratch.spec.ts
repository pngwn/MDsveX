import { describe, expect, it } from 'vitest';

import { PFMParser } from '../src/main';
import type { DataChange } from '../src/main';
import { SourceTextSource } from '../src/node_view';
import type { NodeView } from '../src/node_view';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type { ParsePlugin } from '../src/plugin_types';
import { TreeBuilder } from '../src/tree_builder';
import { PATHS } from './plugin_harness';
import type { Plugins } from './plugin_harness';

const ticks = async (n = 5) => {
	for (let i = 0; i < n; i++) await Promise.resolve();
};

/**
 * runs every path to its end, document hooks included, and expects each to
 * leave the same log and data, returns those of the first
 */
async function every_path(
	source: string,
	make: (log: unknown[]) => Plugins
): Promise<{ log: unknown[]; data: unknown; changes: DataChange[] }> {
	let first: { log: unknown[]; data: unknown; changes: DataChange[] } | null =
		null;
	for (const [name, run] of PATHS) {
		const log: unknown[] = [];
		const changes: DataChange[] = [];
		const out = run(source, make(log));
		const dispatcher = out.dispatcher!;
		dispatcher.on_data((change) => changes.push(change));
		await dispatcher.finish(out.nodes);
		const now = { log, data: dispatcher.data(), changes };
		if (first === null) first = now;
		else expect(now, `${name} against ${PATHS[0][0]}`).toEqual(first);
	}
	return first!;
}

describe('ctx.scratch', () => {
	it('is one object for every handler of a plugin in a document', async () => {
		const { log } = await every_path(
			'# a\n\n:::box\n## b\n:::\n\nc *d*\n',
			(log) => {
				const seen = new Set<object>();
				const note = (where: string, scratch: Record<string, any>) => {
					seen.add(scratch);
					(scratch.where ??= []).push(where);
				};
				return {
					plugins: [
						{
							name: 'p',
							heading: {
								parse(node, ctx) {
									note('open', ctx.scratch);
									return () => {
										note('close', ctx.scratch);
										ctx.defer(node, async (_node, task) => {
											await ticks(2);
											note('task', task.scratch);
										});
									};
								},
							},
							document(_root, ctx) {
								note('document', ctx.scratch);
								log.push(seen.size, ...ctx.scratch.where);
							},
						},
						{
							name: 'p',
							sequential: true,
							strong_emphasis: {
								parse: (_node, ctx) => note('sequential', ctx.scratch),
							},
						},
					],
					directive_handlers: [
						{
							name: 'p',
							directives: {
								box: {
									parse: (_node, ctx) => note('bound', ctx.scratch),
									children: {
										heading: (_node, ctx) => note('child', ctx.scratch),
									},
								},
							},
						},
					],
				};
			}
		);
		expect(log).toEqual([
			1,
			'open',
			'close',
			'bound',
			'child',
			'open',
			'close',
			'sequential',
			'task',
			'task',
			'document',
		]);
	});

	it('is one per plugin name, a bundle and its directives share it', async () => {
		const { log } = await every_path('# a\n', (log) => {
			const named = (name: string): ParsePlugin => ({
				name,
				heading: { parse: (_node, ctx) => void log.push(ctx.scratch) },
			});
			return [named('p'), named('q'), named('p')];
		});
		expect(log).toHaveLength(3);
		expect(log[0]).toBe(log[2]);
		expect(log[0]).not.toBe(log[1]);
	});

	it('is never data, a document that only uses it leaves none', async () => {
		const { data, changes } = await every_path('# a\n\n# b\n', () => [
			{
				name: 'p',
				heading: {
					parse(node, ctx) {
						return () => {
							ctx.scratch.count = (ctx.scratch.count ?? 0) + 1;
							ctx.scratch.last = node;
						};
					},
				},
			},
		]);
		expect(data).toBeUndefined();
		expect(changes).toEqual([]);
	});

	it('keeps nodes the document hook can read', async () => {
		const { log } = await every_path(
			'::list\n\n> ::list\n\n- ::list\n',
			(log) => ({
				plugins: [
					{
						name: 'c',
						document(_root, ctx) {
							for (const list of ctx.scratch.lists as NodeView[])
								log.push(list.type, list.attrs.name, list.parent!.type);
						},
					},
				],
				directive_handlers: [
					{
						name: 'c',
						directives: {
							list: {
								parse(node, ctx) {
									const lists: NodeView[] = (ctx.scratch.lists ??= []);
									log.push(lists.length > 0 ? 'after' : 'first');
									lists.push(node);
								},
							},
						},
					},
				],
			})
		);
		expect(log).toEqual([
			'first',
			'after',
			'after',
			'directive_leaf',
			'list',
			'root',
			'directive_leaf',
			'list',
			'block_quote',
			'directive_leaf',
			'list',
			'list_item',
		]);
	});

	it('throws for a plugin with no name', () => {
		for (const [name, run] of PATHS) {
			expect(
				() =>
					run('# a\n', [
						{ heading: { parse: (_node, ctx) => void ctx.scratch } },
					]),
				name
			).toThrow('ctx.scratch is kept by plugin name');
		}
	});

	it('starts empty for each document', () => {
		const seen: unknown[] = [];
		const dispatcher = new PluginDispatcher(
			[
				{
					name: 'p',
					heading: {
						parse: (_node, ctx) => {
							seen.push({ ...ctx.scratch });
							ctx.scratch.headings = (ctx.scratch.headings ?? 0) + 1;
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
		for (const source of ['# a\n\n# b\n', '# c\n']) {
			text.set_source(source);
			parser.parse(source);
			tree.reset();
		}
		expect(seen).toEqual([{}, { headings: 1 }, {}]);
	});
});

describe('ctx.scratch and revocation', () => {
	it('keeps the write of a node the parser revokes', async () => {
		// the emphasis never closes and is revoked, its data goes
		const { log, data } = await every_path('x *y z\n', (log) => [
			{
				name: 'p',
				strong_emphasis: {
					parse(_node, ctx) {
						ctx.set('opened', true);
						ctx.scratch.opened = (ctx.scratch.opened ?? 0) + 1;
					},
				},
				document(_root, ctx) {
					log.push(ctx.scratch.opened);
				},
			},
		]);
		expect(log).toEqual([1]);
		expect(data).toBeUndefined();
	});

	it('keeps the write of a tight list paragraph, which is revoked after its close', async () => {
		const { log, data } = await every_path('- a\n- b\n\n# c\n', (log) => [
			{
				name: 'p',
				paragraph: {
					parse(_node, ctx) {
						return () => {
							ctx.add('closed', 1);
							ctx.scratch.closed = (ctx.scratch.closed ?? 0) + 1;
						};
					},
				},
				document(_root, ctx) {
					log.push(ctx.scratch.closed);
				},
			},
		]);
		expect(log).toEqual([2]);
		expect(data).toBeUndefined();
	});

	it('keeps the write of a task whose node is revoked, its other changes go', async () => {
		const { log, data } = await every_path('x *y z\n', (log) => [
			{
				name: 'p',
				strong_emphasis: {
					parse(node, ctx) {
						ctx.defer(node, async (_node, task) => {
							task.scratch.ran = true;
							task.set('ran', true);
						});
					},
				},
				document(_root, ctx) {
					log.push(ctx.scratch.ran);
				},
			},
		]);
		expect(log).toEqual([true]);
		expect(data).toBeUndefined();
	});
});
