import { describe, expect, it } from 'vitest';

import {
	DirectiveOwnerError,
	PluginTaskError,
	parse_markdown_svelte,
} from '../src/main';
import { SourceTextSource } from '../src/node_view';
import type { NodeView } from '../src/node_view';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type {
	DirectiveContext,
	DirectiveHandlers,
	DirectiveTable,
	ParsePlugin,
	PluginData,
} from '../src/plugin_types';
import { PATHS, expect_parity_logged, run_batch } from './plugin_harness';
import type { PluginSetup } from './plugin_harness';

const NAMED = { attrs: ['name', 'args', 'id', 'by'] };

/** the data every path leaves, which must be the same on each */
function data_of(
	source: string,
	make: () => PluginSetup
): PluginData | undefined {
	let first: PluginData | undefined;
	for (let i = 0; i < PATHS.length; i++) {
		const [name, run] = PATHS[i];
		const out = run(source, make());
		expect(out.dispatcher!.quiet(), `${name} left plugin state`).toBe(true);
		const data = out.dispatcher!.data();
		if (i === 0) first = data;
		else expect(data, `${name} against ${PATHS[0][0]}`).toEqual(first);
	}
	return first;
}

/** an owner and an observer of box that log what they see, and a global directive handler */
function logging(log: string[]): PluginSetup {
	const owner: DirectiveHandlers = {
		box: {
			parse(node) {
				log.push('owner open ' + JSON.stringify(node.attrs.args ?? null));
				node.attrs.by = 'owner';
				return () => {
					log.push('owner close');
					node.attrs.args = { ...node.attrs.args, closed: 'yes' };
				};
			},
		},
	};
	const global: ParsePlugin = {
		name: 'global',
		directive_container: {
			parse(node) {
				log.push('global open ' + node.attrs.name);
				return () => void log.push('global close ' + node.attrs.name);
			},
		},
	};
	const observer: ParsePlugin = {
		name: 'watch',
		observe: {
			box: {
				parse(node, ctx) {
					log.push(
						`observer open by=${node.attrs.by} ${JSON.stringify(node.attrs.args ?? null)} ${ctx.directive === node} ${ctx.index}`
					);
					return () =>
						void log.push(
							'observer close ' + JSON.stringify(node.attrs.args ?? null)
						);
				},
			},
		},
	};
	return {
		plugins: [global, observer],
		directive_handlers: [{ name: 'boxes', directives: owner }],
	};
}

describe('observers: order', () => {
	it('run after the owner and the global handlers, at the open and at the close', () => {
		const { log, tree } = expect_parity_logged(
			':::box[Title](a=1)\ntext\n:::\n',
			logging,
			NAMED
		);
		expect(log).toEqual([
			'global open box',
			'owner open {"a":"1"}',
			'observer open by=owner {"a":"1"} true 0',
			'owner close',
			'global close box',
			'observer close {"a":"1","closed":"yes"}',
		]);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="box" args={"a":"1","closed":"yes"} by="owner"',
				['directive_label', 'text:Title'],
				['paragraph', 'text:text'],
			],
		]);
	});

	it('observers of one name run in plugin order', () => {
		const { log } = expect_parity_logged(':::box[]\nx\n:::\n', (log) => {
			const watcher = (name: string): ParsePlugin => ({
				name,
				observe: {
					box: {
						parse() {
							log.push(name + ' open');
							return () => void log.push(name + ' close');
						},
					},
				},
			});
			return {
				plugins: [watcher('first'), watcher('second')],
				directive_handlers: [
					{
						name: 'boxes',
						directives: {
							box: {
								parse() {
									log.push('owner open');
									return () => void log.push('owner close');
								},
							},
						},
					},
				],
			};
		});
		expect(log).toEqual([
			'owner open',
			'first open',
			'second open',
			'owner close',
			'first close',
			'second close',
		]);
	});

	it('an inline directive has its args at the close for the observer too', () => {
		const { log } = expect_parity_logged('a :box[x](k=v) b\n', (log) => ({
			plugins: [
				{
					name: 'watch',
					observe: {
						box: {
							parse(node) {
								log.push('open ' + JSON.stringify(node.attrs.args ?? null));
								return () =>
									void log.push('close ' + JSON.stringify(node.attrs.args));
							},
						},
					},
				},
			],
		}));
		expect(log).toEqual(['open null', 'close {"k":"v"}']);
	});
});

