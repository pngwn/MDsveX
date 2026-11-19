import { describe, expect, it } from 'vitest';

import { PluginAsyncError, PluginTaskError } from '../src/main';
import type { NodeView } from '../src/node_view';
import type {
	ParsePlugin,
	PluginContext,
	PluginData,
	PluginWarning,
	TaskContext,
} from '../src/plugin_types';
import {
	PATHS,
	expect_linked,
	run_batch,
	run_wire,
	shape,
} from './plugin_harness';
import type { PluginRun, Plugins } from './plugin_harness';

const ATTRS = ['label', 'who', 'id', 'tag'] as const;

/** a promise and the function that resolves it */
function gate(): { wait: Promise<void>; open: () => void } {
	let open!: () => void;
	const wait = new Promise<void>((resolve) => (open = resolve));
	return { wait, open };
}

/** lets every task that waits on nothing run to its end */
const ticks = async (n = 5) => {
	for (let i = 0; i < n; i++) await Promise.resolve();
};

/** a plugin that defers a task from the close callback of a kind */
function deferring(
	type: string,
	task: (
		node: NodeView,
		ctx: TaskContext,
		outer: NodeView
	) => Promise<void> | void,
	name = 'p',
	when: 'open' | 'close' = 'close'
): ParsePlugin {
	return {
		name,
		[type]: {
			parse(node: NodeView, ctx: PluginContext) {
				const go = () => ctx.defer(node, (own, c) => task(own, c, node));
				if (when === 'open') go();
				else return go;
			},
		},
	};
}

interface Settled {
	tree: unknown;
	data: PluginData | undefined;
	warnings: PluginWarning[] | undefined;
}

/** runs a path, settles its tasks, and gives the tree, data and warnings */
async function settled(run: PluginRun): Promise<Settled> {
	const dispatcher = run.dispatcher!;
	await dispatcher.settle();
	expect_linked(run.nodes);
	// a revoked node took its tasks with it, nothing is left waiting
	expect(dispatcher.deferred).toBe(false);
	expect(dispatcher.quiet()).toBe(true);
	return {
		tree: shape(run.nodes, run.source, 0, { attrs: ATTRS, merge_text: true }),
		data: dispatcher.data(),
		warnings: dispatcher.warnings?.map((w) => ({
			...w,
			start: undefined,
			end: undefined,
		})),
	};
}

/** every path settles to the same tree, data and warnings, which it returns */
async function every_path(
	source: string,
	make: () => Plugins
): Promise<Settled> {
	let first: Settled | undefined;
	for (const [name, run] of PATHS) {
		const out = await settled(run(source, make()));
		if (first === undefined) first = out;
		else expect(out, `${name} against ${PATHS[0][0]}`).toEqual(first);
	}
	return first!;
}

