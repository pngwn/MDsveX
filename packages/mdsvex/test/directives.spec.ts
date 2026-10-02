import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

import { compile, CompilerSession, DirectiveError } from '../src/main';
import type { ComponentSource, ParsePlugin } from '../src/main';

const D = 'mdsvex:directives';

function only(...names: string[]): ComponentSource[] {
	return [{ specifier: D, names }];
}

/** the body after the generated script */
function body(code: string): string {
	return code.replace(/^<script>\n[^]*?<\/script>/, '');
}

function imports_of(code: string): string {
	const m = /^<script>\n([^]*?)<\/script>/.exec(code);
	return m === null ? '' : m[1];
}

/** every walk must render the same html, the vite plugin uses the trace one */
function compile_all(
	raw: string,
	directives: ComponentSource[],
	components?: ComponentSource[]
): string {
	const plain = compile(raw, { components, directives }).code;
	expect(compile(raw, { components, directives, sourcemap: true }).code).toBe(
		plain
	);
	const session = new CompilerSession();
	expect(
		session.compile_trace(
			raw,
			undefined,
			components,
			undefined,
			undefined,
			directives
		).code
	).toBe(plain);
	expect(
		session.compile_v3(
			raw,
			'doc.svx',
			undefined,
			components,
			undefined,
			undefined,
			directives
		).code
	).toBe(plain);
	return plain;
}

function error_of(fn: () => unknown): DirectiveError {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(DirectiveError);
		return e as DirectiveError;
	}
	throw new Error('did not throw');
}

describe('the three forms', () => {
	test('inline passes its content as children', () => {
		expect(body(compile_all('a :abbr[HTML _x_] b', only('abbr')))).toBe(
			'<p>a <Abbr_MDSVEX_D_G>HTML <em>x</em></Abbr_MDSVEX_D_G> b</p>'
		);
	});

	test('inline with empty text has no children', () => {
		expect(body(compile_all('a :icon[] b', only('icon')))).toBe(
			'<p>a <Icon_MDSVEX_D_G /> b</p>'
		);
	});

	test('leaf passes its text as the label snippet only', () => {
		expect(body(compile_all('::youtube[A talk]', only('youtube')))).toBe(
			'<Youtube_MDSVEX_D_G>{#snippet label()}A talk{/snippet}</Youtube_MDSVEX_D_G>'
		);
	});

	test('leaf with empty text is void', () => {
		expect(body(compile_all('::toc[]', only('toc')))).toBe(
			'<Toc_MDSVEX_D_G />'
		);
	});

	test('container passes its text as label and its body as children', () => {
		expect(
			body(
				compile_all(
					':::Callout[Heads up](kind=warn)\nBody *markdown*\n:::',
					only('Callout')
				)
			)
		).toBe(
			'<Callout_MDSVEX_D_G kind="warn">{#snippet label()}Heads up{/snippet}\n' +
				'<p>Body <strong>markdown</strong></p>\n' +
				'</Callout_MDSVEX_D_G>'
		);
	});

	test('container without text has only children', () => {
		expect(body(compile_all(':::note[]\n# h\n\n> q\n:::', only('note')))).toBe(
			'<Note_MDSVEX_D_G>\n<h1>h</h1><blockquote>\n<p>q</p>\n</blockquote>\n</Note_MDSVEX_D_G>'
		);
	});

	test('container without a body has only the label', () => {
		expect(body(compile_all(':::note[x]\n:::', only('note')))).toBe(
			'<Note_MDSVEX_D_G>{#snippet label()}x{/snippet}</Note_MDSVEX_D_G>'
		);
		expect(body(compile_all(':::note[]\n:::', only('note')))).toBe(
			'<Note_MDSVEX_D_G />'
		);
	});

	test('directives nest', () => {
		expect(
			body(
				compile_all(
					'::::outer[o]\n:::inner[i]\nsee :k[x]\n:::\n::::',
					only('outer', 'inner', 'k')
				)
			)
		).toBe(
			'<Outer_MDSVEX_D_G>{#snippet label()}o{/snippet}\n' +
				'<Inner_MDSVEX_D_G>{#snippet label()}i{/snippet}\n' +
				'<p>see <K_MDSVEX_D_G>x</K_MDSVEX_D_G></p>\n' +
				'</Inner_MDSVEX_D_G>\n' +
				'</Outer_MDSVEX_D_G>'
		);
	});

	test('the label is escaped text', () => {
		expect(body(compile_all('::x[a < b & "c"]', only('x')))).toBe(
			'<X_MDSVEX_D_G>{#snippet label()}a &lt; b &amp; &quot;c&quot;{/snippet}</X_MDSVEX_D_G>'
		);
	});
});