describe('observers: what they see inside', () => {
	/** an owner that opens a section at each heading, an observer that counts children */
	function sections(log: string[]): PluginSetup {
		return {
			plugins: [
				{
					name: 'watch',
					observe: {
						box: {
							parse(_node, ctx) {
								ctx.state.seen = 0;
								return () => void log.push('watch saw ' + ctx.state.seen);
							},
							children: {
								heading(node, ctx) {
									log.push(
										`watch heading ${ctx.index} ${node.parent!.type} ${node.parent!.attrs.name}`
									);
									return () =>
										void log.push('watch heading close ' + node.text_content);
								},
								'*'(node, ctx) {
									ctx.state.seen = ctx.state.seen + 1;
									log.push(`watch child ${ctx.index} ${node.type}`);
								},
							},
							descendants: {
								link(_node, ctx) {
									log.push(
										`watch link ${ctx.index} in ${ctx.directive.attrs.name}`
									);
								},
							},
						},
					},
				},
			],
			directive_handlers: [
				{
					name: 'boxes',
					directives: {
						box: {
							children: {
								heading(node, ctx) {
									log.push('owner heading ' + ctx.index);
									ctx.state.section?.close();
									ctx.state.section = node.wrap_from('directive_container', {
										name: 'section',
									});
									return () =>
										void log.push('owner heading close ' + node.text_content);
								},
							},
						},
					},
				},
			],
		};
	}

	it('children and descendants handlers run after the owner, with a state and counts of their own', () => {
		const { log, tree } = expect_parity_logged(
			':::box[Box]\nintro\n\n## One\n\n[a](u) b\n\n## Two\n\nc\n:::\n',
			sections,
			NAMED
		);
		expect(log).toEqual([
			'watch child 0 directive_label',
			'watch child 1 paragraph',
			'owner heading 0',
			'watch heading 0 directive_container section',
			'watch child 2 heading',
			'owner heading close One',
			'watch heading close One',
			'watch child 3 paragraph',
			'watch link 0 in box',
			'owner heading 1',
			'watch heading 1 directive_container section',
			'watch child 4 heading',
			'owner heading close Two',
			'watch heading close Two',
			'watch child 5 paragraph',
			'watch saw 6',
		]);
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="box"',
				['directive_label', 'text:Box'],
				['paragraph', 'text:intro'],
				[
					'directive_container name="section"',
					['heading', 'text:One'],
					['paragraph', ['link', 'text:a'], 'text: b'],
				],
				[
					'directive_container name="section"',
					['heading', 'text:Two'],
					['paragraph', 'text:c'],
				],
			],
		]);
	});

	it('an observer with children handlers and an owner without any', () => {
		const { log } = expect_parity_logged(
			':::box[]\n## A\n\n:::box[]\n## B\n:::\n:::\n',
			(log) => ({
				plugins: [
					{
						name: 'watch',
						observe: {
							box: {
								children: {
									heading(node, ctx) {
										return () =>
											void log.push(`${node.text_content} ${ctx.index}`);
									},
								},
							},
						},
					},
				],
				directive_handlers: [{ name: 'boxes', directives: { box: {} } }],
			})
		);
		// the nested box is a scope of its own
		expect(log).toEqual(['A 0', 'B 0']);
	});
});