describe('ctx.defer', () => {
	it('applies what the task did once it settled, not before', async () => {
		for (const [name, run] of PATHS) {
			const out = run('# a\n', [
				deferring('heading', async (node, ctx) => {
					await ticks(1);
					node.attrs.label = 'done';
					node.append('text', '!');
					ctx.set('k', 'v');
				}),
			]);
			const dispatcher = out.dispatcher!;
			expect(dispatcher.deferred, name).toBe(true);
			const before = shape(out.nodes, out.source, 0, { attrs: ATTRS });
			await ticks();
			// settled, but nothing applies until the host asks
			expect(shape(out.nodes, out.source, 0, { attrs: ATTRS }), name).toEqual(
				before
			);
			expect(dispatcher.data(), name).toBeUndefined();
			await dispatcher.settle();
			expect(dispatcher.deferred, name).toBe(false);
			expect(
				shape(out.nodes, out.source, 0, { attrs: ATTRS, merge_text: true }),
				name
			).toEqual(['root', ['heading label="done"', 'text:a!']]);
			expect(dispatcher.data(), name).toEqual({ p: { k: 'v' } });
		}
	});

	it('settle is undefined for a document with no task', () => {
		const out = run_batch('# a\n', [{ name: 'p', heading: { parse() {} } }]);
		expect(out.dispatcher!.settle()).toBeUndefined();
		expect(out.dispatcher!.deferred).toBe(false);
	});

	it('the task starts at once, in the handler', () => {
		let started = 0;
		run_batch('# a\n\n# b\n', [
			deferring('heading', () => void started++, 'p', 'open'),
		]);
		expect(started).toBe(2);
	});

	it('reads its node as the tree has it and its own writes on top', async () => {
		const seen: unknown[] = [];
		await every_path('# a [b](c)\n', () => [
			deferring('heading', (node) => {
				seen.length = 0;
				seen.push(node.type, node.text_content, node.depth, node.attrs.label);
				node.attrs.label = 'x';
				seen.push(node.attrs.label, 'label' in node.attrs, { ...node.attrs });
				delete node.attrs.label;
				seen.push(node.attrs.label, node.first_child!.type);
				seen.push(node.last_child!.type, node.last_child!.parent!.type);
			}),
		]);
		expect(seen).toEqual([
			'heading',
			'a b',
			1,
			undefined,
			'x',
			true,
			{ label: 'x' },
			undefined,
			'text',
			'link',
			'heading',
		]);
	});

	it('adds nodes, and nodes inside the nodes it added', async () => {
		const out = await every_path('# a\n', () => [
			deferring('heading', async (node) => {
				await ticks(1);
				const span = node.append('html', { tag: 'span' });
				span.append('text', 'new');
				span.attrs.who = 'task';
				node.prepend('text', '> ');
			}),
		]);
		expect(out.tree).toEqual([
			'root',
			['heading', 'text:> a', ['html who="task" tag="span"', 'text:new']],
		]);
	});

	it('removes what is inside its node', async () => {
		const out = await every_path('# a [b](c) d\n', () => [
			deferring('heading', async (node) => {
				await ticks(1);
				let link: NodeView | null = node.first_child;
				while (link !== null && link.type !== 'link') link = link.next;
				link!.remove();
			}),
		]);
		expect(out.tree).toEqual(['root', ['heading', 'text:a  d']]);
	});

	it('writes data owned by its node, in document order', async () => {
		const g1 = gate();
		const out = await every_path('# a\n\n# b\n', () => [
			{
				name: 'p',
				heading: {
					parse(node, ctx) {
						return () => {
							const text = node.text_content;
							ctx.add('seen', 'handler ' + text);
							ctx.defer(node, async (_n, c) => {
								// the first heading's task finishes last
								if (text === 'a') await g1.wait;
								c.add('seen', 'task ' + text);
								c.set('last', text);
							});
							if (text === 'b') setTimeout(g1.open, 0);
						};
					},
				},
			},
		]);
		expect(out.data).toEqual({
			p: {
				seen: ['handler a', 'task a', 'handler b', 'task b'],
				last: 'b',
			},
		});
	});

	it('applies in document order whatever order the tasks finish in', async () => {
		for (const late of ['heading', 'link']) {
			const out = await every_path('# a [b](c)\n', () => {
				const g = gate();
				const link_of = (node: NodeView) => {
					for (let c = node.first_child; c !== null; c = c.next)
						if (c.type === 'link') return c;
					return node;
				};
				return [
					deferring('heading', async (node) => {
						if (late === 'heading') await g.wait;
						link_of(node).attrs.who = 'heading';
						if (late !== 'heading') setTimeout(g.open, 0);
					}),
					deferring('link', async (node) => {
						if (late === 'link') await g.wait;
						node.attrs.who = 'link';
						if (late !== 'link') setTimeout(g.open, 0);
					}),
				];
			});
			// the link is later in the document, its task applies last
			expect(out.tree, late).toEqual([
				'root',
				['heading', 'text:a ', ['link who="link"', 'text:b']],
			]);
		}
	});

	it('warns at its node when it applies', async () => {
		const out = await every_path('# a\n', () => [
			deferring('heading', async (node, ctx) => {
				await ticks(1);
				ctx.warn('late', 'from a task', node);
				ctx.warn('nowhere', 'with no node');
			}),
		]);
		expect(out.warnings).toEqual([
			{
				plugin: 'p',
				code: 'late',
				message: 'from a task',
				start: undefined,
				end: undefined,
			},
			{
				plugin: 'p',
				code: 'nowhere',
				message: 'with no node',
				start: undefined,
				end: undefined,
			},
		]);
		const batch = run_batch('\n# a\n', [
			deferring('heading', (node, ctx) => ctx.warn('at', 'm', node)),
		]);
		await batch.dispatcher!.settle();
		expect(batch.dispatcher!.warnings![0].start).toBe(1);
	});
});

