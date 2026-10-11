import { describe, expect, test } from 'vitest';
import { compile, compile_inputs, CompilerSession } from '../src/main';
import { image_specifier } from '../src/image_imports';
import type {
	CompileInputs,
	CompileOptions,
	ParsePlugin,
	TraceTarget,
} from '../src/main';

const on: CompileOptions = { import_images: true };
const SCRIPT = "<script>\nimport __mdsvex_img_0 from './a.png';\n</script>";

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

function inputs_with(fields: Partial<CompileInputs>): CompileInputs {
	return Object.assign(compile_inputs(), fields);
}

describe('image_specifier', () => {
	test.each([
		['./a.png', './a.png'],
		['../img/a.png', '../img/a.png'],
		['../../a.png', '../../a.png'],
		['a.png', './a.png'],
		['img/a.png', './img/a.png'],
		['.hidden/a.png', './.hidden/a.png'],
		['..a.png', './..a.png'],
		['$lib/a.png', '$lib/a.png'],
		['#lib/a.png', '#lib/a.png'],
		['@/a.png', '@/a.png'],
		['@scope/pkg/a.png', '@scope/pkg/a.png'],
		['~/a.png', '~/a.png'],
		['./a.png?enhanced', './a.png?enhanced'],
		['a.png?url', './a.png?url'],
		['./a.png?w=100&h=50', './a.png?w=100&h=50'],
		['./sprite.svg#icon', './sprite.svg#icon'],
		['./a.png?inline#x', './a.png?inline#x'],
		['#lib/a.png?url#x', '#lib/a.png?url#x'],
		['./a%20b.png', './a b.png'],
		['./a%20b.png?w=%20', './a b.png?w=%20'],
		['./100%.png', './100%.png'],
		['./a%23b.png', './a%23b.png'],
		['./a b.png', './a b.png'],
		["./it's.png", "./it's.png"],
		['./a.png?w=1&amp;h=2', './a.png?w=1&h=2'],
		['./a&#38;b.png', './a&b.png'],
		['./a&#x26;b.png', './a&b.png'],
		['./a&b;c.png', './a&b;c.png'],
	])('%s imports %s', (url, specifier) => {
		expect(image_specifier(url)).toBe(specifier);
	});

	test.each([
		'',
		'/a.png',
		'//cdn.example.com/a.png',
		'http://example.com/a.png',
		'https://example.com/a.png',
		'HTTPS://EXAMPLE.COM/a.png',
		'data:image/png;base64,AAAA',
		'blob:https://example.com/1',
		'mailto:a@b.c',
		'C:/a.png',
		'#fragment',
		'#',
		'?query',
		'?',
		'{src}',
		'./{name}.png',
		'./a.png?w={w}',
		'.\\a.png',
		'./a\\(1\\).png',
		// no table of named references is bundled to read this one
		'./a&copy;.png',
	])('%s stays as it is', (url) => {
		expect(image_specifier(url)).toBeNull();
	});
});