describe('observers: they change no node', () => {
	const ATTEMPTS: [string, (node: NodeView) => unknown][] = [
		['node.attrs', (node) => (node.attrs.x = '1')],
		['delete node.attrs', (node) => delete node.attrs.name],
		['node.type', (node) => (node.type = 'paragraph')],
		['wrap_inner', (node) => node.wrap_inner('emphasis')],
		['append', (node) => node.append('text', 'x')],
		['prepend', (node) => node.prepend('html', { tag: 'b' })],
	];

	function trying(log: string[], owned: boolean): PluginSetup {
		const attempt = (where: string, node: NodeView) => {
			for (const [what, write] of ATTEMPTS) {
				try {
					write(node);
					log.push(`${where} ${what} went through`);
				} catch (e) {
					log.push(
						`${where} ${(e as Error).constructor.name}: ${(e as Error).message}`
					);
				}
			}
		};
		return {
			plugins: [
				{
					name: 'numbering',
					observe: {
						figure: {
							parse(node) {
								attempt('open', node);
								return () => attempt('close', node.first_child!);
							},
							children: {
								paragraph(node) {
									attempt('child', node);
								},
							},
						},
					},
				},
			],
			directive_handlers: owned
				? [{ name: 'figures', directives: { figure: {} } }]
				: undefined,
		};
	}

	it('a write throws a TypeError that names the owner', () => {
		const { log, tree } = expect_parity_logged(
			':::figure[A cat]\ntext\n:::\n',
			(log) => trying(log, true),
			NAMED
		);
		expect(log).toHaveLength(ATTEMPTS.length * 3);
		for (const line of log) {
			expect(line).toMatch(
				/^(open|close|child) TypeError: [a-z_. ]+: plugin "numbering" observes directive "figure", which plugin "figures" owns, an observer changes no node, it writes what it finds with ctx\.set or ctx\.add$/
			);
		}
		expect(tree).toEqual([
			'root',
			[
				'directive_container name="figure"',
				['directive_label', 'text:A cat'],
				['paragraph', 'text:text'],
			],
		]);
	});

	it('and without an owner', () => {
		const { log } = expect_parity_logged(
			':::figure[A cat]\ntext\n:::\n',
			(log) => trying(log, false)
		);
		expect(log[0]).toBe(
			'open TypeError: node.attrs: plugin "numbering" observes directive "figure", an observer changes no node, it writes what it finds with ctx.set or ctx.add'
		);
		expect(log.every((line) => line.includes(' TypeError: '))).toBe(true);
	});

	it('wrap_from and remove throw too', () => {
		const log: string[] = [];
		run_batch(':::figure[]\n## A\n:::\n', {
			plugins: [
				{
					name: 'numbering',
					observe: {
						figure: {
							children: {
								heading(node) {
									try {
										node.wrap_from('directive_container', { name: 'x' });
									} catch (e) {
										log.push((e as Error).message);
									}
									return () => {
										try {
											node.remove();
										} catch (e) {
											log.push((e as Error).message);
										}
									};
								},
							},
						},
					},
				},
			],
		});
		expect(log).toEqual([
			'wrap_from: plugin "numbering" observes directive "figure", an observer changes no node, it writes what it finds with ctx.set or ctx.add',
			'remove: plugin "numbering" observes directive "figure", an observer changes no node, it writes what it finds with ctx.set or ctx.add',
		]);
	});

	it('a deferred task of an observer writes data and changes no node', async () => {
		const run = (write_node: boolean) => {
			const out = run_batch(':::figure[A cat](id=cat)\nx\n:::\n', {
				plugins: [
					{
						name: 'numbering',
						observe: {
							figure: {
								parse(node, ctx) {
									ctx.defer(node, async (node, ctx) => {
										await Promise.resolve();
										ctx.set('target:' + node.attrs.args.id, { number: 1 });
										if (write_node) node.attrs.x = '1';
									});
								},
							},
						},
					},
				],
				directive_handlers: [{ name: 'figures', directives: { figure: {} } }],
			});
			return out;
		};
		const ok = run(false);
		await ok.dispatcher!.finish(ok.nodes);
		expect(ok.dispatcher!.data()).toEqual({
			numbering: { 'target:cat': { number: 1 } },
		});

		const bad = run(true);
		const failed = await bad.dispatcher!.finish(bad.nodes)!.catch((e) => e);
		expect(failed).toBeInstanceOf(PluginTaskError);
		expect(failed.cause).toBeInstanceOf(TypeError);
		expect(failed.cause.message).toBe(
			'node.attrs: plugin "numbering" observes directive "figure", which plugin "figures" owns, an observer changes no node, it writes what it finds with ctx.set or ctx.add'
		);
	});

	it('a node the observer does not observe can not be changed either', () => {
		const log: string[] = [];
		run_batch('# Top\n\n:::figure[]\nx\n:::\n', {
			plugins: [
				{
					name: 'numbering',
					observe: {
						figure: {
							parse(node) {
								try {
									node.parent!.first_child!.attrs.id = 'x';
								} catch (e) {
									log.push((e as Error).message);
								}
							},
						},
					},
				},
			],
		});
		expect(log).toHaveLength(1);
		expect(log[0]).toMatch(/^node\.attrs: plugin "numbering" observes/);
	});
});

