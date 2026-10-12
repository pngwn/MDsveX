import { describe, expect, test } from 'vitest';

import { fence_meta } from '../src/code_meta';
import {
	CompilerSession,
	RunError,
	compile,
	compile_inputs,
} from '../src/compile';
import type { CompileOptions, Snippet } from '../src/compile';
import { create_highlight, load_default_languages } from '../src/highlight';
import { run_extension, run_flag, snippet_hash } from '../src/run_blocks';

const PRE = [{ specifier: './md.js', names: ['pre'] }];
const ON: CompileOptions = {
	filename: '/docs/a.md',
	components: PRE,
	snippets: true,
};

function fence(info: string, code: string): string {
	return '```' + info + '\n' + code + '\n```\n';
}

/** the name and the specifier of the module of a block of a.md */
function module_of(extension: string, code: string) {
	const hash = snippet_hash(extension + '\n' + code);
	return {
		hash,
		name: '__snippet_' + hash,
		specifier: `./a.md.snippet-${hash}.${extension}`,
	};
}

function thrown(doc: string, options: CompileOptions = ON): any {
	try {
		compile(doc, options);
	} catch (e) {
		return e;
	}
	throw new Error('compiled: ' + doc);
}

describe('the run flag', () => {
	test('run and run=client are the flag, any other value is no value of it', () => {
		expect(run_flag('run')).toBe(1);
		expect(run_flag('run=client')).toBe(2);
		expect(run_flag('run="client"')).toBe(2);
		expect(run_flag('run=server')).toBe(-1);
		expect(run_flag('run=')).toBe(-1);
		for (const part of ['runtime', 'rerun', 'ru', '[run]', 'Run'])
			expect(run_flag(part)).toBe(0);
	});

	test('the flag is claimed, so it is no meta prop', () => {
		expect(fence_meta('ts run wrap').props).toEqual([['wrap', true]]);
		expect(fence_meta('ts run=client tab=2').props).toEqual([['tab', '2']]);
		expect(fence_meta('ts runs').props).toEqual([['runs', true]]);
	});

	test('fence_meta says whether a fence runs', () => {
		expect(fence_meta('ts run').run).toBe(true);
		expect(fence_meta('ts [a.ts] run=client').run).toBe('client');
		expect(fence_meta('ts').run).toBeUndefined();
		expect(fence_meta('ts run=server').run).toBeUndefined();
		// the flag can stand where the language would
		expect(fence_meta('run src=./a.svelte')).toMatchObject({
			lang: '',
			run: true,
			src: './a.svelte',
		});
	});

	test('only script languages run', () => {
		expect(
			['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx', 'svelte'].map(
				run_extension
			)
		).toEqual(['js', 'js', 'ts', 'ts', 'jsx', 'tsx', 'svelte']);
		for (const lang of ['css', 'json', 'html', 'sh', '', 'constructor'])
			expect(run_extension(lang)).toBeUndefined();
	});

	test('a hash is ten hex digits of the extension and the code', () => {
		const hash = snippet_hash('ts\nlet a = 1;');
		expect(hash).toMatch(/^[0-9a-f]{10}$/);
		expect(snippet_hash('ts\nlet a = 1;')).toBe(hash);
		expect(snippet_hash('js\nlet a = 1;')).not.toBe(hash);
		expect(snippet_hash('ts\nlet a = 2;')).not.toBe(hash);
	});
});

