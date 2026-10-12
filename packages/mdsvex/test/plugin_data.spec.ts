import { describe, expect, test } from 'vitest';

import {
	CompilerSession,
	FrontmatterError,
	PluginDataError,
	compile,
	compile_inputs,
} from '../src/main';
import type { Bundle, CompileOptions } from '../src/main';
import { reading_time } from './reading_time_plugin';
import { toc } from './toc_plugin';

const POST = '---\ntitle: Post\n---\n\n# One\n\nSome words here.\n\n## Two\n';
const TOC =
	'{"headings":[{"depth":1,"text":"One","id":"one"},{"depth":2,"text":"Two","id":"two"}]}';
const options: CompileOptions = { heading_ids: true, plugins: [toc()] };
const TEMPLATES = { default: { specifier: './Post.svelte' } };

/** a plugin that leaves value under key for every heading */
function leaves(value: unknown, name = 'leaves'): Bundle {
	return {
		name,
		parse: {
			heading: {
				parse(_node, ctx) {
					ctx.data.value = value;
				},
			},
		},
	};
}

describe('the plugin_data export', () => {
	test('follows the metadata export in the module script', () => {
		const { code, data } = compile(POST, options);
		expect(code).toBe(
			'<script module>\nexport const metadata = {"title":"Post"};\n' +
				`export const plugin_data = {"toc":${TOC}};\n</script>` +
				'<h1 id="one">One</h1><p>Some words here.</p><h2 id="two">Two</h2>'
		);
		expect(JSON.stringify(data)).toBe(`{"toc":${TOC}}`);
	});

	test('a document without frontmatter gets a module script for it', () => {
		const { code } = compile('# One\n', options);
		expect(code).toBe(
			'<script module>\nexport const plugin_data = {"toc":{"headings":[{"depth":1,"text":"One","id":"one"}]}};\n</script>' +
				'<h1 id="one">One</h1>'
		);
	});

	test('goes into the module script the document wrote', () => {
		const { code } = compile(
			'<script module>\n\texport const a = 1;\n</script>\n\n# One\n',
			options
		);
		expect(code).toBe(
			'<script module>\nexport const plugin_data = {"toc":{"headings":[{"depth":1,"text":"One","id":"one"}]}};\n' +
				'\n\texport const a = 1;\n</script><h1 id="one">One</h1>'
		);
	});

	test('is keyed by plugin name, in the order the plugins first wrote', () => {
		const { code } = compile(POST, {
			heading_ids: true,
			plugins: [toc(), reading_time(), leaves('x', 'quiet')],
		});
		expect(code).toContain(
			// a fused handler runs in the parse, a sequential one after it
			`export const plugin_data = {"quiet":{"value":"x"},"toc":${TOC},"reading_time":{"words":5,"minutes":1}};`
		);
	});

	test('a document whose plugins left nothing compiles as it does without them', () => {
		for (const source of ['Just words.\n', '---\ntitle: Post\n---\n\nWords.\n'])
			for (const sourcemap of [false, true]) {
				const plugged = compile(source, { ...options, sourcemap });
				expect(plugged.code).toBe(compile(source, { sourcemap }).code);
				expect(plugged.code).not.toContain('plugin_data');
				expect(plugged.data).toBeUndefined();
			}
	});

	test('every render of a session gives the same code', () => {
		const session = new CompilerSession();
		for (const source of [
			POST,
			'# One\n',
			'<script module>\n\tlet a;\n</script>\n\n# One\n',
			'<script>\n\tlet b;\n</script>\n\n# One\n',
		])
			for (const templates of [undefined, TEMPLATES]) {
				const with_templates = { ...options, templates };
				const plain = compile(source, with_templates).code;
				expect(plain).toContain('export const plugin_data = ');
				expect(
					compile(source, { ...with_templates, sourcemap: true }).code
				).toBe(plain);
				expect(session.compile(source, with_templates).code).toBe(plain);
				expect(
					session.compile(source, { ...with_templates, sourcemap: true }).code
				).toBe(plain);
				const inputs = compile_inputs();
				inputs.plugins = options.plugins;
				inputs.heading_ids = (s) => s.toLowerCase();
				if (templates !== undefined) inputs.templates = { templates };
				const out: any = {};
				session.compile_into(source, inputs, out);
				expect(out.html).toBe(plain);
				expect(session.render(session.parse(source, inputs), inputs).code).toBe(
					plain
				);
			}
	});

	test('a script tag in a value does not end the module script', () => {
		const { code } = compile('# One\n', {
			plugins: [leaves('</script><style>')],
		});
		expect(code).toContain('{"value":"\\u003c/script>\\u003cstyle>"}');
	});

	test('a parse without a render has the data', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		inputs.plugins = options.plugins;
		const parsed = session.parse(POST, inputs);
		expect(parsed.metadata).toEqual({ title: 'Post' });
		expect(parsed.data?.toc).toEqual({
			headings: [
				{ depth: 1, text: 'One', id: undefined },
				{ depth: 2, text: 'Two', id: undefined },
			],
		});
		session.drop(parsed);
		expect(() => session.render(parsed, inputs)).toThrow('renders once');
		expect(session.parse('# Other\n', inputs).data?.toc).toEqual({
			headings: [{ depth: 1, text: 'Other', id: undefined }],
		});
	});
});

