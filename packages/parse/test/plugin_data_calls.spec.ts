import { describe, expect, it } from 'vitest';

import { PluginDataError } from '../src/main';
import type { DataChange, Json } from '../src/main';
import type { NodeView } from '../src/node_view';
import type {
	DirectiveTable,
	ParsePlugin,
	PluginContext,
	PluginData,
} from '../src/plugin_types';
import { PATHS } from './plugin_harness';
import type { PluginSetup } from './plugin_harness';

/** the data every path leaves, which must be the same on each */
function data_of(
	source: string,
	make: () => PluginSetup | ParsePlugin[]
): PluginData | undefined {
	let first: PluginData | undefined;
	for (let i = 0; i < PATHS.length; i++) {
		const [name, run] = PATHS[i];
		const out = run(source, make());
		const data = out.dispatcher!.data();
		if (i === 0) first = data;
		else expect(data, `${name} against ${PATHS[0][0]}`).toEqual(first);
	}
	return first;
}

/** a plugin that writes with one call from the open handler or the close callback of a kind */
function writer(
	type: string,
	when: 'open' | 'close',
	write: (node: NodeView, ctx: PluginContext) => void,
	name = 'p'
): ParsePlugin {
	return {
		name,
		[type]: {
			parse(node: NodeView, ctx: PluginContext) {
				if (when === 'open') write(node, ctx);
				else return () => write(node, ctx);
			},
		},
	};
}

describe('ctx.set and ctx.add', () => {
	it('set keeps a value and add a list, under the name of the plugin', () => {
		expect(
			data_of('# a\n\n## b\n', () => [
				writer('heading', 'close', (node, ctx) => {
					ctx.set('last', node.text_content);
					ctx.add('titles', { depth: node.depth!, text: node.text_content });
				}),
			])
		).toEqual({
			p: {
				last: 'b',
				titles: [
					{ depth: 1, text: 'a' },
					{ depth: 2, text: 'b' },
				],
			},
		});
	});

	it('ctx.data reads what was written', () => {
		const seen: unknown[] = [];
		data_of('# a\n\n## b\n', () => {
			seen.length = 0;
			return [
				writer('heading', 'close', (node, ctx) => {
					seen.push(ctx.data.n, ctx.data.list);
					ctx.set('n', node.depth!);
					ctx.add('list', node.text_content);
					seen.push(ctx.data.n, ctx.data.list, Object.keys(ctx.data));
				}),
			];
		});
		expect(seen).toEqual([
			undefined,
			undefined,
			1,
			['a'],
			['n', 'list'],
			1,
			['a'],
			2,
			['a', 'b'],
			['n', 'list'],
		]);
	});

	it('plugins of one name share the data, with bound handlers of that name', () => {
		expect(
			data_of(':::box\n## b\n:::\n', () => ({
				plugins: [
					writer(
						'heading',
						'open',
						(_n, ctx) => ctx.add('seen', 'global'),
						'kit'
					),
					{
						name: 'kit',
						sequential: true,
						heading: { parse: (_n, ctx) => ctx.add('seen', 'sequential') },
					},
				],
				directive_handlers: [
					{
						name: 'kit',
						directives: {
							box: {
								children: { heading: (_n, ctx) => ctx.add('seen', 'bound') },
							},
						},
					},
				],
			}))
		).toEqual({ kit: { seen: ['bound', 'global', 'sequential'] } });
	});

	it('a plugin with no name throws', () => {
		for (const [name, run] of PATHS) {
			expect(
				() =>
					run('# a\n', [{ heading: { parse: (_n, ctx) => ctx.set('a', 1) } }]),
				name
			).toThrow('give the plugin a name');
			expect(
				() =>
					run('# a\n', [{ heading: { parse: (_n, ctx) => ctx.add('a', 1) } }]),
				name
			).toThrow('give the plugin a name');
		}
	});

	it('a key is a string that is not empty', () => {
		const run = PATHS[0][1];
		for (const key of ['', 1, undefined]) {
			expect(() =>
				run('# a\n', [
					writer('heading', 'open', (_n, ctx) => ctx.set(key as string, 1)),
				])
			).toThrow(TypeError);
		}
	});

	it('one key holds a value or a list, not both', () => {
		const run = PATHS[0][1];
		expect(() =>
			run('# a\n', [
				writer('heading', 'open', (_n, ctx) => {
					ctx.set('k', 1);
					ctx.add('k', 2);
				}),
			])
		).toThrow(/from ctx\.set, ctx\.add can not add to it/);
		expect(() =>
			run('# a\n', [
				writer('heading', 'open', (_n, ctx) => {
					ctx.add('k', 1);
					ctx.set('k', 2);
				}),
			])
		).toThrow(/from ctx\.add, ctx\.set can not replace it/);
	});

	it('a plugin that only read leaves no key, nor one whose writes were all taken back', () => {
		expect(
			data_of('# a\n\nx *y\n', () => [
				writer('heading', 'open', (_n, ctx) => void ctx.data.x, 'reads'),
				writer(
					'strong_emphasis',
					'open',
					(_n, ctx) => ctx.set('x', 1),
					'revoked'
				),
			])
		).toBeUndefined();
	});
});

