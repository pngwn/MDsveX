import { describe, expect, test } from 'vitest';
import { compile, CompilerSession, _shared_session } from '../src/main';
import type { CompileOptions, MapTrace, ParsePlugin } from '../src/main';

const documents = [
	'# Heading\n\nA paragraph with *emphasis* and [a link](https://example.com).\n',
	'| left | right |\n| :--- | ---: |\n| one | two |\n',
	'```ts\nconst value = 1;\n```\n\n<section>{value}</section>\n',
	'short\n',
];

describe('CompilerSession', () => {
	test('matches one-shot HTML and mappings across sequential documents', () => {
		const compiler = new CompilerSession();

		for (let pass = 0; pass < 4; pass++) {
			for (const source of documents) {
				expect(compiler.compile(source)).toEqual(compile(source));
				expect(compiler.compile(source, { sourcemap: true })).toEqual(
					compile(source, { sourcemap: true })
				);
			}
		}
	});

	test('matches one-shot output for CRLF sources', () => {
		const compiler = new CompilerSession();
		const crlf = documents.map((source) => source.replace(/\n/g, '\r\n'));

		for (const source of [...crlf, ...documents, ...crlf]) {
			expect(compiler.compile(source)).toEqual(compile(source));
			expect(compiler.compile(source, { sourcemap: true })).toEqual(
				compile(source, { sourcemap: true })
			);
		}
	});

	test('does not mutate a prior result when its arena is reset', () => {
		const compiler = new CompilerSession();
		const first = compiler.compile(documents[0], { sourcemap: true });
		const snapshot = structuredClone(first);

		for (let i = 0; i < 20; i++) {
			compiler.compile(documents[i % documents.length], { sourcemap: true });
		}

		expect(first).toEqual(snapshot);
	});

	test('one-shot compile matches a fresh session per document', () => {
		const many_nodes = '- item *a*\n'.repeat(15000);
		const long_source = 'word '.repeat(120000) + '\n';
		const sequence = [
			'# ` ',
			'a\n~~~\nb',
			...documents,
			many_nodes,
			...documents,
			long_source,
			'',
			...documents.map((source) => source.replace(/\n/g, '\r\n')),
			'# ` ',
			'a\n~~~\nb',
		];

		for (const source of sequence) {
			for (const sourcemap of [false, true]) {
				const expected = new CompilerSession().compile(source, { sourcemap });
				expect(compile(source, { sourcemap })).toEqual(expected);
			}
		}
	});

	test('one-shot results survive later one-shot compiles', () => {
		const first = compile(documents[0], { sourcemap: true });
		const snapshot = structuredClone(first);

		for (let i = 0; i < 20; i++) {
			compile(documents[i % documents.length], { sourcemap: true });
		}

		expect(first).toEqual(snapshot);
	});

	test('the shared session drops a large arena and never sees a long source', () => {
		compile(documents[0]);
		const small = _shared_session()!.capacity;
		expect(small).toBeGreaterThan(0);

		compile('- item *a*\n'.repeat(15000), { sourcemap: true });
		expect(_shared_session()).toBe(null);

		compile(documents[0]);
		expect(_shared_session()!.capacity).toBe(small);

		compile('word '.repeat(120000) + '\n');
		expect(_shared_session()!.capacity).toBe(small);
	});

	test('the shared session holds no document after a compile', () => {
		const source =
			'# Title\n\n[link](https://example.com/a/long/path) and <b>html</b>\n';
		compile(source, { sourcemap: true });
		const session = _shared_session() as any;

		expect(session.parser.source).toBe('');
		expect(session.parser.ref_map.size).toBe(0);
		expect(session.tree.get_buffer().size).toBe(1);
		expect(session.renderer.html).toBe('');
		expect(session.renderer.out.length).toBe(0);
		expect(session.renderer.cursor.src).toBe('');
	});

	test('a throwing compile drops the shared session', () => {
		compile(documents[0]);
		expect(_shared_session()).not.toBe(null);
		const bad = { length: 3 } as unknown as string;
		expect(() => compile(bad)).toThrow();
		expect(_shared_session()).toBe(null);
		expect(compile(documents[1])).toEqual(
			new CompilerSession().compile(documents[1])
		);
	});
});