describe('observers: what they may do', () => {
	it('set, add, warn, scratch and id, all owned by the directive', () => {
		const make = (): PluginSetup => ({
			plugins: [
				{
					name: 'watch',
					observe: {
						box: {
							parse(node, ctx) {
								ctx.scratch.boxes = (ctx.scratch.boxes ?? 0) + 1;
								ctx.add('boxes', ctx.scratch.boxes);
								const id = ctx.id('box');
								return () => {
									ctx.set('last', id);
									ctx.warn('seen', 'a box', node);
								};
							},
						},
					},
				},
			],
		});
		expect(data_of(':::box[]\na\n:::\n\n:::box[]\nb\n:::\n', make)).toEqual({
			watch: { boxes: [1, 2], last: 'box-1' },
		});
		const out = run_batch(':::box[]\na\n:::\n', make());
		expect(out.dispatcher!.warnings).toEqual([
			{ plugin: 'watch', code: 'seen', message: 'a box', start: 0, end: 15 },
		]);
	});

	it('a sequential plugin observes in the fused pass', () => {
		const log: string[] = [];
		run_batch(':::box[]\na\n:::\n', {
			plugins: [
				{
					name: 'later',
					sequential: true,
					paragraph: { parse: () => void log.push('sequential paragraph') },
					observe: { box: { parse: () => void log.push('observer') } },
				},
			],
		});
		expect(log).toEqual(['observer', 'sequential paragraph']);
	});
});

describe('observers: revocation', () => {
	/** an owner and an observer that write the same things under their own names */
	const writers = (name: string) => ({
		parse(node: NodeView, ctx: DirectiveContext) {
			ctx.add('opened', node.attrs.name);
			ctx.warn('opened', name, node);
			ctx.id('fig');
			return () => ctx.add('closed', node.text_content);
		},
	});
	const make = (): PluginSetup => ({
		plugins: [{ name: 'watch', observe: { fig: writers('watch') } }],
		directive_handlers: [
			{ name: 'owner', directives: { fig: writers('owner') } },
		],
	});

	it('what an observer wrote goes with a directive that is revoked', () => {
		const data = data_of('a :fig[x] b :fig[y c\n', make);
		expect(data).toEqual({
			owner: { opened: ['fig'], closed: ['x'] },
			watch: { opened: ['fig'], closed: ['x'] },
		});
		for (const [name, run] of PATHS) {
			const out = run('a :fig[x] b :fig[y c\n', make());
			expect(
				out.dispatcher!.warnings?.map((w) => w.message),
				name
			).toEqual(['owner', 'watch']);
		}
	});

	it('and stays when only a construct around the directive goes', () => {
		expect(data_of('*a :fig[x] b\n\n[c :fig[y] d\n', make)).toEqual({
			owner: { opened: ['fig', 'fig'], closed: ['x', 'y'] },
			watch: { opened: ['fig', 'fig'], closed: ['x', 'y'] },
		});
	});

	it('an id an observer took is free again once its directive is revoked', () => {
		const ids: string[] = [];
		parse_markdown_svelte(':fig[y\n\n:fig[x]\n', {
			plugins: [
				{
					name: 'watch',
					observe: {
						fig: {
							parse(_node, ctx) {
								return () => void ids.push(ctx.id('fig'));
							},
						},
					},
				},
			],
		});
		expect(ids).toEqual(['fig']);
	});
});