describe('ctx.data is read-only', () => {
	const attempt = (act: (ctx: PluginContext) => void) => () =>
		PATHS[0][1]('# a\n', [
			writer('heading', 'open', (_n, ctx) => {
				ctx.set('value', { a: 1 });
				ctx.add('list', 1);
				act(ctx);
			}),
		]);

	it('assigning to a key throws a TypeError that names ctx.set', () => {
		expect(attempt((ctx) => ((ctx.data as any).x = 1))).toThrow(TypeError);
		expect(attempt((ctx) => ((ctx.data as any).x = 1))).toThrow(/ctx\.set/);
	});

	it('so does deleting a key and assigning ctx.data', () => {
		expect(attempt((ctx) => delete (ctx.data as any).value)).toThrow(
			/ctx\.set/
		);
		expect(attempt((ctx) => ((ctx as any).data = {}))).toThrow(/ctx\.set/);
		expect(
			attempt((ctx) => Object.defineProperty(ctx.data, 'x', { value: 1 }))
		).toThrow(/ctx\.set/);
	});

	it('what it holds is frozen', () => {
		expect(attempt((ctx) => (ctx.data.list as Json[]).push(2))).toThrow(
			TypeError
		);
		expect(
			attempt((ctx) => ((ctx.data.value as Record<string, Json>).a = 2))
		).toThrow(TypeError);
	});

	it('it spreads and stringifies as a plain object', () => {
		let spread: unknown;
		let json = '';
		PATHS[0][1]('# a\n', [
			writer('heading', 'open', (_n, ctx) => {
				ctx.set('a', 1);
				ctx.add('b', 'x');
				spread = { ...ctx.data };
				json = JSON.stringify(ctx.data);
			}),
		]);
		expect(spread).toEqual({ a: 1, b: ['x'] });
		expect(json).toBe('{"a":1,"b":["x"]}');
	});
});