const plugin_documents = [
	...documents,
	'# One\n\ntext *open\n\n## Two `code`\n',
	'- tight *a*\n- tight\n\n1. loose\n\n2. loose\n',
	'<div>\n\n# Inside *strong*\n\nnever closed\n',
	'_open *closed* [link](/x) rest\n\n# Last\n',
	'# \n\n#### Deep heading with a [link](/y)\n',
	'',
];

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** the heading example of PLUGINS.md, a wrap_inner at open and attrs at close */
const autolink: ParsePlugin = {
	heading: {
		parse(node) {
			const link = node.wrap_inner('link');
			return () => {
				const slug = slugify(node.text_content);
				node.attrs.id = slug;
				link.attrs.href = `#${slug}`;
			};
		},
	},
};

const arena_of = (session: CompilerSession) => (session as any).plugin_arena;

/** a trace is a carve of a shared slab, only its own words compare */
function trace_words({ trace }: { trace: MapTrace }) {
	return {
		words: Array.from(trace.buf.subarray(trace.start, trace.end)),
		split: trace.split - trace.start,
	};
}

describe('CompilerSession with parse plugins', () => {
	test('reuses its tree, dispatcher and renderer across documents', () => {
		const options = { parse_plugins: [autolink], sourcemap: true };
		const compiler = new CompilerSession();
		const renderer = (compiler as any).renderer;

		compiler.compile('plain\n', options);
		const arena = arena_of(compiler);
		expect(arena).not.toBe(null);
		const { tree, dispatcher, parser, text } = arena;
		const nodes = tree.get_buffer();
		// only headings need the dispatcher until a wrap_inner makes a redirect
		const wants = dispatcher.open_wants;
		expect(wants.some((w: number) => w === 0)).toBe(true);

		for (const source of plugin_documents) {
			expect(compiler.compile(source, options)).toEqual(
				compile(source, options)
			);
			expect(arena_of(compiler)).toBe(arena);
			expect(arena.tree).toBe(tree);
			expect(arena.tree.get_buffer()).toBe(nodes);
			expect(arena.dispatcher).toBe(dispatcher);
			expect(arena.parser).toBe(parser);
			expect(arena.text).toBe(text);
			expect((compiler as any).renderer).toBe(renderer);
		}

		// a wrap_inner redirect switches open_wants to every kind
		compiler.compile('# heading\n', options);
		expect(dispatcher.open_wants).not.toBe(wants);
		compiler.compile('plain\n', options);
		expect(dispatcher.open_wants).toBe(wants);
	});

	test('many documents in a row with a wrap_inner plugin match one-shot output', () => {
		const compiler = new CompilerSession();
		const plugins = [autolink];

		for (let pass = 0; pass < 4; pass++) {
			for (const source of plugin_documents) {
				for (const sourcemap of [false, true]) {
					const options = { parse_plugins: plugins, sourcemap };
					expect(compiler.compile(source, options)).toEqual(
						compile(source, options)
					);
				}
			}
		}
		// crlf collapses to a shorter source than the one before it
		for (const source of plugin_documents) {
			const crlf = source.replace(/\n/g, '\r\n');
			const options = { parse_plugins: plugins, sourcemap: true };
			expect(compiler.compile(crlf, options)).toEqual(compile(crlf, options));
		}
	});

	const structural: ParsePlugin = {
		paragraph: {
			parse(node) {
				node.prepend('emphasis');
				return () => {
					node.append('strong_emphasis');
				};
			},
		},
		strong_emphasis: {
			parse(node) {
				node.attrs.class = 'strong';
				node.parent!.attrs['data-strong'] = 'yes';
			},
		},
		list_item: {
			parse(node) {
				node.wrap_inner('emphasis');
			},
		},
	};
	const retype: ParsePlugin = {
		sequential: true,
		heading: {
			parse(node) {
				if (node.depth === 4) node.type = 'paragraph';
			},
		},
		link: {
			parse(node) {
				node.wrap_inner('strong_emphasis');
			},
		},
	};
	const plugin_sets: [string, ParsePlugin[]][] = [
		['attrs and wrap_inner', [autolink]],
		['prepend, append and cross-node attrs', [structural]],
		['a sequential pass', [autolink, retype]],
		['all of them', [structural, autolink, retype]],
	];

	test.each(plugin_sets)(
		'%s: the session matches one-shot compile on every entry point',
		(_, plugins) => {
			const session = new CompilerSession();
			for (let pass = 0; pass < 2; pass++) {
				for (const source of plugin_documents) {
					for (const sourcemap of [false, true]) {
						const options = { parse_plugins: plugins, sourcemap };
						expect(session.compile(source, options)).toEqual(
							compile(source, options)
						);
					}
					const fresh = new CompilerSession();
					expect(
						JSON.stringify(session.compile_v3(source, '/a.svx', plugins))
					).toBe(JSON.stringify(fresh.compile_v3(source, '/a.svx', plugins)));
					const trace = session.compile_trace(source, plugins);
					expect(trace.code).toBe(
						compile(source, { parse_plugins: plugins }).code
					);
					expect(trace_words(trace)).toEqual(
						trace_words(new CompilerSession().compile_trace(source, plugins))
					);
				}
			}
		}
	);

	test('documents with and without plugins share one session', () => {
		const compiler = new CompilerSession();
		const options = { parse_plugins: [autolink], sourcemap: true };

		for (let pass = 0; pass < 3; pass++) {
			for (const source of plugin_documents) {
				expect(compiler.compile(source, options)).toEqual(
					compile(source, options)
				);
				expect(compiler.compile(source, { sourcemap: true })).toEqual(
					compile(source, { sourcemap: true })
				);
				// an empty array is no plugins
				expect(compiler.compile(source, { parse_plugins: [] })).toEqual(
					compile(source)
				);
			}
		}
	});

	test('a prior result survives the reset of the plugin arena', () => {
		const compiler = new CompilerSession();
		const options = { parse_plugins: [autolink], sourcemap: true };
		const first = compiler.compile(plugin_documents[0], options);
		const snapshot = structuredClone(first);

		for (let i = 0; i < 20; i++) {
			compiler.compile(plugin_documents[i % plugin_documents.length], options);
		}

		expect(first).toEqual(snapshot);
	});

	test('a throw in a plugin drops the arena, the next document compiles', () => {
		const throws: ParsePlugin = {
			heading: {
				parse(node) {
					// mid document, with a redirect and a close callback live
					node.wrap_inner('link');
					return () => {
						if (node.text_content === 'boom') throw new Error('boom');
					};
				},
			},
		};
		const options = { parse_plugins: [throws] };
		const compiler = new CompilerSession();

		expect(compiler.compile('# fine\n', options)).toEqual(
			compile('# fine\n', options)
		);
		const arena = arena_of(compiler);

		expect(() =>
			compiler.compile('para *open\n\n# boom\n\n# after\n', options)
		).toThrow('boom');
		expect(arena_of(compiler)).toBe(null);
		expect((compiler as any).plugin_busy).toBe(false);

		for (const source of plugin_documents) {
			expect(compiler.compile(source, options)).toEqual(
				compile(source, options)
			);
		}
		expect(arena_of(compiler)).not.toBe(null);
		expect(arena_of(compiler)).not.toBe(arena);
		expect(compiler.compile(documents[0])).toEqual(compile(documents[0]));
	});

	test('a throw in an open handler drops the arena too', () => {
		const throws: ParsePlugin = {
			strong_emphasis: {
				parse(node) {
					node.parent!.wrap_inner('link');
					node.attrs.id = 'x';
					throw new Error('open');
				},
			},
		};
		const options = { parse_plugins: [throws] };
		const compiler = new CompilerSession();
		compiler.compile('plain\n', options);

		expect(() => compiler.compile('a *b* c\n', options)).toThrow('open');
		expect(arena_of(compiler)).toBe(null);
		expect(compiler.compile('plain `code`\n', options)).toEqual(
			compile('plain `code`\n', options)
		);
	});

	test('a throw after the parse keeps the arena', () => {
		const options: CompileOptions = {
			parse_plugins: [autolink],
			template: 'missing',
		};
		const compiler = new CompilerSession();
		const good = { parse_plugins: options.parse_plugins };
		compiler.compile('# a\n', good);
		const arena = arena_of(compiler);

		expect(() => compiler.compile('# b\n', options)).toThrow(
			'Unknown template'
		);
		expect(arena_of(compiler)).toBe(arena);
		expect(compiler.compile('# c *d\n', good)).toEqual(
			compile('# c *d\n', good)
		);
		expect(arena_of(compiler)).toBe(arena);
	});

	test('a new plugins array rebuilds the arena', () => {
		const set_id = (id: string): ParsePlugin => ({
			heading: {
				parse(node) {
					node.attrs.id = id;
				},
			},
		});
		const a = [set_id('a')];
		const b = [set_id('b')];
		const compiler = new CompilerSession();

		expect(compiler.compile('# x\n', { parse_plugins: a }).code).toBe(
			'<h1 id="a">x</h1>'
		);
		const first = arena_of(compiler);
		expect(first.plugins).toBe(a);

		expect(compiler.compile('# x\n', { parse_plugins: b }).code).toBe(
			'<h1 id="b">x</h1>'
		);
		const second = arena_of(compiler);
		expect(second).not.toBe(first);
		expect(second.plugins).toBe(b);
		expect(second.dispatcher).not.toBe(first.dispatcher);
		expect(second.tree).not.toBe(first.tree);
		expect(second.parser).toBe(first.parser);

		// an equal array is still another array
		const again = [a[0]];
		expect(compiler.compile('# x\n', { parse_plugins: again }).code).toBe(
			'<h1 id="a">x</h1>'
		);
		expect(arena_of(compiler)).not.toBe(second);
		expect(arena_of(compiler).plugins).toBe(again);

		const kept = arena_of(compiler);
		compiler.compile('# y\n', { parse_plugins: again });
		expect(arena_of(compiler)).toBe(kept);
	});

	test('a change in the reserved directives rebuilds the arena', () => {
		const seen: string[] = [];
		const plugins: ParsePlugin[] = [
			{
				directive_leaf: {
					parse(node) {
						node.type = 'paragraph';
						// the parser sets the name after the open
						return () => {
							seen.push(String(node.attrs.name));
						};
					},
				},
			},
		];
		const source = '::note[a]\n\n::other[b]\n';
		const open: CompileOptions = { parse_plugins: plugins };
		// a template that renders note keeps it from the plugin
		const reserved: CompileOptions = {
			parse_plugins: plugins,
			templates: {
				page: {
					specifier: './Page.svelte',
					directives: [{ specifier: './d.js', names: ['note'] }],
				},
			},
			template: 'page',
		};
		const compiler = new CompilerSession();

		expect(compiler.compile(source, open)).toEqual(compile(source, open));
		const first = arena_of(compiler);
		expect(first.reserved).toBe(null);

		expect(compiler.compile(source, reserved)).toEqual(
			compile(source, reserved)
		);
		const second = arena_of(compiler);
		expect(second).not.toBe(first);
		expect(second.reserved).not.toBe(null);

		expect(compiler.compile(source, reserved)).toEqual(
			compile(source, reserved)
		);
		expect(arena_of(compiler)).toBe(second);

		expect(compiler.compile(source, open)).toEqual(compile(source, open));
		expect(arena_of(compiler)).not.toBe(second);

		// every compile runs twice, on the session and through compile
		const open_run = ['note', 'other'];
		const reserved_run = ['other'];
		expect(seen).toEqual([
			...open_run,
			...open_run,
			...reserved_run,
			...reserved_run,
			...reserved_run,
			...reserved_run,
			...open_run,
			...open_run,
		]);
	});

	test('a compile started in a plugin handler leaves the session intact', () => {
		const inner_source = '# Inner *x*\n\n- a\n- b\n';
		const results: Record<string, unknown> = {};
		let compiler: CompilerSession | null = null;
		let nested = 0;
		const reenter: ParsePlugin = {
			heading: {
				parse(node) {
					const link = node.wrap_inner('link');
					return () => {
						const text = node.text_content;
						node.attrs.id = slugify(text);
						link.attrs.href = '#' + slugify(text);
						if (text !== 'Outer' || compiler === null) return;
						nested++;
						// the same options, other plugins, and none at all
						results.same = compiler.compile(inner_source, options);
						results.other = compiler.compile(inner_source, {
							parse_plugins: [autolink],
						});
						results.plain = compiler.compile(inner_source);
						results.v3 = compiler.compile_v3(inner_source, '/in.svx', plugins);
						results.trace = compiler.compile_trace(inner_source, plugins).code;
						const out: any = {};
						compiler.compile_trace_into(inner_source, plugins, out);
						results.into = out.html;
					};
				},
			},
		};
		const plugins = [reenter];
		const options = { parse_plugins: plugins, sourcemap: true };
		const outer_source = 'before *open\n\n# Outer\n\nafter `code` *open\n';

		const expected_outer = compile(outer_source, options);
		const expected_inner = compile(inner_source, options);

		compiler = new CompilerSession();
		compiler.compile('# warm\n', options);
		const arena = arena_of(compiler);

		expect(compiler.compile(outer_source, options)).toEqual(expected_outer);
		expect(nested).toBe(1);
		expect(results.same).toEqual(expected_inner);
		expect(results.other).toEqual(
			compile(inner_source, { parse_plugins: [autolink] })
		);
		expect(results.plain).toEqual(compile(inner_source));
		expect(JSON.stringify(results.v3)).toBe(
			JSON.stringify(
				new CompilerSession().compile_v3(inner_source, '/in.svx', plugins)
			)
		);
		expect(results.trace).toBe(expected_inner.code);
		expect(results.into).toBe(expected_inner.code);

		expect(arena_of(compiler)).toBe(arena);
		expect((compiler as any).plugin_busy).toBe(false);
		expect(compiler.compile(outer_source, options)).toEqual(expected_outer);
		expect(nested).toBe(2);
	});

	test('a compile started in a sequential handler goes one-shot too', () => {
		let compiler: CompilerSession | null = null;
		let inner: unknown;
		const plugins: ParsePlugin[] = [
			autolink,
			{
				sequential: true,
				heading: {
					parse(node) {
						if (node.attrs.id === 'outer' && compiler !== null) {
							inner = compiler.compile('# In\n', { parse_plugins: plugins });
						}
					},
				},
			},
		];
		const options = { parse_plugins: plugins };
		const expected = compile('# Outer\n\ntext\n', options);
		const expected_inner = compile('# In\n', options);

		compiler = new CompilerSession();
		expect(compiler.compile('# Outer\n\ntext\n', options)).toEqual(expected);
		expect(inner).toEqual(expected_inner);
	});

	test('each document gets a fresh plugin context', () => {
		const counting: ParsePlugin = {
			heading: {
				parse(node, ctx: { count?: number }) {
					ctx.count = (ctx.count ?? 0) + 1;
					node.attrs.id = 'h' + ctx.count;
				},
			},
		};
		const options = { parse_plugins: [counting] };
		const compiler = new CompilerSession();
		for (let i = 0; i < 3; i++) {
			expect(compiler.compile('# a\n\n# b\n', options).code).toBe(
				'<h1 id="h1">a</h1><h1 id="h2">b</h1>'
			);
		}
	});

	test('a node view kept past its compile throws once the next one starts', () => {
		const kept: any[] = [];
		const keeps: ParsePlugin = {
			heading: {
				parse(node) {
					kept.push(node);
				},
			},
		};
		const options = { parse_plugins: [keeps] };
		const compiler = new CompilerSession();

		compiler.compile('# first\n', options);
		const view = kept[0];
		const attrs = view.attrs;
		// until then it still reads its own document
		expect(view.type).toBe('heading');
		expect(view.text_content).toBe('first');

		compiler.compile('second\n\n# third\n', options);
		const stale = /NodeView was used after its document/;
		expect(() => view.type).toThrow(stale);
		expect(() => view.text_content).toThrow(stale);
		expect(() => view.parent).toThrow(stale);
		expect(() => view.depth).toThrow(stale);
		expect(() => (view.type = 'paragraph')).toThrow(stale);
		expect(() => view.wrap_inner('link')).toThrow(stale);
		expect(() => view.append('link')).toThrow(stale);
		expect(() => view.prepend('link')).toThrow(stale);
		expect(() => view.attrs.id).toThrow(stale);
		expect(() => (attrs.id = 'late')).toThrow(stale);
		expect(() => delete attrs.id).toThrow(stale);
		expect(() => Object.keys(attrs)).toThrow(stale);

		expect(kept[1].text_content).toBe('third');
		expect(compiler.compile('second\n\n# third\n', options)).toEqual(
			compile('second\n\n# third\n', options)
		);
	});
});