/** the source offset the innermost mapping of a compile gives the generated offset */
function mapped_source(
	mappings: {
		sourceOffsets: number[];
		generatedOffsets: number[];
		lengths: number[];
		generatedLengths?: number[];
	}[],
	generated: number
): number {
	let best = -1;
	let best_len = Infinity;
	for (const m of mappings) {
		for (let i = 0; i < m.generatedOffsets.length; i++) {
			const g = m.generatedOffsets[i];
			const len = m.generatedLengths?.[i] ?? m.lengths[i];
			// a text record has equal lengths, so an offset inside it maps one to one
			if (generated < g || generated >= g + len || len >= best_len) continue;
			if (m.lengths[i] !== len) continue;
			best = m.sourceOffsets[i] + (generated - g);
			best_len = len;
		}
	}
	return best;
}

describe('labels', () => {
	test('a leaf label renders its inline markdown', () => {
		expect(
			body(compile_all('::Youtube[A *great* `talk`](id=x)', only('Youtube')))
		).toBe(
			'<Youtube_MDSVEX_D_G id="x">{#snippet label()}A <strong>great</strong> <code>talk</code>{/snippet}</Youtube_MDSVEX_D_G>'
		);
	});

	test('a container label renders apart from its body', () => {
		expect(
			body(
				compile_all(
					':::Callout[Heads *up*](kind=warn)\nBody _soft_\n:::',
					only('Callout')
				)
			)
		).toBe(
			'<Callout_MDSVEX_D_G kind="warn">{#snippet label()}Heads <strong>up</strong>{/snippet}\n' +
				'<p>Body <em>soft</em></p>\n' +
				'</Callout_MDSVEX_D_G>'
		);
	});

	test('a label holds inline directives and replaced elements', () => {
		const code = compile_all(
			':::Callout[see :abbr[HTML](title=t) *now*]\nb\n:::',
			only('Callout', 'abbr'),
			[{ specifier: '#c', names: ['strong'] }]
		);
		expect(body(code)).toBe(
			'<Callout_MDSVEX_D_G>{#snippet label()}see <Abbr_MDSVEX_D_G title="t">HTML</Abbr_MDSVEX_D_G> ' +
				'<Strong_MDSVEX_G>now</Strong_MDSVEX_G>{/snippet}\n<p>b</p>\n</Callout_MDSVEX_D_G>'
		);
		expect(imports_of(code)).toContain('abbr as Abbr_MDSVEX_D_G');
		expect(imports_of(code)).toContain('strong as Strong_MDSVEX_G');
	});

	test('an unknown directive inside a label is still an error', () => {
		const e = error_of(() =>
			compile('::Note[see :nope[x]]', { directives: only('Note') })
		);
		expect(e.message).toContain(':nope at 1:12');
	});

	test('links stay literal and the label never takes the args', () => {
		expect(body(compile_all('::X[see [a](b) <https://c.d>]', only('X')))).toBe(
			'<X_MDSVEX_D_G>{#snippet label()}see [a](b) &lt;https://c.d&gt;{/snippet}</X_MDSVEX_D_G>'
		);
		expect(body(compile_all('::X[*a](k=*)', only('X')))).toBe(
			'<X_MDSVEX_D_G k="*">{#snippet label()}*a{/snippet}</X_MDSVEX_D_G>'
		);
	});

	test('the snippet maps each label node to its source', () => {
		const raw = ':::Callout[Heads *up* `c`](kind=warn)\nBody\n:::';
		const out = compile(raw, { directives: only('Callout'), sourcemap: true });
		const at = (needle: string, from = 0) =>
			mapped_source(out.mappings!, out.code.indexOf(needle, from));
		const snippet = out.code.indexOf('{#snippet label()}');
		expect(at('Heads', snippet)).toBe(raw.indexOf('Heads'));
		expect(at('up', snippet)).toBe(raw.indexOf('up'));
		expect(at('c</code>', snippet)).toBe(raw.indexOf('c`'));
		expect(at('Body')).toBe(raw.indexOf('Body'));
		const strong = out.mappings!.find((m) =>
			out.code.slice(m.generatedOffsets[0]).startsWith('<strong>up')
		);
		expect(strong?.sourceOffsets[0]).toBe(raw.indexOf('*up*'));
	});

	test('the trace map points label text at its source', () => {
		const raw = 'intro\n\n::Youtube[A *great* talk](id=x)\n';
		const out = new CompilerSession().compile_v3(
			raw,
			'doc.svx',
			undefined,
			undefined,
			undefined,
			undefined,
			only('Youtube')
		);
		const map = new TraceMap(out.map as never);
		const position = (needle: string) => {
			const i = out.code.indexOf(needle, out.code.indexOf('{#snippet'));
			const before = out.code.slice(0, i);
			const line = before.split('\n').length;
			return originalPositionFor(map, {
				line,
				column: i - (before.lastIndexOf('\n') + 1),
			});
		};
		expect(position('great')).toMatchObject({ line: 3, column: 13 });
		expect(position(' talk')).toMatchObject({ line: 3, column: 19 });
	});

	test('a label with markup compiles as svelte 5', () => {
		const code = compile(
			':::Callout[Heads *up* :abbr[x]]\nb\n:::\n\n::Note[`a`]',
			{ directives: only('Callout', 'abbr', 'Note') }
		).code;
		for (const generate of ['client', 'server'] as const) {
			svelte_compile(code, { generate, filename: 'doc.svelte' });
		}
	});
});