describe('values are checked, copied and frozen when written', () => {
	const bad = (value: () => unknown, source = '# a\n') => {
		const errors: unknown[] = [];
		for (const [name, run] of PATHS) {
			try {
				run(source, [
					writer('heading', 'close', (_n, ctx) =>
						ctx.set('k', value() as Json)
					),
				]);
				throw new Error(`${name} did not throw`);
			} catch (e) {
				errors.push(e);
			}
		}
		return errors as PluginDataError[];
	};

	it('a value json can not hold is a PluginDataError with the plugin, key, path and position', () => {
		const errors = bad(() => ({ list: [1, new Map()] }), '\n\n## a\n');
		for (const error of errors) {
			expect(error).toBeInstanceOf(PluginDataError);
			expect(error.plugin).toBe('p');
			expect(error.key).toBe('k');
			expect(error.path).toBe('k.list[1]');
			expect(error.message).toContain('a Map');
		}
		// the wire carries no offsets
		const [batch] = errors;
		expect(batch.position!.start).toEqual({ offset: 2, line: 3, column: 0 });
		expect(batch.message).toContain('line 3, column 0');
		expect(errors[PATHS.findIndex(([n]) => n === 'wire')].position).toBe(
			undefined
		);
	});

	it('names what it found', () => {
		const cases: [unknown, string, string][] = [
			[NaN, 'NaN', 'k'],
			[{ a: Infinity }, 'Infinity', 'k.a'],
			[undefined, 'undefined', 'k'],
			[[undefined], 'undefined', 'k[0]'],
			[() => 1, 'a function', 'k'],
			[1n, 'a bigint', 'k'],
			[{ 'a-b': new Date(0) }, 'a Date', 'k["a-b"]'],
			[{ [Symbol('s')]: 1 }, 'a symbol key', 'k'],
			[Object.create(null), '', ''],
		];
		for (const [value, found, path] of cases) {
			const run = () =>
				PATHS[0][1]('# a\n', [
					writer('heading', 'open', (_n, ctx) => ctx.set('k', value as Json)),
				]);
			if (found === '') {
				expect(run).not.toThrow();
				continue;
			}
			try {
				run();
				throw new Error(`no throw for ${found}`);
			} catch (e) {
				expect(e).toBeInstanceOf(PluginDataError);
				expect((e as PluginDataError).message).toContain(found);
				expect((e as PluginDataError).path).toBe(path);
			}
		}
	});

	it('a value that holds itself', () => {
		const loop: Record<string, unknown> = {};
		loop.self = loop;
		const [error] = bad(() => loop);
		expect(error.path).toBe('k.self');
		expect(error.message).toContain('a reference to an object it is in');
	});

	it('from an add, the path is the key', () => {
		expect(() =>
			PATHS[0][1]('# a\n', [
				writer('heading', 'open', (_n, ctx) => ctx.add('list', [NaN] as Json)),
			])
		).toThrow(expect.objectContaining({ path: 'list[0]', key: 'list' }));
	});

	it('a change to the value after the write changes nothing', () => {
		const data = data_of('# a\n', () => [
			writer('heading', 'open', (_n, ctx) => {
				const entry = { tags: ['x'] };
				ctx.add('list', entry);
				ctx.set('value', entry);
				entry.tags.push('y');
			}),
		]);
		expect(data).toEqual({
			p: { list: [{ tags: ['x'] }], value: { tags: ['x'] } },
		});
		expect(Object.isFrozen(data!.p.list)).toBe(true);
		expect(Object.isFrozen((data!.p.value as any).tags)).toBe(true);
	});

	it('a key json leaves out is left out', () => {
		expect(
			data_of('# a\n', () => [
				writer('heading', 'open', (_n, ctx) =>
					ctx.set('k', { a: 1, b: undefined } as unknown as Json)
				),
			])
		).toEqual({ p: { k: { a: 1 } } });
	});
});

describe('document order', () => {
	it('add keeps entries in the order of their owners, whenever they arrive', () => {
		// the link closes before the heading that holds it
		expect(
			data_of('# a [b](c)\n\n[d](e)\n', () => [
				writer('heading', 'close', (node, ctx) => ctx.add('seen', node.type)),
				writer('link', 'close', (node, ctx) =>
					ctx.add('seen', node.text_content)
				),
			])
		).toEqual({ p: { seen: ['heading', 'b', 'd'] } });
	});

	it('one owner keeps its entries in the order it added them', () => {
		expect(
			data_of('# a\n\n# b\n', () => [
				writer('heading', 'close', (node, ctx) => {
					ctx.add('seen', node.text_content + 1);
					ctx.add('seen', node.text_content + 2);
				}),
			])
		).toEqual({ p: { seen: ['a1', 'a2', 'b1', 'b2'] } });
	});

	it('entries from a sequential pass come after the rest', () => {
		expect(
			data_of('# a\n\n# b\n', () => [
				{
					name: 'p',
					sequential: true,
					heading: {
						parse: (node, ctx) => ctx.add('seen', 'seq ' + node.text_content),
					},
				},
				writer('heading', 'close', (node, ctx) =>
					ctx.add('seen', node.text_content)
				),
			])
		).toEqual({ p: { seen: ['a', 'b', 'seq a', 'seq b'] } });
	});

	it('of two owners that set a key the later one in the document wins', () => {
		// the heading writes last, the link inside it is later in the document
		expect(
			data_of('# a [b](c)\n', () => [
				writer('heading', 'close', (_n, ctx) => ctx.set('who', 'heading')),
				writer('link', 'open', (_n, ctx) => ctx.set('who', 'link')),
			])
		).toEqual({ p: { who: 'link' } });
	});

	it('one owner that sets a key twice leaves its last value', () => {
		expect(
			data_of('# a\n', () => [
				writer('heading', 'open', (_n, ctx) => {
					ctx.set('n', 1);
					ctx.set('n', 2);
				}),
			])
		).toEqual({ p: { n: 2 } });
	});

	it('a sequential set wins over every owner, the last of them over the others', () => {
		expect(
			data_of('# a\n\n# b\n', () => [
				writer('heading', 'open', (node, ctx) =>
					ctx.set('n', node.text_content)
				),
				{
					name: 'p',
					sequential: true,
					heading: {
						parse: (node, ctx) => ctx.set('n', 'seq ' + node.text_content),
					},
				},
			])
		).toEqual({ p: { n: 'seq b' } });
	});
});