describe('compile with a block that runs', () => {
	test('the block is imported as a sibling of the document and handed to pre', () => {
		const code = '<b>hi</b>';
		const m = module_of('svelte', code);
		const out = compile('# Title\n\n' + fence('svelte run', code), ON);
		expect(out.code).toBe(
			'<script>\n' +
				"import { pre as Pre_MDSVEX_G } from './md.js';\n" +
				`import * as ${m.name} from "${m.specifier}";\n` +
				'</script><h1>Title</h1>' +
				`<Pre_MDSVEX_G lang={"svelte"} module={${m.name}} code={"<b>hi</b>"}>` +
				'<pre><code class="language-svelte">&lt;b&gt;hi&lt;/b&gt;</code></pre></Pre_MDSVEX_G>'
		);
		expect(out.snippets).toEqual([
			{ hash: m.hash, lang: 'svelte', extension: 'svelte', code, line: 4 },
		]);
	});

	test('the flag leaves the meta, the rest of it stays', () => {
		const out = compile(fence('ts run {1} wrap [a.ts]', 'let a;'), ON);
		expect(out.code).toContain(
			'lang={"ts"} meta={"{1} wrap [a.ts]"} title={"a.ts"} wrap={true} module={'
		);
		const first = compile(fence('ts wrap run', 'let a;'), ON);
		expect(first.code).toContain(
			'lang={"ts"} meta={"wrap"} wrap={true} module={'
		);
	});

	test('a highlighted block gets the module too', async () => {
		const highlight = create_highlight({
			languages: await load_default_languages(),
		});
		const m = module_of('ts', 'let a = 1;');
		const out = compile(fence('ts run wrap', 'let a = 1;'), {
			...ON,
			highlight,
		});
		expect(out.code).toContain(
			`<Pre_MDSVEX_G lang={"ts"} meta={"wrap"} module={${m.name}} wrap={true} code={"let a = 1;"}>`
		);
		expect(out.code).toContain('<pre class="twinkleplop language-ts"');
		expect(out.warnings).toBeUndefined();
	});

	test('the same block twice is one module, js and javascript share it', () => {
		const m = module_of('js', 'export default 1;');
		const out = compile(
			fence('js run', 'export default 1;') +
				'\ntext\n\n' +
				fence('javascript run', 'export default 1;') +
				'\n' +
				fence('ts run', 'export default 1;'),
			ON
		);
		expect(out.code.split(`import * as ${m.name} from`).length).toBe(2);
		expect(out.code.split(`module={${m.name}}`).length).toBe(3);
		expect(
			out.snippets!.map((s: Snippet) => [s.lang, s.extension, s.line])
		).toEqual([
			['js', 'js', 2],
			['ts', 'ts', 12],
		]);
	});

	test('a block in a quote or a list runs the code it shows', () => {
		const out = compile(
			'> ```ts run\n> const a = 1;\n>   call(a);\n> ```\n\n- item\n\n  ```js run\n  export default 2;\n  ```\n',
			ON
		);
		expect(out.snippets).toMatchObject([
			{ code: 'const a = 1;\n  call(a);', line: 2 },
			{ code: 'export default 2;', line: 9 },
		]);
		expect(out.code).toContain('code={"const a = 1;\\n  call(a);"}');
	});

	test('run=client hands over a function in place of the module', () => {
		const m = module_of('ts', 'window.a = 1;');
		const out = compile(fence('ts run=client', 'window.a = 1;'), ON);
		expect(out.code).toBe(
			'<script>\n' +
				"import { pre as Pre_MDSVEX_G } from './md.js';\n" +
				'</script>' +
				`<Pre_MDSVEX_G lang={"ts"} load={() => import("${m.specifier}")} code={"window.a = 1;"}>` +
				'<pre><code class="language-ts">window.a = 1;</code></pre></Pre_MDSVEX_G>'
		);
		expect(out.snippets).toHaveLength(1);
	});

	test('src= with run imports the file, whatever lines it shows', () => {
		const sources = { './Counter.svelte': '<b>one</b>\n<i>two</i>\n' };
		const out = compile('```src=./Counter.svelte#L2 run\n```\n', {
			...ON,
			sources,
		});
		const name = '__snippet_' + snippet_hash('src\n./Counter.svelte');
		expect(out.code).toContain(`import * as ${name} from "./Counter.svelte";`);
		expect(out.code).toContain(
			`<Pre_MDSVEX_G lang={"svelte"} src={"./Counter.svelte#L2"} module={${name}} code={"<i>two</i>"}>`
		);
		// the file is the module, there is nothing to serve
		expect(out.snippets).toBeUndefined();
		// and nothing says how to import a snippet, as none is
		const bare = compile('```svelte src=./Counter.svelte run=client\n```\n', {
			components: PRE,
			sources,
		});
		expect(bare.code).toContain('load={() => import("./Counter.svelte")}');
	});

	test('the imports follow those of images', () => {
		const out = compile('![a](./a.png)\n\n' + fence('ts run', 'let a;'), {
			...ON,
			import_images: true,
		});
		const lines = out.code.slice(0, out.code.indexOf('</script>')).split('\n');
		expect(lines[2]).toMatch(/^import \w+ from '\.\/a\.png';$/);
		expect(lines[3]).toMatch(/^import \* as __snippet_/);
	});

	test('a meta prop named as a prop of the block is dropped with a warning', () => {
		const out = compile(fence('ts run module=a load=b', 'let a;'), ON);
		expect(out.warnings?.map((w) => w.code)).toEqual([
			'meta_prop_ignored',
			'meta_prop_ignored',
		]);
		expect(out.code.split('module={').length).toBe(2);
		expect(out.code).not.toContain('load={');
	});

	test('a function gives the specifier', () => {
		const out = compile(fence('ts run', 'let a;'), {
			components: PRE,
			snippets: (snippet) => `virtual:${snippet.hash}.${snippet.extension}`,
		});
		const m = module_of('ts', 'let a;');
		expect(out.code).toContain(
			`import * as ${m.name} from "virtual:${m.hash}.ts";`
		);
		expect(() =>
			compile(fence('ts run', 'let a;'), {
				components: PRE,
				snippets: (() => undefined) as any,
			})
		).toThrow('snippets must return the specifier');
	});

	test('false runs no block, the flag still leaves the meta', () => {
		const out = compile(
			fence('ts run wrap', 'let a;') + '\n' + fence('css run', 'a {}'),
			{ components: PRE, snippets: false }
		);
		expect(out.code).toContain(
			'<Pre_MDSVEX_G lang={"ts"} meta={"wrap"} wrap={true} code={"let a;"}>'
		);
		expect(out.code).not.toContain('import *');
		expect(out.snippets).toBeUndefined();
		expect(compile(fence('ts run', 'let a;'), { snippets: false }).code).toBe(
			'<pre><code class="language-ts">let a;</code></pre>'
		);
	});

	test('a document that runs nothing compiles as it did', () => {
		for (const doc of [
			'# a\n\ntext\n',
			fence('ts', 'let run = 1;'),
			fence('sh title="run.sh"', 'ls'),
			fence('ts runs', 'let a;'),
		]) {
			const plain = compile(doc, { components: PRE });
			expect(compile(doc, ON).code).toBe(plain.code);
			expect(compile(doc, { components: PRE, snippets: false }).code).toBe(
				plain.code
			);
			expect(plain.snippets).toBeUndefined();
		}
	});

	test('a source map and a session give the same', () => {
		const doc = '# Title\n\n' + fence('svelte run', '<b>hi</b>');
		const plain = compile(doc, ON);
		const mapped = compile(doc, { ...ON, sourcemap: true });
		expect(mapped.code).toBe(plain.code);
		expect(mapped.snippets).toEqual(plain.snippets);

		const session = new CompilerSession();
		expect(session.compile(doc, ON)).toEqual(plain);
		// the next document of the session has none of it
		const next = session.compile('# b\n', ON);
		expect(next.code).toBe('<h1>b</h1>');
		expect(next.snippets).toBeUndefined();

		const inputs = compile_inputs();
		inputs.filename = '/docs/a.md';
		inputs.components = PRE;
		inputs.snippets = true;
		const parsed = session.parse(doc, inputs);
		expect(parsed.needs).toBeUndefined();
		expect(parsed.snippets).toEqual(plain.snippets);
		expect(session.render(parsed, inputs).code).toBe(plain.code);
	});
});

