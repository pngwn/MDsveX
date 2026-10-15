import { describe, expect, it } from 'vitest';

import { PluginAsyncError, PluginCache } from '../src/main';
import type { NodeView } from '../src/node_view';
import type { ParsePlugin, PluginDocument } from '../src/plugin_types';
import { PATHS, run_batch, shape } from './plugin_harness';
import type { PluginRun, Plugins } from './plugin_harness';

const ticks = async (n = 5) => {
	for (let i = 0; i < n; i++) await Promise.resolve();
};

/** runs a path and finishes it, the tree, data and dependencies it leaves */
async function finished(run: PluginRun) {
	const dispatcher = run.dispatcher!;
	await dispatcher.finish(run.nodes);
	return {
		tree: shape(run.nodes, run.source, 0, {
			attrs: ['count', 'label'],
			merge_text: true,
		}),
		data: dispatcher.data(),
		dependencies: dispatcher.dependencies(),
	};
}

async function every_path(source: string, make: () => Plugins) {
	let first: Awaited<ReturnType<typeof finished>> | undefined;
	for (const [name, run] of PATHS) {
		const out = await finished(run(source, make()));
		if (first === undefined) first = out;
		else expect(out, `${name} against ${PATHS[0][0]}`).toEqual(first);
	}
	return first!;
}

/** every heading in the document, a hook walks the tree it is given */
function headings(root: NodeView): NodeView[] {
	const out: NodeView[] = [];
	const walk = (node: NodeView) => {
		for (let child = node.first_child; child !== null; child = child.next) {
			if (child.type === 'heading') out.push(child);
			else walk(child);
		}
	};
	walk(root);
	return out;
}

describe('the document hook', () => {
	it('runs once after the parse, the sequential passes and every task', async () => {
		const order: string[] = [];
		await every_path('# a\n\n# b\n', () => {
			order.length = 0;
			return [
				{
					name: 'p',
					heading: {
						parse(node, ctx) {
							order.push('fused');
							return () =>
								ctx.defer(node, async () => {
									await ticks(2);
									order.push('task');
								});
						},
					},
					document() {
						order.push('document');
					},
				},
				{
					name: 'q',
					sequential: true,
					heading: { parse: () => void order.push('sequential') },
				},
			];
		});
		expect(order).toEqual([
			'fused',
			'fused',
			'sequential',
			'sequential',
			'task',
			'task',
			'document',
		]);
	});

	it('sees the whole tree and writes data that belongs to no node', async () => {
		const out = await every_path('# a\n\n## b\n', () => [
			{
				name: 'outline',
				document(root, ctx) {
					const found = headings(root);
					for (const heading of found) ctx.add('depths', heading.depth!);
					root.first_child!.attrs.count = String(found.length);
				},
			},
		]);
		expect(out.data).toEqual({ outline: { depths: [1, 2] } });
		expect(out.tree).toEqual([
			'root',
			['heading count="2"', 'text:a'],
			['heading', 'text:b'],
		]);
	});

	it('hooks run in plugin order, each awaited before the next', async () => {
		const order: string[] = [];
		await every_path('# a\n', () => {
			order.length = 0;
			return [
				{
					name: 'slow',
					async document(_root, ctx) {
						order.push('slow start');
						await ticks(3);
						// still its own while it waits
						ctx.set('done', true);
						order.push('slow end');
					},
				},
				{ name: 'fast', document: () => void order.push('fast') },
			];
		});
		expect(order).toEqual(['slow start', 'slow end', 'fast']);
	});

	it('finish is undefined when everything ran at once', () => {
		const out = run_batch('# a\n', [
			{ name: 'p', document: (_r, ctx) => ctx.set('ran', true) },
		]);
		expect(out.dispatcher!.finish(out.nodes)).toBeUndefined();
		expect(out.dispatcher!.data()).toEqual({ p: { ran: true } });
	});

	it('one that returns a promise where nothing can wait is a PluginAsyncError', () => {
		const out = run_batch('# a\n', {
			plugins: [{ name: 'p', document: async () => {} }],
			setup: (d) => {
				d.allow_async = false;
				d.async_hint = 'wait elsewhere';
			},
		});
		expect(() => out.dispatcher!.finish(out.nodes)).toThrow(PluginAsyncError);
		expect(() => out.dispatcher!.finish(out.nodes)).toThrow(
			'the document hook of plugin "p" returned a promise, and this parse can not wait for async work, wait elsewhere'
		);
	});

	it('defers nothing, it runs after every task', async () => {
		const out = run_batch('# a\n', [
			{ name: 'p', document: (root, ctx) => ctx.defer(root, async () => {}) },
		]);
		expect(() => out.dispatcher!.finish(out.nodes)).toThrow(
			'a document hook runs after every task'
		);
	});

	it('must be a function', () => {
		expect(() =>
			run_batch('# a\n', [{ name: 'p', document: true as never }])
		).toThrow('the document hook of a plugin must be a function');
	});

	it('an error of a hook rejects finish as it is', async () => {
		const out = run_batch('# a\n', [
			{
				name: 'p',
				async document() {
					throw new Error('no index');
				},
			},
		]);
		await expect(out.dispatcher!.finish(out.nodes)).rejects.toThrow('no index');
	});
});