describe('args', () => {
	test('become string props', () => {
		expect(
			body(
				compile_all(
					'::embed[x](src=/v.mp4, title="A < B", data-id=\'7\')',
					only('embed')
				)
			)
		).toBe(
			'<Embed_MDSVEX_D_G src="/v.mp4" title="A &lt; B" data-id="7">' +
				'{#snippet label()}x{/snippet}</Embed_MDSVEX_D_G>'
		);
	});

	test('a value with braces stays a string, not an expression', () => {
		expect(body(compile_all(':k[x](v="{a}")', only('k')))).toBe(
			'<p><K_MDSVEX_D_G v={"{a}"}>x</K_MDSVEX_D_G></p>'
		);
	});

	test('children is reserved on every form', () => {
		const e = error_of(() =>
			compile('a :k[x](children=1)', { directives: only('k') })
		);
		expect(e.message).toBe(
			'the directive :k at 1:3 has an argument named children, which its component receives as a snippet'
		);
	});

	test('label is reserved on leaf and container, an inline prop', () => {
		const e = error_of(() =>
			compile('\n:::k[x](label=y)\n:::', { directives: only('k') })
		);
		expect(e.message).toContain(':::k at 2:1 has an argument named label');
		expect(body(compile_all(':k[x](label=y)', only('k')))).toBe(
			'<p><K_MDSVEX_D_G label="y">x</K_MDSVEX_D_G></p>'
		);
	});
});