describe('a block that can not run', () => {
	test('nothing says how to import it', () => {
		const e = thrown('text\n\n' + fence('ts run', 'let a;'), {
			components: PRE,
		});
		expect(e).toBeInstanceOf(RunError);
		expect(e.code).toBe('run_module');
		expect([e.line, e.column]).toEqual([3, 1]);
		expect(e.message).toContain('fence at line 3');
		const nameless = thrown(fence('ts run', 'let a;'), {
			components: PRE,
			snippets: true,
		});
		expect(nameless.code).toBe('run_module');
		expect(nameless.message).toContain('filename');
	});

	test('no component replaces pre', () => {
		const e = thrown('> text\n>\n> ' + fence('ts run', 'let a;'), {
			filename: '/docs/a.md',
			snippets: true,
		});
		expect(e).toBeInstanceOf(RunError);
		expect(e.code).toBe('run_pre');
		expect([e.line, e.column]).toEqual([3, 3]);
		expect(e.message).toContain('fence at /docs/a.md:3');
		// a replacement for another element is not one for pre
		expect(
			thrown(fence('ts run', 'let a;'), {
				...ON,
				components: [{ specifier: './md.js', names: ['h1'] }],
			}).code
		).toBe('run_pre');
		// the next compile is not left with the fences of this one
		expect(compile(fence('ts', 'let a;')).code).toBe(
			'<pre><code class="language-ts">let a;</code></pre>'
		);
	});

	test('a template that replaces pre is enough', () => {
		const out = compile(fence('ts run', 'let a;'), {
			filename: '/docs/a.md',
			snippets: true,
			templates: {
				default: { specifier: 'mdsvex:template/docs', components: ['pre'] },
			},
		});
		expect(out.code).toContain('module={__snippet_');
	});

	test('live code and a block that runs do not mix', () => {
		for (const doc of [
			fence('ts run eval', 'let a = {b};'),
			fence('ts eval run', 'let a = {b};'),
			fence('eval run', 'let a = {b};'),
			fence('ts run', 'let a = {b}; // [!eval]'),
		]) {
			const e = thrown(doc);
			expect(e.code, doc).toBe('run_eval');
			expect([e.line, e.column]).toEqual([1, 1]);
		}
		const from_file = thrown('```ts src=./a.ts run\n```\n', {
			...ON,
			sources: { './a.ts': 'let a = {b}; // [!eval]\n' },
		});
		expect(from_file.code).toBe('run_eval');
	});

	test('a language that is no module, or none', () => {
		expect(thrown(fence('css run', 'a {}')).code).toBe('run_lang');
		expect(thrown(fence('json run', '{}')).message).toContain(
			'A json block can not run'
		);
		// the flag in place of the language
		const none = thrown(fence('run', 'let a;'));
		expect(none.code).toBe('run_lang');
		expect(none.message).toContain('needs a language');
		expect(
			thrown('```src=./a.css run\n```\n', {
				...ON,
				sources: { './a.css': 'a {}\n' },
			}).code
		).toBe('run_lang');
	});

	test('a value of the flag that is not client', () => {
		const e = thrown(fence('ts run=server', 'let a;'));
		expect(e.code).toBe('run_value');
		expect(e.name).toBe('RunError');
	});
});