describe('import_images', () => {
	test('is off unless asked for', () => {
		const doc = '![alt](./a.png)\n';
		const plain = '<p><img src="./a.png" alt="alt" /></p>';
		expect(compile(doc).code).toBe(plain);
		expect(compile(doc, { import_images: false }).code).toBe(plain);
		expect(compile(doc, { sourcemap: true }).code).toBe(plain);
		const session = new CompilerSession();
		expect(session.compile(doc).code).toBe(plain);
		expect(session.compile(doc, on).code).toContain('__mdsvex_img_0');
		expect(session.compile(doc).code).toBe(plain);
	});

	test('a relative image is imported and its src is the import', () => {
		expect(compile('![alt](./a.png)\n', on).code).toBe(
			SCRIPT + '<p><img src={__mdsvex_img_0} alt="alt" /></p>'
		);
	});

	test('the same file is imported once, however it is written', () => {
		const out = compile(
			'![one](./a.png) ![two](a.png) ![three](./a.png "t")\n\n> ![four](./b.png) ![five](./a.png?url)\n',
			on
		).code;
		expect(out).toBe(
			'<script>\n' +
				"import __mdsvex_img_0 from './a.png';\n" +
				"import __mdsvex_img_1 from './b.png';\n" +
				"import __mdsvex_img_2 from './a.png?url';\n" +
				'</script>' +
				'<p><img src={__mdsvex_img_0} alt="one" /> <img src={__mdsvex_img_0} alt="two" /> <img src={__mdsvex_img_0} alt="three" title="t" /></p>' +
				'<blockquote>\n<p><img src={__mdsvex_img_1} alt="four" /> <img src={__mdsvex_img_2} alt="five" /></p>\n</blockquote>'
		);
	});

	test('urls that are no relative path stay exactly as they are', () => {
		const doc =
			'![a](/a.png) ![b](https://x.y/b.png) ![c](//x.y/c.png) ![d](data:image/png;base64,AA) ![e](#e) ![f]({f}) ![g](./{g}.png) ![h]()\n';
		expect(compile(doc, on).code).toBe(compile(doc).code);
		expect(compile(doc, { ...on, sourcemap: true })).toEqual(
			compile(doc, { sourcemap: true })
		);
	});

	test('a link keeps its href, also to an image', () => {
		expect(compile('[a](./a.png) ![a](./a.png) [b](b.md)\n', on).code).toBe(
			SCRIPT +
				'<p><a href="./a.png">a</a> <img src={__mdsvex_img_0} alt="a" /> <a href="b.md">b</a></p>'
		);
	});

	test('an image in a link and in a table cell', () => {
		expect(compile('[![a](./a.png)](/page)\n', on).code).toBe(
			SCRIPT + '<p><a href="/page"><img src={__mdsvex_img_0} alt="a" /></a></p>'
		);
		expect(compile('| h |\n| - |\n| ![a](./a.png) |\n', on).code).toContain(
			'<td><img src={__mdsvex_img_0} alt="a" /></td>'
		);
	});

	test('an image in the alt of another never renders, so nothing imports it', () => {
		expect(compile('![a ![b](./in.png)](./a.png)\n', on).code).toBe(
			SCRIPT + '<p><img src={__mdsvex_img_0} alt="a b" /></p>'
		);
	});

	test('a specifier is a string literal whatever the file is called', () => {
		const out = compile("![a](<./it's a.png>)\n", on).code;
		expect(out).toContain("import __mdsvex_img_0 from './it\\'s a.png';");
		expect(out).toContain('<img src={__mdsvex_img_0} alt="a" />');
	});

	test('the imports join the instance script of the document', () => {
		const doc =
			'<script lang="ts">\n\timport X from "./X.svelte";\n\tlet a: number = 1;\n</script>\n\n![a](./a.png)\n';
		expect(compile(doc, on).code).toBe(
			'<script lang="ts">\n' +
				"import __mdsvex_img_0 from './a.png';\n" +
				'\n\timport X from "./X.svelte";\n\tlet a: number = 1;\n</script>' +
				'<p><img src={__mdsvex_img_0} alt="a" /></p>'
		);
	});

	test('a module script and frontmatter leave the imports a script of their own', () => {
		const doc =
			'---\ntitle: t\n---\n\n<script module>\n\texport const a = 1;\n</script>\n\n![a](./a.png)\n';
		const out = compile(doc, on).code;
		expect(out).toContain(SCRIPT);
		expect(out).toContain('export const metadata = {"title":"t"};');
		expect(out).toContain('<img src={__mdsvex_img_0} alt="a" />');
	});

	test('a document that already uses the prefix gets names it does not hold', () => {
		const doc =
			'<script>\n\tlet __mdsvex_img_0 = 1;\n</script>\n\n![a](./a.png) {__mdsvex_img_0}\n';
		const out = compile(doc, on).code;
		expect(out).toContain("import __mdsvex_img__0 from './a.png';");
		expect(out).toContain(
			'<img src={__mdsvex_img__0} alt="a" /> {__mdsvex_img_0}'
		);
		const twice = compile(
			'`__mdsvex_img_` and `__mdsvex_img__`\n\n![a](./a.png)\n',
			on
		).code;
		expect(twice).toContain("import __mdsvex_img___0 from './a.png';");
	});

	test('the mapped render keeps its records around the import', () => {
		const doc = 'a ![x](./a.png) *b*\n';
		const out = compile(doc, { ...on, sourcemap: true });
		expect(out.code).toBe(
			SCRIPT +
				'<p>a <img src={__mdsvex_img_0} alt="x" /> <strong>b</strong></p>'
		);
		const mappings = out.mappings!;
		const text_of = (role: string, at: number) => {
			const m = mappings.find(
				(m) => m.data.role === role && m.sourceOffsets[0] === at
			)!;
			return out.code.slice(
				m.generatedOffsets[0],
				m.generatedOffsets[0] + (m.generatedLengths ?? m.lengths)[0]
			);
		};
		expect(text_of('node', 2)).toBe('<img src={__mdsvex_img_0} alt="x" />');
		expect(text_of('content', 17)).toBe('b');
		expect(text_of('content', 0)).toBe('a ');
	});

	test('the trace render imports too', () => {
		const session = new CompilerSession();
		const inputs = inputs_with({ import_images: true });
		const out = target();
		session.compile_into('![alt](./a.png)\n', inputs, out);
		expect(out.html).toBe(
			SCRIPT + '<p><img src={__mdsvex_img_0} alt="alt" /></p>'
		);
		session.compile_into('![alt](/a.png)\n\n# b\n', inputs, out);
		expect(out.html).toBe('<p><img src="/a.png" alt="alt" /></p><h1>b</h1>');
		session.compile_into('# c\n', inputs, out);
		expect(out.html).toBe('<h1>c</h1>');
	});

	test('a replaced img gets the import as its src', () => {
		const components = [{ specifier: '$lib/md.ts', names: ['img'] }];
		for (const sourcemap of [false, true]) {
			expect(
				compile('![alt](./a.png "T") ![abs](/b.png)\n', {
					...on,
					components,
					sourcemap,
				}).code
			).toBe(
				'<script>\n' +
					"import { img as Img_MDSVEX_G } from '$lib/md.ts';\n" +
					"import __mdsvex_img_0 from './a.png';\n" +
					'</script>' +
					'<p><Img_MDSVEX_G src={__mdsvex_img_0} alt="alt" title="T" /> <Img_MDSVEX_G src="/b.png" alt="abs" /></p>'
			);
		}
	});

	test('a template wrapped document imports after the template', () => {
		const templates = {
			default: { specifier: '$lib/Post.svelte', components: ['img'] },
		};
		for (const sourcemap of [false, true]) {
			expect(
				compile('![alt](./a.png)\n', { ...on, templates, sourcemap }).code
			).toBe(
				'<script>\n' +
					"import Template_MDSVEX, { img as Img_MDSVEX_T } from '$lib/Post.svelte';\n" +
					"import __mdsvex_img_0 from './a.png';\n" +
					'let __mdsvex_props = $props();\n' +
					'</script>' +
					'<Template_MDSVEX {...__mdsvex_props}><p><Img_MDSVEX_T src={__mdsvex_img_0} alt="alt" /></p></Template_MDSVEX>'
			);
		}
		const session = new CompilerSession();
		const out = target();
		session.compile_into(
			'![alt](./a.png)\n',
			inputs_with({ import_images: true, templates: { templates } }),
			out
		);
		expect(out.html).toBe(
			compile('![alt](./a.png)\n', { ...on, templates }).code
		);
	});

	test('unwrap_images and import_images work together', () => {
		expect(
			compile('![alt](./a.png)\n', { ...on, unwrap_images: true }).code
		).toBe(SCRIPT + '<img src={__mdsvex_img_0} alt="alt" />');
	});

	test('a crlf document imports as its lf twin does', () => {
		const doc = 'a\n\n![x](./a.png)\n\nb\n';
		const crlf = doc.replace(/\n/g, '\r\n');
		expect(compile(crlf, on).code).toBe(compile(doc, on).code);
		expect(compile(crlf, { ...on, sourcemap: true }).code).toBe(
			compile(doc, on).code
		);
	});

	test('a math fence without a highlighter renders twice and keeps the imports', () => {
		const out = compile('![a](./a.png)\n\n```math\nx\n```\n', {
			...on,
			math: (latex) => `<math>${latex}</math>`,
		}).code;
		expect(out).toContain(SCRIPT);
		expect(out).toContain('<img src={__mdsvex_img_0} alt="a" />');
		expect(out).toContain('<math>x</math>');
	});

	test('an image a parse plugin makes is imported', () => {
		const logo: ParsePlugin = {
			heading: {
				parse(node) {
					node.append('image', { src: './logo.png' });
				},
			},
		};
		const out = compile('# Title\n', { ...on, parse_plugins: [logo] }).code;
		expect(out).toContain("import __mdsvex_img_0 from './logo.png';");
		expect(out).toContain('<img src={__mdsvex_img_0}');
		const session = new CompilerSession();
		expect(
			session.compile('# Title\n', { ...on, parse_plugins: [logo] }).code
		).toBe(out);
	});

	test('a compile started in a plugin handler does not take the images of the outer document', () => {
		const session = new CompilerSession();
		const inner: string[] = [];
		const nesting: ParsePlugin = {
			heading: {
				parse() {
					inner.push(session.compile('![in](./in.png)\n', on).code);
					inner.push(session.compile('no image\n', on).code);
					inner.push(compile('still none\n', on).code);
				},
			},
		};
		const options = { ...on, parse_plugins: [nesting] };
		const doc = '![before](./a.png)\n\n# Title\n\n![after](./b.png)\n';
		const expected =
			'<script>\n' +
			"import __mdsvex_img_0 from './a.png';\n" +
			"import __mdsvex_img_1 from './b.png';\n" +
			'</script>' +
			'<p><img src={__mdsvex_img_0} alt="before" /></p><h1>Title</h1><p><img src={__mdsvex_img_1} alt="after" /></p>';
		expect(session.compile(doc, options).code).toBe(expected);
		expect(compile(doc, options).code).toBe(expected);
		expect(inner.slice(0, 3)).toEqual([
			'<script>\nimport __mdsvex_img_0 from \'./in.png\';\n</script><p><img src={__mdsvex_img_0} alt="in" /></p>',
			'<p>no image</p>',
			'<p>still none</p>',
		]);
	});

	test('a document without an image follows one with images unchanged', () => {
		const session = new CompilerSession();
		const docs = [
			'![a](./a.png)\n',
			'# no image\n\n[link](./a.png)\n',
			'![abs](/a.png)\n',
			'![b](b.png) and ![a](./a.png)\n',
			'',
			'plain\n',
		];
		for (let pass = 0; pass < 3; pass++)
			for (const doc of docs) {
				expect(session.compile(doc, on)).toEqual(compile(doc, on));
				expect(session.compile(doc, { ...on, sourcemap: true })).toEqual(
					compile(doc, { ...on, sourcemap: true })
				);
			}
	});

	test('a render that throws leaves no imports for the next document', () => {
		const session = new CompilerSession();
		const inputs = inputs_with({ import_images: true });
		const out = target();
		expect(() =>
			session.compile_into('![a](./a.png)\n\n:note[x]\n', inputs, out)
		).toThrow(/note/);
		session.compile_into('[link](./a.png) ![abs](/b.png)\n', inputs, out);
		expect(out.html).toBe(
			'<p><a href="./a.png">link</a> <img src="/b.png" alt="abs" /></p>'
		);
		expect(() => session.compile('![a](./a.png)\n\n:note[x]\n', on)).toThrow(
			/note/
		);
		expect(session.compile('![abs](/b.png)\n').code).toBe(
			'<p><img src="/b.png" alt="abs" /></p>'
		);
	});
});

