import { describe, expect, test } from 'vitest';
import {
	compile,
	compile_inputs,
	CompilerSession,
	FrontmatterError,
} from '../src/main';
import type {
	CompileInputs,
	CompileOptions,
	ParsePlugin,
	TraceTarget,
} from '../src/main';

const documents = [
	'---\ntitle: a\n---\n\n# Heading\n\nA paragraph with *emphasis* and [a link](https://example.com).\n',
	'| left | right |\n| :--- | ---: |\n| one | two |\n',
	'```ts\nconst value = 1;\n```\n\n<section>{value}</section>\n',
	'short\n',
	'<script>\n\tlet a = 1;\n</script>\n\n![alt](./a.png) and :note[x]\n',
	'',
];

const components = [{ specifier: '$lib/md.ts', names: ['p', 'img'] }];
const templates = {
	default: { specifier: '$lib/Post.svelte', components: ['h1'] },
};
const shout: ParsePlugin = {
	heading: {
		parse(node) {
			return () => {
				node.attrs.id = node.text_content.toLowerCase();
			};
		},
	},
};

const cases: Partial<CompileInputs>[] = [
	{ strict_directives: false },
	{ components, strict_directives: false },
	{ components, templates: { templates }, strict_directives: false },
	{ parse_plugins: [shout], strict_directives: false },
	{ unwrap_images: true, strict_directives: false },
];

function inputs_with(fields: Partial<CompileInputs>): CompileInputs {
	return Object.assign(compile_inputs(), fields);
}

/** the compile options that read as the inputs do */
function options_of(fields: Partial<CompileInputs>): CompileOptions {
	const { templates: picked, ...rest } = fields;
	return { ...rest, ...picked } as CompileOptions;
}

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

function records(t: TraceTarget): number[] {
	return Array.from(t.buf.subarray(t.start, t.end));
}