describe('a deferred task and revocation', () => {
	const marks = (type: string, when: 'open' | 'close' = 'open') =>
		deferring(
			type,
			async (node, ctx) => {
				await ticks(1);
				node.attrs.who = 'task';
				ctx.add('marked', type);
			},
			'p',
			when
		);

	it('on a node revoked before it settles goes, with what it did', async () => {
		const out = await every_path('a *b\n', () => [marks('strong_emphasis')]);
		expect(out.data).toBeUndefined();
		expect(JSON.stringify(out.tree)).not.toContain('who');
	});

	it('of a pending node, revoked after its close', async () => {
		const out = await every_path('a *b\n', () => [
			marks('strong_emphasis', 'close'),
		]);
		expect(out.data).toBeUndefined();
	});

	it('an error of a task whose node went is not reported', async () => {
		const out = await every_path('[a] [b](c)\n', () => [
			deferring('link', async (node) => {
				await ticks(1);
				if (node.text_content === 'a') throw new Error('never seen');
				node.attrs.who = 'kept';
			}),
		]);
		expect(out.tree).toEqual([
			'root',
			['paragraph', 'text:[a] ', ['link who="kept"', 'text:b']],
		]);
	});

	it('the paragraphs of a tight list go, those of a loose one stay', async () => {
		expect(
			(await every_path('- a\n- b\n', () => [marks('paragraph', 'close')])).data
		).toBeUndefined();
		expect(
			(await every_path('- a\n\n- b\n', () => [marks('paragraph', 'close')]))
				.data
		).toEqual({ p: { marked: ['paragraph', 'paragraph'] } });
	});

	it('of a node that closes, in its open handler and its close callback', async () => {
		expect(
			(await every_path('a *b*\n', () => [marks('strong_emphasis')])).data
		).toEqual({ p: { marked: ['strong_emphasis'] } });
		expect(
			(await every_path('a *b*\n', () => [marks('strong_emphasis', 'close')]))
				.data
		).toEqual({ p: { marked: ['strong_emphasis'] } });
	});

	it('from a sequential pass, where nothing is pending', async () => {
		const out = await every_path('# a\n', () => [
			{
				name: 'p',
				sequential: true,
				heading: {
					parse(node, ctx) {
						ctx.defer(node, async (n) => {
							await ticks(1);
							n.attrs.who = 'sequential';
						});
					},
				},
			},
		]);
		expect(out.tree).toEqual(['root', ['heading who="sequential"', 'text:a']]);
	});
});

