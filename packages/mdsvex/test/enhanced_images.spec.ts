import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';
import { compile, compile_inputs, CompilerSession } from '../src/main';
import { enhanced_specifier } from '../src/image_imports';
import type { CompileOptions, TraceTarget } from '../src/main';

const on: CompileOptions = { import_images: { enhanced: true } };

/** the markup enhanced-img gives an image it imports, up to the alt */
const picture = (name: string) =>
	`<picture>{#each Object.entries(${name}.sources) as [format, srcset]}<source {srcset} type={'image/' + format} />{/each}` +
	`<img src={${name}.img.src} width={${name}.img.w} height={${name}.img.h}`;

const script = (...lines: string[]) =>
	'<script>\n' + lines.map((l) => l + '\n').join('') + '</script>';

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

describe('enhanced_specifier', () => {
	test('what enhanced-img optimises gets ?enhanced', () => {
		for (const ext of [
			'avif',
			'heif',
			'gif',
			'jpeg',
			'jpg',
			'png',
			'tiff',
			'webp',
		])
			expect(enhanced_specifier('./a.' + ext)).toBe('./a.' + ext + '?enhanced');
		expect(enhanced_specifier('../img/a b.png')).toBe(
			'../img/a b.png?enhanced'
		);
		expect(enhanced_specifier('$lib/a.png')).toBe('$lib/a.png?enhanced');
		expect(enhanced_specifier('#lib/a.png')).toBe('#lib/a.png?enhanced');
	});

	test('anything else is imported as written', () => {
		for (const specifier of [
			'./a.svg',
			'./a.ico',
			'./a.bmp',
			// enhanced-img matches the extension as written
			'./a.PNG',
			'./a',
			'./a.png?url',
			'./a.png?inline',
			'./a.png?w=200',
			'./a.png?enhanced',
			'./a.png?',
			'./a.png#frag',
			'./a#b.png',
		])
			expect(enhanced_specifier(specifier), specifier).toBeNull();
	});
});