describe('import_images in two phases', () => {
	test('the parse reports the images the render imports', () => {
		const session = new CompilerSession();
		const inputs = inputs_with({ import_images: true });
		const parsed = session.parse(
			'![a](./a.png) ![b](b.png?url) ![a again](a.png) ![abs](/c.png)\n',
			inputs
		);
		expect(parsed.needs).toEqual([
			{
				type: 'image',
				url: './a.png',
				specifier: './a.png',
				name: '__mdsvex_img_0',
			},
			{
				type: 'image',
				url: 'b.png?url',
				specifier: './b.png?url',
				name: '__mdsvex_img_1',
			},
		]);
		expect(session.compile('![z](./z.png)\n', on).code).toContain('./z.png');
		const other = session.parse('![y](./y.png)\n', inputs);
		expect(session.render(other, inputs).code).toContain("from './y.png'");
		expect(session.render(parsed, inputs)).toEqual(
			compile(
				'![a](./a.png) ![b](b.png?url) ![a again](a.png) ![abs](/c.png)\n',
				on
			)
		);
	});

	test('a document that needs nothing reports nothing', () => {
		const session = new CompilerSession();
		const inputs = inputs_with({ import_images: true });
		expect(session.parse('# a\n\n![abs](/a.png)\n', inputs).needs).toBe(
			undefined
		);
		expect(session.parse('plain\n', inputs).needs).toBe(undefined);
		expect(session.parse('![a](./a.png)\n', compile_inputs()).needs).toBe(
			undefined
		);
	});

	test('a kept document renders with its imports again', () => {
		const session = new CompilerSession();
		const inputs = inputs_with({ import_images: true });
		const first = target();
		session.compile_into('![a](./a.png)\n', inputs, first);
		const html = first.html;
		const kept = session.keep('![a](./a.png)\n', inputs, first.metadata);
		expect(kept.needs).toHaveLength(1);
		session.compile_into('# other\n', inputs, first);
		expect(first.html).toBe('<h1>other</h1>');
		session.render_into(kept, inputs, first);
		expect(first.html).toBe(html);
		expect(html).toBe(SCRIPT + '<p><img src={__mdsvex_img_0} alt="a" /></p>');
	});
});