describe('ctx.depend', () => {
	it('collects absolute paths, each once, from handlers, tasks and hooks', async () => {
		const out = await every_path('# a\n\n# b\n', () => [
			{
				name: 'p',
				heading: {
					parse(node, ctx) {
						ctx.depend('/refs.bib');
						return () =>
							ctx.defer(node, (_n, task) => task.depend('/C:/data.json'));
					},
				},
				document: (_root, ctx) => ctx.depend('C:\\win\\file.txt'),
			},
		]);
		expect(out.dependencies).toEqual([
			'/refs.bib',
			'/C:/data.json',
			'C:\\win\\file.txt',
		]);
	});

	it('a relative path is a TypeError', () => {
		expect(() =>
			run_batch('# a\n', [
				{ name: 'p', heading: { parse: (_n, ctx) => ctx.depend('refs.bib') } },
			])
		).toThrow('ctx.depend takes an absolute path, got "refs.bib"');
	});

	it('a document with none has undefined, and a reset forgets them', () => {
		const out = run_batch('# a\n', [
			{ name: 'p', heading: { parse: (_n, ctx) => ctx.depend('/a') } },
		]);
		expect(out.dispatcher!.dependencies()).toEqual(['/a']);
		out.dispatcher!.reset();
		expect(out.dispatcher!.dependencies()).toBeUndefined();
	});
});

describe('ctx.read and ctx.resolve', () => {
	const files: Record<string, string> = { '/docs/refs.bib': 'smith2020' };
	const document: PluginDocument = {
		filename: '/docs/post.svx',
		read: async (path) => {
			const text = files[path];
			if (text === undefined) throw new Error(`no file ${path}`);
			return text;
		},
		resolve: (spec, from) =>
			spec.startsWith('./') ? from!.replace(/[^/]+$/, spec.slice(2)) : null,
	};

	it('read with the reader of the host, the path is a dependency', async () => {
		const out = await every_path('# a\n', () => ({
			plugins: [
				{
					name: 'cite',
					heading: {
						parse(node, ctx) {
							return () =>
								ctx.defer(node, async (heading, task) => {
									const path = await task.resolve('./refs.bib');
									heading.attrs.label = await task.read(path!);
								});
						},
					},
				},
			],
			document,
		}));
		expect(out.tree).toEqual(['root', ['heading label="smith2020"', 'text:a']]);
		expect(out.dependencies).toEqual(['/docs/refs.bib']);
	});

	it('resolve gives null when nothing matches', async () => {
		let found: unknown = 'unset';
		await every_path('# a\n', () => ({
			plugins: [
				{
					name: 'p',
					document: async (_root, ctx) => {
						found = await ctx.resolve('bare');
					},
				},
			],
			document,
		}));
		expect(found).toBeNull();
	});

	it('without a reader or a resolver they throw a TypeError', () => {
		for (const call of ['read', 'resolve'] as const) {
			expect(() =>
				run_batch('# a\n', [
					{
						name: 'p',
						heading: { parse: (_n, ctx) => void ctx[call]('/a') },
					},
				])
			).toThrow(`ctx.${call} needs a`);
		}
	});
});

describe('ctx.cached', () => {
	it('shares one load between the documents of one cache, and makes a path key a dependency', async () => {
		const cache = new PluginCache();
		let loads = 0;
		const plugin = (): ParsePlugin => ({
			name: 'bib',
			heading: {
				parse(node, ctx) {
					return () =>
						ctx.defer(node, async (heading, task) => {
							heading.attrs.label = await task.cached('/refs.bib', async () => {
								loads++;
								await ticks(2);
								return 'loaded';
							});
						});
				},
			},
		});
		for (const [name, run] of PATHS) {
			const out = await finished(
				run('# a\n\n# b\n', { plugins: [plugin()], document: { cache } })
			);
			expect(out.dependencies, name).toEqual(['/refs.bib']);
			expect(out.tree, name).toEqual([
				'root',
				['heading label="loaded"', 'text:a'],
				['heading label="loaded"', 'text:b'],
			]);
		}
		expect(loads).toBe(1);
		cache.invalidate(['/refs.bib']);
		await finished(
			run_batch('# c\n', { plugins: [plugin()], document: { cache } })
		);
		expect(loads).toBe(2);
	});

	it('a load that rejects is not kept, and the cache is by plugin name', async () => {
		const cache = new PluginCache();
		let tries = 0;
		const failing = () =>
			cache.get('a', 'k', async () => {
				tries++;
				throw new Error('offline');
			});
		await expect(failing()).rejects.toThrow('offline');
		await expect(failing()).rejects.toThrow('offline');
		expect(tries).toBe(2);
		expect(await cache.get('a', 'x', () => 1)).toBe(1);
		expect(await cache.get('b', 'x', () => 2)).toBe(2);
	});

	it('a key that is not a path is no dependency and invalidate leaves it', async () => {
		const cache = new PluginCache();
		let loads = 0;
		const out = run_batch('# a\n', {
			plugins: [
				{
					name: 'p',
					document: async (_root, ctx) => {
						await ctx.cached('https://example.com/a', () => loads++);
					},
				},
			],
			document: { cache },
		});
		await out.dispatcher!.finish(out.nodes);
		expect(out.dispatcher!.dependencies()).toBeUndefined();
		cache.invalidate(['https://example.com/a']);
		expect(await cache.get('p', 'https://example.com/a', () => 9)).toBe(0);
	});

	it('needs a plugin name', () => {
		expect(() =>
			run_batch('# a\n', [
				{ heading: { parse: (_n, ctx) => void ctx.cached('k', () => 1) } },
			])
		).toThrow('give the plugin a name');
	});
});