describe('plugin data as a prop of a template', () => {
	test('follows the metadata and comes before the props of the page', () => {
		const { code } = compile(POST, { ...options, templates: TEMPLATES });
		expect(code).toContain(
			'<Template_MDSVEX {...metadata} {plugin_data} {...__mdsvex_props}>'
		);
	});

	test('a document without frontmatter passes it alone', () => {
		const { code } = compile('# One\n', { ...options, templates: TEMPLATES });
		expect(code).toContain(
			'<Template_MDSVEX {plugin_data} {...__mdsvex_props}>'
		);
	});

	test('a document whose plugins left nothing passes none', () => {
		const { code } = compile('Words.\n', { ...options, templates: TEMPLATES });
		expect(code).toContain('<Template_MDSVEX {...__mdsvex_props}>');
	});

	test('a frontmatter key of the same name is an error at its line', () => {
		const source = '---\ntitle: Post\nplugin_data: mine\n---\n\n# One\n';
		let error: any;
		try {
			compile(source, { ...options, templates: TEMPLATES });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(FrontmatterError);
		expect(error.line).toBe(3);
		expect(error.message).toContain('plugin_data collides');
		expect(compile(source, options).code).toContain('"plugin_data":"mine"');
		expect(
			compile('---\nplugin_data: mine\n---\n\nWords.\n', {
				...options,
				templates: TEMPLATES,
			}).code
		).toContain('{...metadata} {...__mdsvex_props}');
	});

	test('a session that threw wraps no later document', () => {
		const session = new CompilerSession();
		const wrapped = { ...options, templates: TEMPLATES };
		expect(() =>
			session.compile('---\nplugin_data: mine\n---\n\n# One\n', wrapped)
		).toThrow(FrontmatterError);
		expect(session.compile('# One\n', options).code).not.toContain(
			'Template_MDSVEX'
		);
		expect(() =>
			session.compile('# One\n', {
				plugins: [leaves(new Map())],
				templates: TEMPLATES,
			})
		).toThrow(PluginDataError);
		expect(session.compile('# One\n', options).code).not.toContain(
			'Template_MDSVEX'
		);
	});
});

describe('plugin data that is not json', () => {
	class Point {
		x = 1;
	}
	const circular: Record<string, unknown> = { name: 'loop' };
	circular.self = circular;
	const hole: unknown[] = [1];
	hole[2] = 3;

	test.each<[string, unknown, string, string]>([
		['undefined in an array', { a: [undefined] }, 'value.a[0]', 'undefined'],
		['a function', () => {}, 'value', 'a function'],
		['a symbol', Symbol('s'), 'value', 'a symbol'],
		['a bigint', 10n, 'value', 'a bigint'],
		['NaN', { n: [0, NaN] }, 'value.n[1]', 'NaN'],
		['Infinity', -Infinity, 'value', '-Infinity'],
		['a date', { at: new Date(0) }, 'value.at', 'a Date'],
		['a map', new Map(), 'value', 'a Map'],
		['a set', [new Set()], 'value[0]', 'a Set'],
		['a class instance', { p: new Point() }, 'value.p', 'a Point'],
		['a hole in an array', hole, 'value[1]', 'undefined'],
		[
			'a key that is no identifier',
			{ 'a-b': { 'c d': NaN } },
			'value["a-b"]["c d"]',
			'NaN',
		],
		['a symbol key', { [Symbol('k')]: 1 }, 'value', 'a symbol key'],
		[
			'a reference to itself',
			circular,
			'value.self',
			'a reference to an object it is in',
		],
	])('%s throws with the plugin and the path', (_name, value, path, found) => {
		let error: any;
		try {
			compile('# One\n', { plugins: [leaves(value)] });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(PluginDataError);
		expect(error.name).toBe('PluginDataError');
		expect(error.plugin).toBe('leaves');
		expect(error.path).toBe(path);
		expect(error.message).toContain(
			`plugin "leaves" left ${found} at ${path} of its ctx.data`
		);
	});

	test.each<[string, unknown]>([
		['null', null],
		['nested objects and arrays', { a: [{ b: [null, true, 0, -1.5, ''] }] }],
		[
			'an object without a prototype',
			Object.assign(Object.create(null), { a: 1 }),
		],
		[
			'one object in two places',
			(() => {
				const shared = { n: 1 };
				return { a: shared, b: [shared] };
			})(),
		],
	])('%s is exported', (_name, value) => {
		const { code } = compile('# One\n', { plugins: [leaves(value)] });
		expect(code).toContain(
			`export const plugin_data = {"leaves":{"value":${JSON.stringify(value)}}};`
		);
	});

	test('a key that holds undefined is left out, as json does', () => {
		const { code } = compile('# One\n', {
			plugins: [leaves({ a: undefined, b: 1 })],
		});
		expect(code).toContain('{"leaves":{"value":{"b":1}}}');
	});

	test('a parse alone does not check, the export does', () => {
		const session = new CompilerSession();
		const inputs = compile_inputs();
		inputs.plugins = [leaves(new Map())];
		const parsed = session.parse('# One\n', inputs);
		expect(parsed.data?.leaves).toEqual({ value: new Map() });
		expect(() => session.render(parsed, inputs)).toThrow(PluginDataError);
	});
});