describe('observers: numbering figures', () => {
	/** a figure plugin like the one of the kit */
	const figures: DirectiveTable = {
		name: 'figures',
		directives: {
			figure: {
				parse(node, ctx) {
					const id = node.attrs.args?.id;
					if (typeof id === 'string' && id !== '') ctx.id(id, { fixed: true });
					return () => {
						if (node.first_child === null) ctx.warn('empty', 'empty', node);
					};
				},
			},
		},
	};

	/** numbers each figure in the order written, the caption is its label */
	const numbering: ParsePlugin = {
		name: 'numbering',
		observe: {
			figure: {
				parse(node, ctx) {
					// a block directive is never revoked, a count in scratch stays right
					const number = (ctx.scratch.figure = (ctx.scratch.figure ?? 0) + 1);
					const id = node.attrs.args?.id;
					if (typeof id !== 'string') {
						ctx.warn(
							'no_id',
							'a figure without an id can not be referenced',
							node
						);
						return;
					}
					return () => {
						const label = node.first_child;
						ctx.set('target:' + id, {
							kind: 'figure',
							number,
							caption:
								label !== null && label.type === 'directive_label'
									? label.text_content
									: null,
						});
					};
				},
			},
		},
	};

	const SOURCE =
		':::figure[A cat](id=fig-cat)\n![cat](cat.png)\n:::\n\nSee the dog.\n\n:::figure(id=fig-dog)\n![dog](dog.png)\n:::\n\n:::figure\nno id\n:::\n';

	it('with and without a label, on every path', () => {
		expect(
			data_of(SOURCE, () => ({
				plugins: [numbering],
				directive_handlers: [figures],
			}))
		).toEqual({
			numbering: {
				'target:fig-cat': { kind: 'figure', number: 1, caption: 'A cat' },
				'target:fig-dog': { kind: 'figure', number: 2, caption: null },
			},
		});
	});

	it('the same with no figure plugin installed', () => {
		expect(data_of(SOURCE, () => ({ plugins: [numbering] }))).toEqual({
			numbering: {
				'target:fig-cat': { kind: 'figure', number: 1, caption: 'A cat' },
				'target:fig-dog': { kind: 'figure', number: 2, caption: null },
			},
		});
	});

	it('and through parse_markdown_svelte', () => {
		const { data, warnings } = parse_markdown_svelte(SOURCE, {
			plugins: [numbering],
			directive_handlers: [figures],
		});
		expect(data?.numbering['target:fig-cat']).toEqual({
			kind: 'figure',
			number: 1,
			caption: 'A cat',
		});
		expect(warnings?.map((w) => `${w.plugin} ${w.code}`)).toEqual([
			'numbering no_id',
		]);
	});
});

describe('one owner for each directive name', () => {
	const dispatcher = (plugins: ParsePlugin[], tables: DirectiveTable[]) =>
		new PluginDispatcher(plugins, new SourceTextSource(''), tables);

	it('two tables that bind one name are a DirectiveOwnerError naming both', () => {
		let error: unknown;
		try {
			dispatcher(
				[],
				[
					{ name: 'figures', directives: { figure: {}, table: {} } },
					{ name: 'my-figures', directives: { figure: { parse() {} } } },
				]
			);
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(DirectiveOwnerError);
		expect(error).toMatchObject({
			name: 'DirectiveOwnerError',
			directive: 'figure',
			plugins: ['figures', 'my-figures'],
			message:
				'plugin "figures" and plugin "my-figures" both own directive "figure", a directive has one owner, another plugin can observe it',
		});
	});

	it('also for a table without a name', () => {
		expect(() =>
			dispatcher([], [{ box: { parse() {} } }, { box: { parse() {} } }])
		).toThrow(new DirectiveOwnerError('box', [undefined, undefined]));
		expect(() =>
			dispatcher([], [{ box: { parse() {} } }, { box: { parse() {} } }])
		).toThrow(
			'a table without a name and a table without a name both own directive "box"'
		);
	});

	it('a plugin can not observe a directive it owns', () => {
		expect(() =>
			dispatcher(
				[{ name: 'figures', observe: { figure: { parse() {} } } }],
				[{ name: 'figures', directives: { figure: {} } }]
			)
		).toThrow(
			'plugin "figures" owns directive "figure" and observes it, its own handlers already see it'
		);
	});

	it('an observe table is checked as a table of bound handlers is', () => {
		expect(() =>
			dispatcher(
				[{ name: 'w', observe: { figure: { children: { nope() {} } } } }],
				[]
			)
		).toThrow(
			'unknown node type "nope" in the children handlers of directive "figure"'
		);
		expect(() => dispatcher([{ name: 'w', observe: [] as never }], [])).toThrow(
			'the observe of plugin "w" must be an object of entries by directive name'
		);
	});
});
