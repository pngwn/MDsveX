import { describe, expect, test } from 'vitest';
import { compile, compile_inputs, CompilerSession } from '../src/main';
import type {
	CompileInputs,
	CompileOptions,
	ParsePlugin,
	TraceTarget,
} from '../src/main';

const components = [{ specifier: '$lib/md.ts', names: ['p', 'pre'] }];
const directives = [{ specifier: '$lib/directives.ts', names: ['note'] }];
const templates = {
	default: { specifier: '$lib/Post.svelte', components: ['h1'] },
};
const slug: ParsePlugin = {
	heading: {
		parse(node) {
			return () => {
				node.attrs.id = node.text_content.toLowerCase();
			};
		},
	},
};
const seen: (string | undefined)[] = [];
const highlight = (code: string, info: { filename?: string }) => {
	seen.push(info.filename);
	return `<pre>${code.toUpperCase()}</pre>`;
};

const source =
	'---\ntitle: a\n---\n\n# Title\n\ntext <b>typed</b> :note[x]\n\n![alt](/a.png)\n\n```js\nlet a;\n```\n';

const cases: Partial<CompileInputs>[] = [
	{},
	{ components },
	{ components, component_mode: 'all' },
	{ components, directives, templates: { templates } },
	{ directives, parse_plugins: [slug] },
	{ directives, highlight, filename: '/a.svx' },
	{ directives, strict_directives: false },
	{ strict_directives: false },
	{ unwrap_images: true, strict_directives: false },
	{ templates: { templates, template: false }, strict_directives: false },
	{ frontmatter_parse: () => ({ title: 'parsed' }), strict_directives: false },
	{},
];

function target(): TraceTarget {
	return {
		source: '',
		html: '',
		metadata: undefined,
		template: undefined,
		warnings: undefined,
		buf: new Uint32Array(0),
		start: 0,
		split: 0,
		end: 0,
	};
}

/** compile_into gives a throw as its message, so a case that throws compares too */
function into(
	session: CompilerSession,
	inputs: CompileInputs
): Record<string, unknown> {
	const out = target();
	try {
		session.compile_into(source, inputs, out);
	} catch (e) {
		return { error: (e as Error).message };
	}
	return {
		html: out.html,
		metadata: out.metadata,
		template: out.template,
		warnings: out.warnings,
		trace: Array.from(out.buf.subarray(out.start, out.end)),
	};
}

describe('compile inputs', () => {
	test('new inputs have every field and compile as no options do', () => {
		expect(compile_inputs()).toEqual({
			parse_plugins: undefined,
			components: undefined,
			directives: undefined,
			component_mode: undefined,
			frontmatter_parse: undefined,
			templates: undefined,
			strict_directives: true,
			highlight: undefined,
			filename: undefined,
			unwrap_images: undefined,
		});
		const doc = '# plain\n\ntext\n';
		const out = target();
		new CompilerSession().compile_into(doc, compile_inputs(), out);
		expect(out.html).toBe(compile(doc).code);
	});

	test('kept inputs compile each document as new inputs do', () => {
		const kept = compile_inputs();
		const fields = Object.keys(kept);
		const session = new CompilerSession();
		// twice, so every case also follows the last one
		for (const set of [...cases, ...cases]) {
			const fresh = Object.assign(compile_inputs(), set);
			Object.assign(kept, compile_inputs(), set);
			expect(Object.keys(kept)).toEqual(fields);
			expect(into(session, kept)).toEqual(into(new CompilerSession(), fresh));
		}
	});

	test('inputs compile as the options they stand for', () => {
		const pairs: [Partial<CompileInputs>, CompileOptions][] = [
			[{ directives }, { directives }],
			[
				{ components, directives, component_mode: 'all' },
				{ components, directives, component_mode: 'all' },
			],
			[
				{ components, directives, templates: { templates } },
				{ components, directives, templates },
			],
			[
				{ directives, parse_plugins: [slug] },
				{ directives, parse_plugins: [slug] },
			],
			[
				{ directives, highlight, filename: '/a.svx' },
				{ directives, highlight, filename: '/a.svx' },
			],
			[{ strict_directives: false }, { strict_directives: false }],
			[
				{ unwrap_images: true, strict_directives: false },
				{ unwrap_images: true, strict_directives: false },
			],
			[
				{ frontmatter_parse: () => ({ title: 'p' }), strict_directives: false },
				{
					frontmatter: { parse: () => ({ title: 'p' }) },
					strict_directives: false,
				},
			],
		];
		for (const [set, options] of pairs) {
			const got = into(
				new CompilerSession(),
				Object.assign(compile_inputs(), set)
			);
			const want = compile(source, options);
			expect(got.html).toBe(want.code);
			expect(got.metadata).toEqual(want.metadata);
			expect(got.template).toBe(want.template);
			expect(got.warnings).toEqual(want.warnings);
		}
	});

	test('compile carries no option over to the next call', () => {
		const session = new CompilerSession();
		const full: CompileOptions = {
			unwrap_images: true,
			components,
			directives,
			component_mode: 'all',
			templates,
			highlight,
			filename: '/full.svx',
			frontmatter: { parse: () => ({ title: 'parsed' }) },
			strict_directives: false,
		};
		const loose: CompileOptions = { strict_directives: false };
		const want_full = new CompilerSession().compile(source, full);
		const want_loose = new CompilerSession().compile(source, loose);
		const doc = '# plain\n\n```js\nlet a;\n```\n';
		const want_plain = new CompilerSession().compile(doc);

		for (const run of [compile, session.compile.bind(session)]) {
			expect(run(source, full)).toEqual(want_full);
			expect(run(source, loose)).toEqual(want_loose);
			expect(run(source, full)).toEqual(want_full);
			expect(run(doc)).toEqual(want_plain);
			expect(run(doc, {})).toEqual(want_plain);
			expect(() => run(source, { components, directives: [] })).toThrow();
			expect(run(doc, { sourcemap: false })).toEqual(want_plain);
		}
	});

	test('a compile started in a plugin handler leaves the outer options alone', () => {
		const inner = '# Inner\n\n```js\nlet b;\n```\n';
		const results: unknown[] = [];
		const reenter: ParsePlugin = {
			heading: {
				parse(node) {
					return () => {
						if (node.text_content !== 'Title') return;
						results.push(
							compile(inner),
							compile(inner, { highlight, filename: '/inner.svx' }),
							compile(inner, {
								parse_plugins: [slug],
								strict_directives: false,
							})
						);
					};
				},
			},
		};
		const options: CompileOptions = {
			parse_plugins: [reenter],
			components,
			directives,
			templates,
			highlight,
			filename: '/outer.svx',
		};
		const want = compile(source, { ...options, parse_plugins: [] });

		for (const run of [
			compile,
			(s: string, o: CompileOptions) => new CompilerSession().compile(s, o),
		]) {
			results.length = 0;
			seen.length = 0;
			expect(run(source, options)).toEqual(want);
			expect(seen).toEqual(['/inner.svx', '/outer.svx']);
			expect(results).toEqual([
				compile(inner),
				compile(inner, { highlight, filename: '/inner.svx' }),
				compile(inner, { parse_plugins: [slug], strict_directives: false }),
			]);
		}
	});
});