describe('import_images with enhanced', () => {
	test('an image enhanced-img optimises renders the picture of its import', () => {
		expect(compile('![alt](./a.png "T")\n', on).code).toBe(
			script("import __mdsvex_img_0 from './a.png?enhanced';") +
				'<p>' +
				picture('__mdsvex_img_0') +
				' alt="alt" title="T" /></picture></p>'
		);
	});

	test('a query, an svg, a root and a remote url are left as they are', () => {
		const doc =
			'![a](./a.png?url) ![b](./b.svg) ![c](/c.png) ![d](https://x.y/d.png) ![e](./e.png?w=200;400)\n';
		expect(compile(doc, on).code).toBe(
			script(
				"import __mdsvex_img_0 from './a.png?url';",
				"import __mdsvex_img_1 from './b.svg';",
				"import __mdsvex_img_2 from './e.png?w=200;400';"
			) +
				'<p><img src={__mdsvex_img_0} alt="a" /> <img src={__mdsvex_img_1} alt="b" />' +
				' <img src="/c.png" alt="c" /> <img src="https://x.y/d.png" alt="d" />' +
				' <img src={__mdsvex_img_2} alt="e" /></p>'
		);
		expect(compile(doc, on).code).toBe(
			compile(doc, { import_images: true }).code
		);
	});

	test('one file is one picture however it is written, and a query is another import', () => {
		expect(
			compile('![a](./a.png) ![b](a.png) ![c](./a.png?url)\n', on).code
		).toBe(
			script(
				"import __mdsvex_img_0 from './a.png?enhanced';",
				"import __mdsvex_img_1 from './a.png?url';"
			) +
				'<p>' +
				picture('__mdsvex_img_0') +
				' alt="a" /></picture> ' +
				picture('__mdsvex_img_0') +
				' alt="b" /></picture> <img src={__mdsvex_img_1} alt="c" /></p>'
		);
	});

	test('off, or left out, every import is as before', () => {
		const doc = '![a](./a.png) ![b](./b.jpg)\n';
		const plain = compile(doc, { import_images: true }).code;
		expect(plain).not.toContain('?enhanced');
		expect(compile(doc, { import_images: {} }).code).toBe(plain);
		expect(compile(doc, { import_images: { enhanced: false } }).code).toBe(
			plain
		);
		expect(compile(doc).code).toBe(
			'<p><img src="./a.png" alt="a" /> <img src="./b.jpg" alt="b" /></p>'
		);
	});

	test('an option of the wrong shape throws', () => {
		for (const bad of ['yes', null, 1, { enhanced: 'yes' }])
			expect(() =>
				compile('![a](./a.png)\n', { import_images: bad as any })
			).toThrow(
				'[mdsvex] import_images must be true, false or { enhanced: true | false }'
			);
	});

	test('every walk renders the same picture', () => {
		const doc = 'a ![x](./a.png) *b*\n\n| c |\n| - |\n| ![y](./a.png) |\n';
		const fold = compile(doc, on).code;
		expect(fold).toContain(
			picture('__mdsvex_img_0') + ' alt="x" /></picture> <strong>b</strong>'
		);
		expect(fold).toContain(
			'<td>' + picture('__mdsvex_img_0') + ' alt="y" /></picture></td>'
		);
		const mapped = compile(doc, { ...on, sourcemap: true });
		expect(mapped.code).toBe(fold);
		const out = target();
		const inputs = Object.assign(compile_inputs(), {
			import_images: true,
			enhanced_images: true,
		});
		new CompilerSession().compile_into(doc, inputs, out);
		expect(out.html).toBe(fold);
		const m = mapped.mappings!.find(
			(m) => m.data.role === 'node' && m.sourceOffsets[0] === 2
		)!;
		expect(
			mapped.code.slice(
				m.generatedOffsets[0],
				m.generatedOffsets[0] + (m.generatedLengths ?? m.lengths)[0]
			)
		).toBe(picture('__mdsvex_img_0') + ' alt="x" /></picture>');
	});

	test('the trace render of a later document closes its img as before', () => {
		const session = new CompilerSession();
		const inputs = Object.assign(compile_inputs(), {
			import_images: true,
			enhanced_images: true,
		});
		const out = target();
		session.compile_into('![a](./a.png)\n', inputs, out);
		expect(out.html).toContain('</picture>');
		session.compile_into('![a](/a.png) ![b](./b.svg)\n', inputs, out);
		expect(out.html).toBe(
			script("import __mdsvex_img_0 from './b.svg';") +
				'<p><img src="/a.png" alt="a" /> <img src={__mdsvex_img_0} alt="b" /></p>'
		);
	});

	test('a replaced img gets the picture as its src', () => {
		const components = [{ specifier: '$lib/md.ts', names: ['img'] }];
		for (const sourcemap of [false, true])
			expect(
				compile('![alt](./a.png "T") ![abs](/b.png)\n', {
					...on,
					components,
					sourcemap,
				}).code
			).toBe(
				script(
					"import { img as Img_MDSVEX_G } from '$lib/md.ts';",
					"import __mdsvex_img_0 from './a.png?enhanced';"
				) +
					'<p><Img_MDSVEX_G src={__mdsvex_img_0} alt="alt" title="T" /> <Img_MDSVEX_G src="/b.png" alt="abs" /></p>'
			);
	});

	test('a template img gets the picture as its src too', () => {
		const templates = {
			default: { specifier: '$lib/Post.svelte', components: ['img'] },
		};
		expect(compile('![alt](./a.png)\n', { ...on, templates }).code).toContain(
			'<Img_MDSVEX_T src={__mdsvex_img_0} alt="alt" />'
		);
	});

	test('the parse reports the enhanced specifier', () => {
		const session = new CompilerSession();
		const inputs = Object.assign(compile_inputs(), {
			import_images: true,
			enhanced_images: true,
		});
		const parsed = session.parse('![a](a.png) ![b](./b.svg)\n', inputs);
		expect(parsed.needs).toEqual([
			{
				type: 'image',
				url: 'a.png',
				specifier: './a.png?enhanced',
				name: '__mdsvex_img_0',
			},
			{
				type: 'image',
				url: './b.svg',
				specifier: './b.svg',
				name: '__mdsvex_img_1',
			},
		]);
		expect(session.render(parsed, inputs).code).toBe(
			compile('![a](a.png) ![b](./b.svg)\n', on).code
		);
	});

	test('svelte compiles the picture', () => {
		const code = compile('# t\n\n![a](./a.png "T")\n', on).code;
		for (const generate of ['server', 'client'] as const)
			expect(() => svelte_compile(code, { generate })).not.toThrow();
	});
});