describe('revocation takes back exactly the writes of the node', () => {
	const both = (type: string, when: 'open' | 'close' = 'open') =>
		writer(type, when, (node, ctx) => {
			ctx.set('last', node.text_content);
			ctx.add('all', node.text_content);
		});

	it('of a delimiter that never closes, written from open and close', () => {
		expect(data_of('a *b\n', () => [both('strong_emphasis')])).toBeUndefined();
		expect(
			data_of('a *b\n', () => [both('strong_emphasis', 'close')])
		).toBeUndefined();
		// one that closes keeps them
		expect(
			data_of('a *b*\n', () => [both('strong_emphasis', 'close')])
		).toEqual({
			p: { last: 'b', all: ['b'] },
		});
	});

	it('of a link with no destination, while the others stay', () => {
		expect(
			data_of('[a](x) [b] [c](y)\n', () => [both('link', 'close')])
		).toEqual({ p: { last: 'c', all: ['a', 'c'] } });
	});

	it('the paragraphs of a tight list, revoked first to last', () => {
		expect(data_of('- a\n- b\n- c\n', () => [both('paragraph', 'close')])).toBe(
			undefined
		);
		expect(data_of('- a\n\n- b\n', () => [both('paragraph', 'close')])).toEqual(
			{ p: { last: 'b', all: ['a', 'b'] } }
		);
	});

	it('a set of a later owner that goes leaves the value of the earlier one', () => {
		expect(
			data_of('# a\n\nx [b] y\n', () => [
				writer('heading', 'open', (_n, ctx) => ctx.set('who', 'heading')),
				writer('link', 'open', (_n, ctx) => ctx.set('who', 'link')),
			])
		).toEqual({ p: { who: 'heading' } });
	});

	it('a set of an earlier owner that goes leaves the later one as it was', () => {
		expect(
			data_of('x *y\n\n# a\n', () => [
				writer('strong_emphasis', 'open', (_n, ctx) =>
					ctx.set('who', 'strong_emphasis')
				),
				writer('heading', 'open', (_n, ctx) => ctx.set('who', 'heading')),
			])
		).toEqual({ p: { who: 'heading' } });
	});

	it('entries that arrived out of order lose only the revoked owner', () => {
		// the emphasis never closes and is revoked after the paragraph closed
		expect(
			data_of('x *y [z](w) v\n', () => [
				writer('paragraph', 'close', (_n, ctx) => ctx.add('seen', 'paragraph')),
				writer('strong_emphasis', 'open', (_n, ctx) =>
					ctx.add('seen', 'strong_emphasis')
				),
				writer('link', 'close', (_n, ctx) => ctx.add('seen', 'link')),
			])
		).toEqual({ p: { seen: ['paragraph', 'link'] } });
		// and with a closer every owner stays, in document order
		expect(
			data_of('x *y [z](w) v*\n', () => [
				writer('paragraph', 'close', (_n, ctx) => ctx.add('seen', 'paragraph')),
				writer('strong_emphasis', 'open', (_n, ctx) =>
					ctx.add('seen', 'strong')
				),
				writer('link', 'close', (_n, ctx) => ctx.add('seen', 'link')),
			])
		).toEqual({ p: { seen: ['paragraph', 'strong', 'link'] } });
	});

	it('a write about another node goes with the node whose handler made it', () => {
		expect(
			data_of('# a *b\n', () => [
				writer('strong_emphasis', 'open', (node, ctx) =>
					ctx.add('parents', node.parent!.type)
				),
				writer('heading', 'open', (_n, ctx) => ctx.add('parents', 'own')),
			])
		).toEqual({ p: { parents: ['own'] } });
	});

	it('of a bound handler', () => {
		const table = (): DirectiveTable => ({
			name: 'boxes',
			directives: {
				box: {
					descendants: {
						link(node, ctx) {
							ctx.add('links', ctx.index);
							ctx.set('count', ctx.index + 1);
						},
					},
				},
			},
		});
		expect(
			data_of(':::box\n[a] [b](c) [d]\n:::\n', () => ({
				directive_handlers: [table()],
			}))
		).toEqual({ boxes: { links: [0], count: 1 } });
	});

	it('each document starts empty', () => {
		const run = PATHS[0][1];
		const out = run('# a\n', [both('heading', 'close')]);
		expect(out.dispatcher!.data()).toEqual({ p: { last: 'a', all: ['a'] } });
	});
});

