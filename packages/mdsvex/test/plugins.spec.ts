import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

import {
	compile,
	CompilerSession,
	DirectiveError,
	DirectiveOwnerError,
} from '../src/main';
import { check_plugins } from '../src/compile';
import type { Bundle, ComponentSource, ParsePlugin } from '../src/main';

const STEPS_MODULE = '@acme/steps/directives';

/** the steps plugin of the design, static is set and must not matter yet */
function steps(log?: string[]): Bundle {
	return {
		name: 'steps',
		module: STEPS_MODULE,
		directives: {
			steps: {
				static: true,
				children: {
					heading(node, ctx) {
						log?.push('heading ' + ctx.index);
						ctx.state.step?.close();
						ctx.state.step = node.wrap_from('directive_container', {
							name: 'step',
						});
						node.wrap_from('directive_label').close();
					},
				},
			},
			step: { static: true },
		},
	};
}

const DOC =
	':::steps[]\n\nintro\n\n## One\n\nfirst\n\n## Two\n\nsecond\n:::\n\nafter\n';

/** the body after the generated script */
function body(code: string): string {
	return code.replace(/^<script>\n[^]*?<\/script>/, '');
}

function imports_of(code: string): string {
	const m = /^<script>\n([^]*?)<\/script>/.exec(code);
	return m === null ? '' : m[1];
}

const STEPS_BODY =
	'<Steps_MDSVEX_D_G>\n<p>intro</p>' +
	'<Step_MDSVEX_D_G>{#snippet label()}<h2>One</h2>{/snippet}\n<p>first</p>\n</Step_MDSVEX_D_G>' +
	'<Step_MDSVEX_D_G>{#snippet label()}<h2>Two</h2>{/snippet}\n<p>second</p>\n</Step_MDSVEX_D_G>' +
	'\n</Steps_MDSVEX_D_G><p>after</p>';

function arena_of(compiler: CompilerSession): any {
	return (compiler as any).plugin_arena;
}

describe('a steps bundle', () => {
	test('compiles to step components with a label and children', () => {
		const { code } = compile(DOC, { plugins: [steps()] });
		expect(imports_of(code)).toBe(
			`import { steps as Steps_MDSVEX_D_G, step as Step_MDSVEX_D_G } from '${STEPS_MODULE}';\n`
		);
		expect(body(code)).toBe(STEPS_BODY);
		svelte_compile(code, { generate: 'client' });
	});

	test('every compile entry point gives the same code', () => {
		const plugins = [steps()];
		const plain = compile(DOC, { plugins }).code;
		expect(compile(DOC, { plugins, sourcemap: true }).code).toBe(plain);
		const session = new CompilerSession();
		expect(session.compile(DOC, { plugins }).code).toBe(plain);
		expect(session.compile(DOC, { plugins, sourcemap: true }).code).toBe(plain);
	});

	test('the handlers fire for the container written without brackets', () => {
		const bare = DOC.replace(':::steps[]', ':::steps');
		expect(bare).not.toBe(DOC);
		const log: string[] = [];
		const { code } = compile(bare, { plugins: [steps(log)] });
		expect(log).toEqual(['heading 0', 'heading 1']);
		expect(imports_of(code)).toBe(
			`import { steps as Steps_MDSVEX_D_G, step as Step_MDSVEX_D_G } from '${STEPS_MODULE}';\n`
		);
		expect(body(code)).toBe(STEPS_BODY);
		svelte_compile(code, { generate: 'client' });

		const plugins = [steps()];
		expect(compile(bare, { plugins, sourcemap: true }).code).toBe(code);
		const session = new CompilerSession();
		expect(session.compile(bare, { plugins }).code).toBe(code);
		expect(session.compile(bare, { plugins, sourcemap: true }).code).toBe(code);
	});

	test('bare containers scope the handlers as bracketed ones do', () => {
		const pairs = [
			':::steps[]\n## Only\n:::\n',
			'::::steps[]\n## A\n\n:::steps[]\n## A1\n:::\n\n## B\n::::\n',
			':::steps[]\n## Unclosed\n\ntext',
			'## Out\n\n:::steps[]\n> ## Quoted\n\n## In\n:::\n',
			':::steps[](a=1)\n## One\n:::\n\n## After\n',
		];
		for (const bracketed of pairs) {
			const bare = bracketed.replaceAll('[]', '');
			const a: string[] = [];
			const b: string[] = [];
			expect(compile(bare, { plugins: [steps(a)] }).code, bare).toBe(
				compile(bracketed, { plugins: [steps(b)] }).code
			);
			expect(a, bare).toEqual(b);
			expect(a.length, bare).toBeGreaterThan(0);
		}
	});

	test('an unknown bare directive beside a bundle is still an error', () => {
		const e = (() => {
			try {
				compile('text\n\n:::other\nbody\n:::\n', { plugins: [steps()] });
			} catch (err) {
				return err as DirectiveError;
			}
			throw new Error('did not throw');
		})();
		expect(e).toBeInstanceOf(DirectiveError);
		expect(e.directive).toBe(':::other');
		expect([e.line, e.column]).toEqual([3, 1]);
	});

	test('the long form gives the same tree without the handlers', () => {
		const long =
			':::::steps[]\n\nintro\n\n::::step[## One]\nfirst\n::::\n\n::::step[## Two]\nsecond\n::::\n:::::\n\nafter\n';
		const { code } = compile(long, { plugins: [steps()] });
		expect(code).toContain('<Step_MDSVEX_D_G>{#snippet label()}');
		expect(code.match(/<Step_MDSVEX_D_G>/g)).toHaveLength(2);
	});

	test('a heading outside the directive, or nested deeper, starts no step', () => {
		const { code } = compile(
			'## Out\n\n:::steps[]\n> ## Quoted\n\n## In\n:::\n',
			{ plugins: [steps()] }
		);
		expect(body(code)).toBe(
			'<h2>Out</h2><Steps_MDSVEX_D_G>\n<blockquote>\n<h2>Quoted</h2>\n</blockquote>' +
				'<Step_MDSVEX_D_G>{#snippet label()}<h2>In</h2>{/snippet}</Step_MDSVEX_D_G>' +
				'\n</Steps_MDSVEX_D_G>'
		);
	});

	test('a document that uses no bundle directive is untouched', () => {
		expect(compile('# x\n\ntext\n', { plugins: [steps()] }).code).toBe(
			compile('# x\n\ntext\n').code
		);
	});

	test('a directive no bundle owns is still an error', () => {
		expect(() => compile('::other[]\n', { plugins: [steps()] })).toThrow(
			DirectiveError
		);
	});
});