describe('unknown directives', () => {
	const cases: [string, string, string, number, number][] = [
		['inline', 'text\n\nsome :thing[x] here', ':thing', 3, 6],
		['leaf', '::thing[x]', '::thing', 1, 1],
		['container', '# t\n\n:::thing[x]\nbody\n:::', ':::thing', 3, 1],
	];
	for (const [form, raw, shown, line, column] of cases) {
		test(`an unknown ${form} directive is a compile error naming it`, () => {
			for (const run of [
				() => compile(raw),
				() => compile(raw, { sourcemap: true }),
				() => compile(raw, { directives: only('other') }),
				() => new CompilerSession().compile_trace(raw),
				() => new CompilerSession().compile_v3(raw),
			]) {
				const e = error_of(run);
				expect(e.directive).toBe(shown);
				expect(e.line).toBe(line);
				expect(e.column).toBe(column);
				expect(e.message).toContain(`${shown} at ${line}:${column}`);
				expect(e.message).toContain('"thing"');
				expect(e.message).toContain('export * as directives');
			}
		});
	}

	test('one inside a known directive is still an error', () => {
		const e = error_of(() =>
			compile(':::box[]\nsee :nope[x]\n:::', { directives: only('box') })
		);
		expect(e.directive).toBe(':nope');
	});

	test('the shared compile recovers after an error', () => {
		expect(() => compile('::x[]')).toThrow(DirectiveError);
		expect(compile('# fine').code).toBe('<h1>fine</h1>');
	});

	test('strict_directives false renders an unknown one as its children', () => {
		const raw = ':::thing[x]\nbody :nope[y]\n:::\n\n:::box[]\nin\n:::';
		for (const sourcemap of [false, true]) {
			const { code } = compile(raw, {
				sourcemap,
				strict_directives: false,
				directives: only('box'),
			});
			expect(code).toContain('<p>body y</p>');
			expect(code).toContain('<Box_MDSVEX_D_G>');
		}
		// the next compile is strict again
		expect(() => compile('::x[]')).toThrow(DirectiveError);
	});
});

describe('precedence', () => {
	test('directives and elements are separate namespaces', () => {
		const components: ComponentSource[] = [
			{ specifier: 'mdsvex:components', names: ['table', 'hr', 'p'] },
		];
		expect(() =>
			compile('::hr[]', { components, directives: only('p') })
		).toThrow(DirectiveError);
		const code = compile_all(
			'---\n\ntext\n\n::table[]',
			only('table', 'em'),
			components
		);
		expect(body(code)).toBe(
			'<Hr_MDSVEX_G /><P_MDSVEX_G>text</P_MDSVEX_G><Table_MDSVEX_D_G />'
		);
		expect(body(compile_all('_a_', only('em')))).toBe('<p><em>a</em></p>');
	});

	test('a later directives source wins', () => {
		const directives = [
			{ specifier: 'mdsvex:directives/0', names: ['note', 'tip'] },
			{ specifier: 'mdsvex:directives/1', names: ['note'] },
		];
		const code = compile_all('::note[]\n\n::tip[]', directives);
		expect(imports_of(code)).toBe(
			"import { note as Note_MDSVEX_D_G } from 'mdsvex:directives/1';\n" +
				"import { tip as Tip_MDSVEX_D_G } from 'mdsvex:directives/0';\n"
		);
	});

	const plugin: ParsePlugin = {
		directive_container: {
			parse(node) {
				// a handler keyed by name reads it at the close
				return () => {
					if (node.attrs.name !== 'aside') return;
					node.type = 'block_quote';
					node.attrs.name = undefined;
				};
			},
		},
	};

	test('a registered directive never reaches a plugin directive handler', () => {
		const seen: string[] = [];
		const watch: ParsePlugin = {
			directive_leaf: {
				parse(node) {
					return () => seen.push(node.attrs.name);
				},
			},
		};
		const raw = '::mine[]\n\n:::aside[]\nx\n:::';
		const code = compile(raw, {
			directives: only('mine', 'aside'),
			parse_plugins: [plugin, watch],
		}).code;
		expect(body(code)).toBe(
			'<Mine_MDSVEX_D_G /><Aside_MDSVEX_D_G>\n<p>x</p>\n</Aside_MDSVEX_D_G>'
		);
		expect(seen).toEqual([]);
	});

	test('an unregistered directive falls through to a plugin', () => {
		const raw = ':::aside[]\nx\n:::\n\n::mine[]';
		const options = { directives: only('mine'), parse_plugins: [plugin] };
		expect(body(compile(raw, options).code)).toBe(
			'<blockquote>\n<p>x</p>\n</blockquote><Mine_MDSVEX_D_G />'
		);
		expect(
			body(
				new CompilerSession().compile_trace(
					raw,
					[plugin],
					undefined,
					undefined,
					undefined,
					only('mine')
				).code
			)
		).toBe(body(compile(raw, options).code));
		expect(
			compile(':::aside[]\nx\n:::', { parse_plugins: [plugin] }).code
		).toBe('<blockquote>\n<p>x</p>\n</blockquote>');
	});

	test('a plugin that leaves a directive in place does not handle it', () => {
		const watch: ParsePlugin = {
			directive_container: { parse() {} },
		};
		expect(() =>
			compile(':::aside[]\nx\n:::', { parse_plugins: [watch] })
		).toThrow(/:::aside at 1:1/);
	});
});