describe('data changes', () => {
	/** the latest value of each key the events of a run gave */
	const replay = (changes: DataChange[]) => {
		const out: Record<string, Record<string, Json>> = {};
		for (const { plugin, key, value } of changes) {
			const bag = (out[plugin] ??= {});
			if (value === undefined) delete bag[key];
			else bag[key] = value;
		}
		for (const plugin of Object.keys(out)) {
			if (Object.keys(out[plugin]).length === 0) delete out[plugin];
		}
		return Object.keys(out).length === 0 ? undefined : out;
	};

	const plugins = (): ParsePlugin[] => [
		writer('heading', 'close', (node, ctx) =>
			ctx.add('toc', node.text_content)
		),
		writer('strong_emphasis', 'open', (node, ctx) => ctx.set('em', node.type)),
		writer('link', 'open', (_n, ctx) => ctx.add('toc', 'link')),
	];

	const changes_of = (run: (typeof PATHS)[number][1], source: string) => {
		const changes: DataChange[] = [];
		const out = run(source, {
			plugins: plugins(),
			on_data: (c) => changes.push(c),
		});
		return { changes, data: out.dispatcher!.data() };
	};

	it('following the events gives the data on every path', () => {
		for (const [name, run] of PATHS) {
			const { changes, data } = changes_of(
				run,
				'# a\n\nx *y [z]\n\n# b [c](d)\n'
			);
			expect(data, name).toEqual({ p: { toc: ['a', 'b c', 'link'] } });
			expect(replay(changes), name).toEqual(data);
		}
	});

	it('a revoke reports the value left, undefined for none', () => {
		expect(changes_of(PATHS[0][1], 'x *y\n').changes).toEqual([
			{ plugin: 'p', key: 'em', value: 'strong_emphasis' },
			{ plugin: 'p', key: 'em', value: undefined },
		]);
	});

	it('a list event carries the whole list in document order', () => {
		expect(changes_of(PATHS[0][1], '# a [b](c)\n').changes).toEqual([
			{ plugin: 'p', key: 'toc', value: ['link'] },
			{ plugin: 'p', key: 'toc', value: ['a b', 'link'] },
		]);
	});

	it('a listener stops when asked and stays from one document to the next', () => {
		const changes: DataChange[] = [];
		const out = PATHS[0][1]('# a\n', { plugins: plugins() });
		const dispatcher = out.dispatcher!;
		const stop = dispatcher.on_data((c) => changes.push(c));
		expect(typeof stop).toBe('function');
		stop();
		stop();
		expect(changes).toEqual([]);
	});
});