describe('precedence', () => {
	const mine = (...names: string[]): ComponentSource[] => [
		{ specifier: 'mdsvex:directives', names },
	];

	test('two bundles that own one name are a DirectiveOwnerError', () => {
		const other: Bundle = {
			name: 'other',
			module: '@acme/other',
			directives: { step: {} },
		};
		let error: unknown;
		try {
			compile(DOC, { plugins: [steps(), other] });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(DirectiveOwnerError);
		expect(error).toMatchObject({
			directive: 'step',
			plugins: ['steps', 'other'],
			message:
				'plugin "steps" and plugin "other" both own directive "step", a directive has one owner, another plugin can observe it',
		});
		expect(() => check_plugins([steps(), other])).toThrow(DirectiveOwnerError);
	});

	test('the directives option replaces a component, the handlers still run', () => {
		const log: string[] = [];
		const { code } = compile(DOC, {
			plugins: [steps(log)],
			directives: mine('step', 'note'),
		});
		expect(imports_of(code)).toBe(
			`import { steps as Steps_MDSVEX_D_G } from '${STEPS_MODULE}';\n` +
				"import { step as Step_MDSVEX_D_G } from 'mdsvex:directives';\n"
		);
		expect(body(code)).toBe(STEPS_BODY);
		expect(log).toEqual(['heading 0', 'heading 1']);
	});

	test('replacing the directive that has the handlers keeps them too', () => {
		const { code } = compile(DOC, {
			plugins: [steps()],
			directives: mine('steps'),
		});
		expect(imports_of(code)).toBe(
			"import { steps as Steps_MDSVEX_D_G } from 'mdsvex:directives';\n" +
				`import { step as Step_MDSVEX_D_G } from '${STEPS_MODULE}';\n`
		);
		expect(body(code)).toBe(STEPS_BODY);
	});

	test('a template directive sits in front of both', () => {
		const options = {
			plugins: [steps()],
			directives: mine('step'),
			templates: {
				docs: {
					specifier: 'mdsvex:template/docs',
					directives: [
						{ specifier: 'mdsvex:template-directives/docs', names: ['step'] },
					],
				},
			},
		};
		const with_template = compile('---\ntemplate: docs\n---\n' + DOC, options);
		expect(imports_of(with_template.code)).toContain(
			"import { step as Step_MDSVEX_D_T } from 'mdsvex:template-directives/docs';\n"
		);
		expect(imports_of(with_template.code)).toContain(
			`import { steps as Steps_MDSVEX_D_G } from '${STEPS_MODULE}';\n`
		);
		expect(imports_of(compile(DOC, options).code)).toContain(
			"import { step as Step_MDSVEX_D_G } from 'mdsvex:directives';\n"
		);
	});

	test('bundle element replacements sit below the components option', () => {
		const bundle: Bundle = {
			name: 'elements',
			components: { specifier: '@acme/elements', names: ['h1', 'p'] },
		};
		const alone = compile('# x\n\ny\n', { plugins: [bundle] }).code;
		expect(imports_of(alone)).toBe(
			"import { h1 as H1_MDSVEX_G, p as P_MDSVEX_G } from '@acme/elements';\n"
		);
		const both = compile('# x\n\ny\n', {
			plugins: [bundle],
			components: [{ specifier: 'mdsvex:components', names: ['p'] }],
		}).code;
		expect(imports_of(both)).toBe(
			"import { h1 as H1_MDSVEX_G } from '@acme/elements';\n" +
				"import { p as P_MDSVEX_G } from 'mdsvex:components';\n"
		);
	});
});

describe('a handler for a child of any type', () => {
	test('a bundle sees every child of its directive and warns where one is stray', () => {
		const bundle = steps();
		bundle.directives!.steps.children!['*'] = (node, ctx) => {
			if (ctx.state.step === undefined && node.type !== 'directive_label')
				ctx.warn('before_first_step', `a ${node.type} is in no step`, node);
		};
		const { code, warnings } = compile(
			':::steps[]\nstray\n\n## One\n\nfine\n:::\n',
			{ plugins: [bundle] }
		);
		expect(code).toContain('<p>stray</p><Step_MDSVEX_D_G>');
		expect(warnings).toEqual([
			{
				code: 'before_first_step',
				message: 'a paragraph is in no step',
				plugin: 'steps',
				start: { line: 2, column: 0 },
			},
		]);
	});
});

describe('the guard', () => {
	const watch = (seen: string[]): ParsePlugin => {
		const handler = {
			parse(node: any) {
				return () => void seen.push(node.type + ' ' + node.attrs.name);
			},
		};
		return {
			directive_container: handler,
			directive_leaf: handler,
			directive_inline: handler,
		};
	};

	test('global directive handlers never see a directive a bundle owns', () => {
		const seen: string[] = [];
		const inside: string[] = [];
		const bundle = steps();
		// the document wide plugin of the bundle is guarded like any other
		bundle.parse = watch(inside);
		const raw = DOC + '\n::step[x]\n\n:::free[]\ny\n:::\n';
		const { code } = compile(raw, {
			plugins: [bundle],
			parse_plugins: [watch(seen)],
			strict_directives: false,
		});
		expect(code).toContain('<Steps_MDSVEX_D_G>');
		expect(seen).toEqual(['directive_container free']);
		expect(inside).toEqual(['directive_container free']);
	});

	test('a global directive handler runs at the open, with the name', () => {
		const seen: string[] = [];
		const order: ParsePlugin = {
			directive_container: {
				parse(node) {
					seen.push('open ' + node.attrs.name + ' ' + node.attrs.args?.kind);
					return () => void seen.push('close ' + node.attrs.name);
				},
			},
			paragraph: {
				parse() {
					seen.push('paragraph');
				},
			},
		};
		compile(':::free(kind=tip)\ny\n:::\n', {
			parse_plugins: [order],
			strict_directives: false,
		});
		expect(seen).toEqual(['open free tip', 'paragraph', 'close free']);
	});

	test('bound handlers of an outer directive do see the directives inside it', () => {
		const seen: string[] = [];
		const tabs: Bundle = {
			name: 'tabs',
			module: '@acme/tabs',
			directives: {
				tabs: {
					children: {
						directive_container(node) {
							return () => void seen.push(node.attrs.name);
						},
					},
				},
				tab: {},
			},
		};
		compile('::::tabs[]\n:::tab[A]\na\n:::\n\n:::tab[B]\nb\n:::\n::::\n', {
			plugins: [tabs],
		});
		expect(seen).toEqual(['tab', 'tab']);
	});

	test("the directive's own parse reads the args and writes one", () => {
		const tabs: Bundle = {
			name: 'tabs',
			module: '@acme/tabs',
			directives: {
				tabs: {
					parse(node, ctx) {
						expect(node.attrs.args).toEqual({ sync: 'os' });
						return () => {
							node.attrs.args = {
								...node.attrs.args,
								count: String(ctx.state.count ?? 0),
							};
						};
					},
					children: {
						heading(_, ctx) {
							ctx.state.count = ctx.index + 1;
						},
					},
				},
			},
		};
		expect(
			body(
				compile(':::tabs[](sync=os)\n## A\n\n## B\n:::\n', { plugins: [tabs] })
					.code
			)
		).toBe(
			'<Tabs_MDSVEX_D_G sync="os" count="2">\n<h2>A</h2><h2>B</h2>\n</Tabs_MDSVEX_D_G>'
		);
	});
});

describe('observers', () => {
	/** numbers each steps directive and reads the steps the owner made */
	const counting = (log: string[]): ParsePlugin => ({
		name: 'count',
		observe: {
			steps: {
				parse(node, ctx) {
					log.push('observer open');
					return () => {
						let made = 0;
						for (let c = node.first_child; c !== null; c = c.next) {
							if (c.type === 'directive_container') made++;
						}
						ctx.set('steps', made);
					};
				},
				children: {
					heading(node, ctx) {
						log.push('observer heading in ' + node.parent!.type);
						try {
							node.attrs.id = 'x';
						} catch (e) {
							log.push((e as Error).message);
						}
						ctx.add('headings', ctx.index);
					},
				},
			},
		},
	});

	test('a bundle observes the directive another bundle owns', () => {
		const log: string[] = [];
		const watcher: Bundle = { name: 'count', parse: counting(log) };
		const out = compile(DOC, { plugins: [steps(log), watcher] });
		// the data is exported from a module script ahead of the body
		expect(out.code.endsWith(STEPS_BODY)).toBe(true);
		expect(out.data).toEqual({ count: { steps: 2, headings: [0, 1] } });
		expect(log).toEqual([
			'observer open',
			'heading 0',
			'observer heading in directive_label',
			'node.attrs: plugin "count" observes directive "steps", which plugin "steps" owns, an observer changes no node, it writes what it finds with ctx.set or ctx.add',
			'heading 1',
			'observer heading in directive_label',
			'node.attrs: plugin "count" observes directive "steps", which plugin "steps" owns, an observer changes no node, it writes what it finds with ctx.set or ctx.add',
		]);
	});

	test('so does a parse plugin, in either order, and the guard stays', () => {
		const log: string[] = [];
		const out = compile(DOC, {
			parse_plugins: [counting(log)],
			plugins: [steps()],
		});
		// the data is exported from a module script ahead of the body
		expect(out.code.endsWith(STEPS_BODY)).toBe(true);
		expect(out.data).toEqual({ count: { steps: 2, headings: [0, 1] } });
		const first = compile(DOC, {
			plugins: [{ name: 'count', parse: counting([]) }, steps()],
		});
		expect(first.data).toEqual(out.data);
	});

	test('with a component of the directives option and no bundle', () => {
		const out = compile(':::steps[]\n## One\n:::\n', {
			parse_plugins: [counting([])],
			directives: [{ specifier: 'mdsvex:directives', names: ['steps'] }],
		});
		expect(out.data).toEqual({ count: { steps: 0, headings: [0] } });
	});

	test('the error names an owner that binds no handler', () => {
		const log: string[] = [];
		const owner: Bundle = {
			name: 'figures',
			module: '@acme/figures',
			directives: { figure: {} },
		};
		const watcher: ParsePlugin = {
			name: 'numbering',
			observe: {
				figure: {
					parse(node) {
						try {
							node.attrs.id = 'x';
						} catch (e) {
							log.push((e as Error).message);
						}
					},
				},
			},
		};
		compile(':::figure[]\nx\n:::\n', {
			plugins: [owner],
			parse_plugins: [watcher],
		});
		compile(':::figure[]\nx\n:::\n', {
			plugins: [owner, { name: 'numbering', parse: watcher }],
		});
		const message =
			'node.attrs: plugin "numbering" observes directive "figure", which plugin "figures" owns, an observer changes no node, it writes what it finds with ctx.set or ctx.add';
		expect(log).toEqual([message, message]);
	});

	test('a session reuses its plugins and observes each document', () => {
		const session = new CompilerSession();
		const plugins = [steps(), { name: 'count', parse: counting([]) }];
		expect(session.compile(DOC, { plugins }).data).toEqual({
			count: { steps: 2, headings: [0, 1] },
		});
		expect(
			session.compile(':::steps[]\n## A\n:::\n', { plugins }).data
		).toEqual({ count: { steps: 1, headings: [0] } });
	});
});

describe('with parse_plugins', () => {
	const ids = (log: string[]): ParsePlugin => ({
		heading: {
			parse(node) {
				log.push('parse_plugins ' + node.parent!.attrs.name);
				return () => {
					node.attrs.id = node.text_content.toLowerCase();
				};
			},
		},
	});

	test('parse_plugins alone compiles as before', () => {
		const log: string[] = [];
		expect(compile('# One\n', { parse_plugins: [ids(log)] }).code).toBe(
			'<h1 id="one">One</h1>'
		);
	});

	test('together, a bound handler runs first and both apply', () => {
		const log: string[] = [];
		const { code } = compile(DOC, {
			plugins: [steps(log)],
			parse_plugins: [ids(log)],
		});
		expect(code).toContain('{#snippet label()}<h2 id="one">One</h2>{/snippet}');
		expect(code).toContain('{#snippet label()}<h2 id="two">Two</h2>{/snippet}');
		// the global handler already sees the label the bound one made
		expect(log).toEqual([
			'heading 0',
			'parse_plugins undefined',
			'heading 1',
			'parse_plugins undefined',
		]);
	});

	test('the parse of a bundle runs ahead of parse_plugins', () => {
		const log: string[] = [];
		const bundle: Bundle = {
			name: 'global',
			parse: { heading: { parse: () => void log.push('bundle') } },
		};
		compile('# x\n', {
			plugins: [bundle],
			parse_plugins: [{ heading: { parse: () => void log.push('option') } }],
		});
		expect(log).toEqual(['bundle', 'option']);
	});
});

describe('CompilerSession with bundles', () => {
	const documents = [
		DOC,
		'plain\n',
		':::steps[]\n## Only\n:::\n',
		'# no directive\n\n- a\n- b\n',
		'::::steps[]\n## A\n\n:::steps[]\n## A1\n:::\n\n## B\n::::\n',
		':::steps[]\n## Unclosed\n\ntext',
	];

	test('one arena and one dispatcher serve every document', () => {
		const options = { plugins: [steps()], sourcemap: true };
		const compiler = new CompilerSession();
		compiler.compile('plain\n', options);
		const arena = arena_of(compiler);
		expect(arena).not.toBe(null);
		const { dispatcher, tree, bound, plugins } = arena;
		expect(bound).toHaveLength(1);
		expect(plugins).toBe(undefined);
		const wants = dispatcher.open_wants;
		for (const source of documents) {
			expect(compiler.compile(source, options)).toEqual(
				compile(source, options)
			);
			expect(arena_of(compiler)).toBe(arena);
			expect(arena.dispatcher).toBe(dispatcher);
			expect(arena.tree).toBe(tree);
			expect(arena.bound).toBe(bound);
			// the scope of the last document is gone, an unclosed one too
			expect(dispatcher.open_wants).toBe(wants);
			expect(dispatcher.quiet()).toBe(true);
		}
	});

	test('the arrays derived from the bundles keep their identity', () => {
		const log: string[] = [];
		const bundle = steps();
		bundle.parse = {
			directive_leaf: { parse: () => void log.push('leaf') },
		};
		const options = {
			plugins: [bundle],
			parse_plugins: [
				{ heading: { parse: () => void log.push('heading') } } as ParsePlugin,
			],
			directives: [{ specifier: 'mdsvex:directives', names: ['note'] }],
		};
		const compiler = new CompilerSession();
		compiler.compile(DOC, options);
		const arena = arena_of(compiler);
		// the bundle plugin ahead of the option, merged once
		expect(arena.plugins).toHaveLength(2);
		const { plugins, bound, reserved, dispatcher } = arena;
		compiler.compile('::note[]\n\n::free[]\n', {
			...options,
			strict_directives: false,
		});
		expect(arena_of(compiler)).toBe(arena);
		expect(arena.plugins).toBe(plugins);
		expect(arena.bound).toBe(bound);
		expect(arena.reserved).toBe(reserved);
		expect(arena.dispatcher).toBe(dispatcher);
		expect(log).toEqual(['heading', 'heading', 'leaf']);
	});

	test('a new bundles array rebuilds the arena', () => {
		const compiler = new CompilerSession();
		const first = [steps()];
		compiler.compile(DOC, { plugins: first });
		const arena = arena_of(compiler);
		compiler.compile(DOC, { plugins: first });
		expect(arena_of(compiler)).toBe(arena);
		compiler.compile(DOC, { plugins: [steps()] });
		expect(arena_of(compiler)).not.toBe(arena);
	});

	test('documents with and without bundles share one session', () => {
		const compiler = new CompilerSession();
		const plugins = [steps()];
		expect(compiler.compile(DOC, { plugins }).code).toBe(
			compile(DOC, { plugins }).code
		);
		expect(compiler.compile('# x\n').code).toBe('<h1>x</h1>');
		expect(compiler.compile(DOC, { plugins }).code).toBe(
			compile(DOC, { plugins }).code
		);
	});

	test('bundles with no handler and no parse need no dispatcher', () => {
		const compiler = new CompilerSession();
		const plain: Bundle = {
			name: 'plain',
			module: '@acme/plain',
			directives: { note: {}, tip: { static: true } },
		};
		expect(compiler.compile('::note[]\n', { plugins: [plain] }).code).toBe(
			"<script>\nimport { note as Note_MDSVEX_D_G } from '@acme/plain';\n</script><Note_MDSVEX_D_G />"
		);
		expect(arena_of(compiler)).toBe(null);
	});

	test('a compile started in a bound handler leaves the session intact', () => {
		const compiler = new CompilerSession();
		let inner = '';
		const nested: Bundle = {
			name: 'nested',
			module: '@acme/nested',
			directives: {
				box: {
					children: {
						paragraph() {
							inner = compiler.compile(DOC, { plugins: [steps()] }).code;
						},
					},
				},
			},
		};
		const outer = compiler.compile(':::box[]\ntext\n:::\n', {
			plugins: [nested],
		}).code;
		expect(body(inner)).toBe(STEPS_BODY);
		expect(body(outer)).toBe(
			'<Box_MDSVEX_D_G>\n<p>text</p>\n</Box_MDSVEX_D_G>'
		);
	});
});

describe('bundle validation', () => {
	const bad = (bundle: unknown) => () =>
		compile('x\n', { plugins: [bundle as Bundle] });

	test('names the plugin and what is wrong', () => {
		expect(bad(steps)).toThrow(
			'[mdsvex] plugins[0] must be an object, call the plugin'
		);
		expect(bad({})).toThrow('[mdsvex] plugins[0] needs a name');
		expect(bad({ name: 'x', directives: { a: {} } })).toThrow(
			'[mdsvex] plugins[0] (x) needs a module, the specifier its directive components are exported from'
		);
		expect(bad({ name: 'x', module: 'm', directives: { a: true } })).toThrow(
			'[mdsvex] plugins[0] (x) directives.a must be an object'
		);
		expect(bad({ name: 'x', components: 'm' })).toThrow(
			'[mdsvex] plugins[0] (x) components must be { specifier, names }'
		);
		expect(bad({ name: 'x', parse: () => {} })).toThrow(
			'[mdsvex] plugins[0] (x) parse must be a parse plugin'
		);
	});

	test('a handler keyed by something that is no node type throws', () => {
		expect(
			bad({
				name: 'x',
				module: 'm',
				directives: { a: { children: { headings() {} } } },
			})
		).toThrow(
			'unknown node type "headings" in the children handlers of directive "a"'
		);
	});

	test('a bundle with only a name does nothing', () => {
		expect(compile('# x\n', { plugins: [{ name: 'empty' }] }).code).toBe(
			'<h1>x</h1>'
		);
	});
});