describe('what a deferred task may change', () => {
	/** the error settle rejects with on the batch path */
	const failure = async (plugin: ParsePlugin): Promise<PluginTaskError> => {
		const out = run_batch('\n# a [b](c)\n', [plugin]);
		try {
			await out.dispatcher!.settle();
		} catch (e) {
			return e as PluginTaskError;
		}
		throw new Error('settle did not reject');
	};

	it('a task that rejects fails settle with the plugin, the node and the cause', async () => {
		const cause = new Error('no such entry');
		const error = await failure(
			deferring('heading', async () => {
				await ticks(1);
				throw cause;
			})
		);
		expect(error).toBeInstanceOf(PluginTaskError);
		expect(error.plugin).toBe('p');
		expect(error.cause).toBe(cause);
		expect(error.position!.start).toEqual({ offset: 1, line: 2, column: 0 });
		expect(error.message).toBe(
			'a task plugin "p" deferred on the heading node at line 2, column 0 failed: no such entry'
		);
	});

	it('a node outside its own is a TypeError', async () => {
		const error = await failure(
			deferring('link', async (node) => {
				await ticks(1);
				node.parent!.attrs.who = 'link';
			})
		);
		expect(error.cause).toBeInstanceOf(TypeError);
		expect((error.cause as Error).message).toContain(
			'changes the node it was deferred on and what is inside it'
		);
	});

	it('so are wrap_from, and removing its own node', async () => {
		const wrap = await failure(
			deferring('heading', (node) => void node.wrap_from('html'))
		);
		expect(wrap.cause).toBeInstanceOf(TypeError);
		const remove = await failure(deferring('heading', (node) => node.remove()));
		expect(remove.cause).toBeInstanceOf(TypeError);
		expect((remove.cause as Error).message).toContain('not the node itself');
	});

	it('the node and ctx of the handler, used once it returned, are a TypeError', async () => {
		const view = await failure(
			deferring('heading', async (_own, _ctx, outer) => {
				await ticks(1);
				outer.attrs.who = 'outer';
			})
		);
		expect(view.cause).toBeInstanceOf(TypeError);
		expect((view.cause as Error).message).toContain(
			'node.attrs was called while no handler runs'
		);
		const ctx = await failure({
			name: 'p',
			heading: {
				parse(node, ctx) {
					ctx.defer(node, async () => {
						await ticks(1);
						ctx.set('k', 1);
					});
				},
			},
		});
		expect((ctx.cause as Error).message).toContain(
			'ctx.set was called while no handler runs'
		);
	});

	it('a value json can not hold throws in the task', async () => {
		const error = await failure(
			deferring('heading', (_node, ctx) => ctx.set('k', new Map()))
		);
		expect((error.cause as Error).name).toBe('PluginDataError');
	});

	it('a task defers nothing more', async () => {
		const error = await failure(
			deferring('heading', (node, ctx) =>
				(ctx as any).defer(node, async () => {})
			)
		);
		expect((error.cause as Error).message).toContain('defers nothing more');
	});

	it('defer takes the node whose handler runs, and a function', () => {
		expect(() =>
			run_batch('# a [b](c)\n', [
				{
					name: 'p',
					link: {
						parse: (node, ctx) => ctx.defer(node.parent!, async () => {}),
					},
				},
			])
		).toThrow(TypeError);
		expect(() =>
			run_batch('# a\n', [
				{
					name: 'p',
					heading: { parse: (node, ctx) => ctx.defer(node, 1 as never) },
				},
			])
		).toThrow('the task, a function');
	});

	it('a parse that can not wait throws a PluginAsyncError at the defer', () => {
		const plugins: ParsePlugin[] = [deferring('heading', async () => {})];
		let error: unknown;
		try {
			run_batch('# a\n', {
				plugins,
				setup: (d) => {
					d.allow_async = false;
					d.async_hint = 'use the async one';
				},
			});
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(PluginAsyncError);
		expect((error as PluginAsyncError).message).toBe(
			'plugin "p" called ctx.defer at line 1, column 0, and this parse can not wait for async work, use the async one'
		);
	});
});

describe('apply_ready, for a host that streams', () => {
	it('applies tasks as they land, while the rest of the document arrives', async () => {
		const g = gate();
		const settled_calls: number[] = [];
		const run = run_wire('# a\n\n# b\n', {
			plugins: [
				deferring('heading', async (node) => {
					if (node.text_content === 'b') await g.wait;
					node.attrs.who = 'task';
				}),
			],
			setup: (d) => d.on_settled(() => settled_calls.push(1)),
		});
		const dispatcher = run.dispatcher!;
		await ticks();
		const first = dispatcher.apply_ready();
		expect(first).toHaveLength(1);
		expect(shape(run.nodes, null, 0, { attrs: ATTRS })).toEqual([
			'root',
			['heading who="task"', 'text:a'],
			['heading', 'text:b'],
		]);
		expect(dispatcher.apply_ready()).toBeNull();
		g.open();
		await ticks();
		expect(dispatcher.apply_ready()).toHaveLength(1);
		expect(dispatcher.deferred).toBe(false);
		expect(settled_calls).toEqual([1, 1]);
	});

	it('a task that rejects is a warning and its node stays as it was', async () => {
		const run = run_wire('# a\n', [
			deferring('heading', async (node) => {
				node.attrs.who = 'never';
				throw new Error('offline');
			}),
		]);
		await ticks();
		expect(run.dispatcher!.apply_ready()).toBeNull();
		expect(run.dispatcher!.warnings).toEqual([
			{
				plugin: 'p',
				code: 'task_failed',
				message:
					'a task plugin "p" deferred on the heading node failed: offline',
				start: undefined,
				end: undefined,
			},
		]);
		expect(shape(run.nodes, null, 0, { attrs: ATTRS })).toEqual([
			'root',
			['heading', 'text:a'],
		]);
	});
});

describe('a document that moves on', () => {
	it('drops the tasks of the last one', async () => {
		const g = gate();
		let late: unknown = 'not run';
		const plugins: ParsePlugin[] = [
			deferring('heading', async (node) => {
				await g.wait;
				try {
					node.attrs.who = 'late';
					late = 'wrote';
				} catch (e) {
					late = e;
				}
			}),
		];
		const out = run_batch('# a\n', plugins);
		const dispatcher = out.dispatcher!;
		dispatcher.reset();
		expect(dispatcher.deferred).toBe(false);
		expect(dispatcher.settle()).toBeUndefined();
		g.open();
		await ticks();
		// a dropped task goes on unheard
		expect(late).toBe('wrote');
	});
});