describe('imports', () => {
	test('one named import per used directive, a name that is not an identifier quoted', () => {
		const code = compile_all(
			'::my-box[]\n\n::my-box[]\n\n:x[y]',
			only('x', 'my-box', 'unused')
		);
		expect(imports_of(code)).toBe(
			'import { "my-box" as My_box_MDSVEX_D_G, x as X_MDSVEX_D_G } from \'mdsvex:directives\';\n'
		);
	});

	test('directive imports join the document script', () => {
		const code = compile('<script>\n\tlet a = 1;\n</script>\n\n::x[]', {
			directives: only('x'),
		}).code;
		expect(code).toBe(
			"<script>\nimport { x as X_MDSVEX_D_G } from 'mdsvex:directives';\n\n\tlet a = 1;\n</script><X_MDSVEX_D_G />"
		);
	});
});

describe('svelte 5', () => {
	test('every form compiles', () => {
		const raw = [
			'a :abbr[HTML](title=x) and :icon[]',
			'',
			'::youtube[A talk](id=abc)',
			'',
			':::Callout[Heads up](kind=warn)',
			'Body *markdown* :abbr[y]',
			':::',
		].join('\n');
		const code = compile(raw, {
			directives: only('abbr', 'icon', 'youtube', 'Callout'),
		}).code;
		for (const generate of ['client', 'server'] as const) {
			const out = svelte_compile(code, { generate, filename: 'doc.svelte' });
			expect(out.js.code).toContain('label');
		}
	});
});

describe('template directives', () => {
	const templates = {
		docs: {
			specifier: 'mdsvex:template/docs',
			directives: [
				{ specifier: 'mdsvex:template-directives/docs', names: ['Callout'] },
			],
		},
		post: { specifier: 'mdsvex:template/post' },
	};
	const directives = only('Callout', 'note');

	test('chain in front of the root directives, closest first', () => {
		const raw = '---\ntemplate: docs\n---\n\n::Callout[]\n\n::note[]';
		const code = compile(raw, { templates, directives }).code;
		expect(code).toContain(
			"import { Callout as Callout_MDSVEX_D_T } from 'mdsvex:template-directives/docs';\n" +
				"import { note as Note_MDSVEX_D_G } from 'mdsvex:directives';\n"
		);
		expect(code).toContain('<Callout_MDSVEX_D_T /><Note_MDSVEX_D_G />');
		const session = new CompilerSession();
		expect(
			session.compile_trace(
				raw,
				undefined,
				undefined,
				undefined,
				{ templates },
				directives
			).code
		).toBe(code);
	});

	test('another template or none keeps only the root directives', () => {
		for (const head of ['template: post', 'template: false']) {
			const code = compile(`---\n${head}\n---\n\n::Callout[]`, {
				templates,
				directives,
			}).code;
			expect(code).toContain('<Callout_MDSVEX_D_G />');
		}
		expect(() =>
			compile('---\ntemplate: post\n---\n\n::Callout[]', { templates })
		).toThrow(DirectiveError);
	});

	test('a name any template registers never reaches a plugin', () => {
		const seen: string[] = [];
		const watch: ParsePlugin = {
			directive_leaf: {
				parse(node) {
					return () => seen.push(node.attrs.name);
				},
			},
		};
		const raw = '---\ntemplate: docs\n---\n\n::Callout[]\n\n::other[]';
		expect(() => compile(raw, { templates, parse_plugins: [watch] })).toThrow(
			/::other/
		);
		expect(seen).toEqual(['other']);
	});
});