describe('two phase compile', () => {
	test('parse then render gives what compile gives', () => {
		const session = new CompilerSession();
		for (const fields of cases) {
			const inputs = inputs_with(fields);
			const options = options_of(fields);
			for (const source of [...documents, ...documents]) {
				const plain = session.render(session.parse(source, inputs), inputs);
				expect(plain).toEqual(compile(source, options));
				const mapped = session.render(
					session.parse(source, inputs),
					inputs,
					true
				);
				expect(mapped).toEqual(
					compile(source, { ...options, sourcemap: true })
				);
			}
		}
	});

	test('render_into gives what compile_into gives', () => {
		const one = new CompilerSession();
		const two = new CompilerSession();
		for (const fields of cases) {
			const inputs = inputs_with(fields);
			for (const source of documents) {
				const whole = target();
				one.compile_into(source, inputs, whole);
				const split = target();
				two.render_into(two.parse(source, inputs), inputs, split);
				expect(split.html).toBe(whole.html);
				expect(split.source).toBe(whole.source);
				expect(split.metadata).toEqual(whole.metadata);
				expect(split.template).toBe(whole.template);
				expect(records(split)).toEqual(records(whole));
			}
		}
	});

	test('a crlf document keeps its raw offsets', () => {
		const session = new CompilerSession();
		const inputs = inputs_with({ strict_directives: false });
		for (const source of documents) {
			const raw = source.replace(/\n/g, '\r\n');
			const parsed = session.parse(raw, inputs);
			expect(parsed.raw).toBe(raw);
			expect(parsed.source).toBe(source);
			expect(session.render(parsed, inputs, true)).toEqual(
				compile(raw, { sourcemap: true, strict_directives: false })
			);
		}
	});

	test('the frontmatter is parsed with the document', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		expect(session.parse(documents[0], inputs).metadata).toEqual({
			title: 'a',
		});
		expect(session.parse(documents[1], inputs).metadata).toBeUndefined();
		expect(() => session.parse('---\na: [\n---\n', inputs)).toThrow(
			FrontmatterError
		);
		expect(session.compile('after\n').code).toBe('<p>after</p>');
	});

	test('a parsed document waits while the session compiles others', () => {
		for (const fields of cases) {
			const session = new CompilerSession();
			const inputs = inputs_with(fields);
			const options = options_of(fields);
			const waiting = documents.map((source) => session.parse(source, inputs));
			// larger than any of them, so a shared arena would be overwritten
			const big = '- item *a* [b](c)\n'.repeat(200);
			expect(session.compile(big, options)).toEqual(compile(big, options));
			const target_out = target();
			session.compile_into(big, inputs, target_out);
			const late = session.parse(big, inputs);
			// out of order, as transforms that wait on different things resolve
			for (const i of [3, 0, 5, 1, 4, 2]) {
				expect(session.render(waiting[i], inputs, true)).toEqual(
					compile(documents[i], { ...options, sourcemap: true })
				);
				expect(session.compile('between\n', options).code).toContain('between');
			}
			expect(session.render(late, inputs)).toEqual(compile(big, options));
		}
	});

	test('documents that take turns share one arena', () => {
		const session = new CompilerSession();
		const inputs = inputs_with({ strict_directives: false });
		const options = { strict_directives: false };
		const trees = new Set<unknown>();
		for (let pass = 0; pass < 3; pass++) {
			for (const source of documents) {
				const parsed = session.parse(source, inputs);
				expect((session as any).tree).toBeNull();
				session.render(parsed, inputs);
				trees.add((session as any).tree);
				expect(session.compile(source, options)).toEqual(
					compile(source, options)
				);
				trees.add((session as any).tree);
			}
		}
		expect(trees.size).toBe(1);
		expect(trees.has(null)).toBe(false);
	});

	test('with parse plugins the plugin arena goes with the document', () => {
		const session = new CompilerSession();
		const parse_plugins = [shout];
		const inputs = inputs_with({ parse_plugins });
		const first = session.parse('# One\n', inputs);
		expect((session as any).plugin_arena).toBeNull();
		const second = session.parse('# Two\n', inputs);
		expect(session.render(second, inputs).code).toBe('<h1 id="two">Two</h1>');
		const arena = (session as any).plugin_arena;
		expect(arena).not.toBeNull();
		expect(session.render(first, inputs).code).toBe('<h1 id="one">One</h1>');
		expect((session as any).plugin_arena).toBe(arena);
		// the same plugins array, so a compile reuses it
		expect(session.compile('# Three\n', { parse_plugins }).code).toBe(
			'<h1 id="three">Three</h1>'
		);
		expect((session as any).plugin_arena).toBe(arena);
	});

	test('a document renders once', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		const parsed = session.parse('a\n', inputs);
		expect(session.render(parsed, inputs).code).toBe('<p>a</p>');
		expect(() => session.render(parsed, inputs)).toThrow(/renders once/);
	});

	test('a render that throws uses the document up and leaves the session usable', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		const parsed = session.parse(':note[x]\n', inputs);
		expect(() => session.render(parsed, inputs)).toThrow(/note/);
		expect(() => session.render(parsed, inputs)).toThrow(/renders once/);
		expect(session.compile('after\n').code).toBe('<p>after</p>');
	});

	test('the render reads the inputs it is given', () => {
		const session = new CompilerSession();
		const shared = compile_inputs();
		shared.filename = '/a.svx';
		const a = session.parse('# a\n', shared);
		shared.filename = '/b.svx';
		const b = session.parse('---\ntemplate: default\n---\n\n# b\n', shared);
		// the caller stores what belongs to a document before its render
		shared.filename = '/a.svx';
		shared.templates = undefined;
		expect(session.render(a, shared)).toEqual(compile('# a\n'));
		shared.filename = '/b.svx';
		shared.templates = { templates };
		const out = session.render(b, shared);
		expect(out.template).toBe('default');
		expect(out.code).toContain("from '$lib/Post.svelte'");
	});

	test('parse and render work inside a plugin handler', () => {
		const session = new CompilerSession();
		const inner_inputs = inputs_with({ parse_plugins: [shout] });
		const plain = compile_inputs();
		const seen: string[] = [];
		const nesting: ParsePlugin = {
			paragraph: {
				parse() {
					const plugged = session.parse('# Inner\n', inner_inputs);
					const bare = session.parse('_bare_\n', plain);
					seen.push(session.render(plugged, inner_inputs).code);
					seen.push(session.render(bare, plain).code);
				},
			},
		};
		const outer = session.compile('outer\n', { parse_plugins: [nesting] });
		expect(outer.code).toBe('<p>outer</p>');
		expect(seen).toEqual(['<h1 id="inner">Inner</h1>', '<p><em>bare</em></p>']);
	});

	test('keep takes the document a compile just parsed', () => {
		for (const fields of cases) {
			const session = new CompilerSession();
			const inputs = inputs_with(fields);
			const options = options_of(fields);
			for (const source of documents) {
				const first = target();
				session.compile_into(source, inputs, first);
				const html = first.html;
				const kept = session.keep(source, inputs, first.metadata);
				expect(kept.source).toBe(first.source);
				session.compile('- other *document*\n'.repeat(50), options);
				const again = target();
				session.render_into(kept, inputs, again);
				expect(again.html).toBe(html);
				expect(again.metadata).toEqual(first.metadata);
				expect(again.template).toBe(first.template);
			}
		}
	});

	test('keep has nothing to take from a released session', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		expect(() => session.keep('a\n', inputs, undefined)).toThrow(/no document/);
		session.compile('a\n');
		session.release();
		expect(() => session.keep('a\n', inputs, undefined)).toThrow(/no document/);
	});
});
