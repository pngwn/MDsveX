import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { compile, mdsvex } from '../src/main';
import { frontmatter_end, metadata_module } from '../src/metadata_query';

const PREFIX = '\0mdsvex:metadata:';
const DEFAULT = '\nexport default metadata;\n';

/** the frontmatter as written, so two readers of it can be compared */
const keep = (raw: string) => ({ raw });

/** the module a ?metadata import must load, taken from the compiled document */
function from_compile(raw: string, parse?: (raw: string) => any): string {
	const { code, metadata } = compile(raw, { frontmatter: { parse } });
	if (metadata === undefined) {
		expect(code).not.toContain('<script module>');
		return 'export const metadata = undefined;' + DEFAULT;
	}
	const open = '<script module>\n';
	expect(code.startsWith(open)).toBe(true);
	return code.slice(open.length, code.indexOf('\n</script>')) + DEFAULT;
}

describe('frontmatter_end', () => {
	test.each([
		['---\ntitle: a\n---\n# hi\n', 13],
		['---\ntitle: a\n---', 13],
		['---\n---\n', 4],
		['---\n---', 4],
		['---\n\n---\n', 5],
		['---\na: 1\n----\nb: 2\n---\n', 19],
		['---\na: 1\n--- \nb: 2\n---\n', 19],
	])('bounds the value of %j', (source, end) => {
		expect(frontmatter_end(source)).toBe(end);
	});

	test.each([
		'',
		'# hi\n',
		'---',
		'--- \ntitle: a\n---\n',
		'---\ntitle: a\n',
		'---\ntitle: a\n--- \n',
		'\n---\ntitle: a\n---\n',
		' ---\ntitle: a\n---\n',
		'\uFEFF---\ntitle: a\n---\n',
	])('finds none in %j', (source) => {
		expect(frontmatter_end(source)).toBe(-1);
	});
});

describe('metadata_module', () => {
	test.each([
		'---\ntitle: a\ntags: [x, y]\n---\n\n# hi\n',
		'---\r\ntitle: a\r\ncount: 2\r\n---\r\n\r\n# hi\r\n',
		'---\rtitle: a\r---\rhi',
		'---\n---\n# hi\n',
		'---\ntitle: a\n---',
		'---\nhtml: "</script><style>a{}</style><SCRIPT>"\n---\n',
		'# no frontmatter\n',
		'---\ntitle: a\n--- \nnot closed\n',
		'',
	])('exports what the compiled document exports: %j', (raw) => {
		expect(metadata_module(raw, undefined)).toBe(from_compile(raw));
	});

	test('a document without frontmatter still has the named export', () => {
		expect(metadata_module('# hi\n', undefined)).toBe(
			'export const metadata = undefined;' + DEFAULT
		);
	});

	test('uses the parser passed as frontmatter.parse', () => {
		const raw = '---\r\ntitle = "toml"\r\n---\r\ntext\r\n';
		expect(metadata_module(raw, keep)).toBe(
			'export const metadata = {"raw":"title = \\"toml\\"\\n"};' + DEFAULT
		);
		expect(metadata_module(raw, keep)).toBe(from_compile(raw, keep));
		expect(metadata_module(raw, () => null)).toBe(
			'export const metadata = {};' + DEFAULT
		);
	});

	test('reads the same frontmatter as the parser for any mix of fences', () => {
		const pieces = [
			'---',
			'---',
			'\n',
			'\n',
			'\r\n',
			'\r',
			'-',
			'----',
			' ',
			'a: 1',
			'# x',
			'\t',
		];
		let seed = 0x2f6e2b1;
		const next = () => {
			// xorshift, the same documents on every run
			seed ^= seed << 13;
			seed ^= seed >>> 17;
			seed ^= seed << 5;
			return (seed >>> 0) / 0x100000000;
		};
		const pick = <T>(from: T[]) => from[Math.floor(next() * from.length)];
		const newlines = ['\n', '\r\n', '\r'];
		let with_frontmatter = 0;
		for (let i = 0; i < 4000; i++) {
			// most open like frontmatter, about half of those also close like it
			let raw = next() < 0.8 ? '---' + pick(newlines) : '';
			const n = Math.floor(next() * 8);
			for (let j = 0; j < n; j++) raw += pick(pieces);
			if (next() < 0.5) raw += pick(newlines) + '---' + pick(['', ...pieces]);
			const expected = from_compile(raw, keep);
			if (!expected.includes('undefined')) with_frontmatter++;
			expect(metadata_module(raw, keep), JSON.stringify(raw)).toBe(expected);
		}
		// the generator must reach both outcomes
		expect(with_frontmatter).toBeGreaterThan(800);
		expect(with_frontmatter).toBeLessThan(3200);
	});

	test('throws the error of the compiled document', () => {
		const raw = '---\na: 1\nb: {x\n---\n';
		const thrown = (fn: () => unknown) => {
			try {
				fn();
			} catch (e: any) {
				return {
					name: e.name,
					message: e.message,
					line: e.line,
					column: e.column,
				};
			}
		};
		const error = thrown(() => metadata_module(raw, undefined));
		expect(error).toEqual(thrown(() => compile(raw)));
		expect(error).toMatchObject({
			name: 'FrontmatterError',
			line: 3,
			column: 4,
		});
	});
});

describe('?metadata ids', () => {
	const resolved = (id: string) => ({ id, external: false });
	const ctx = {
		// as vite resolves a relative specifier against its importer
		resolve: async (path: string, importer?: string) =>
			path.includes('missing')
				? null
				: resolved(
						path.startsWith('.')
							? importer!.slice(0, importer!.lastIndexOf('/')) + path.slice(1)
							: path
					),
	};

	test.each([
		['./posts/a.svx?metadata', '/src/posts/a.svx'],
		['./posts/a.svx?metadata&t=1', '/src/posts/a.svx'],
		['./posts/a.svx?import&metadata', '/src/posts/a.svx'],
		['/abs/b.svx?metadata', '/abs/b.svx'],
		['C:/abs/b.svx?metadata', 'C:/abs/b.svx'],
	])('resolves %s to a virtual js module', async (id, file) => {
		const [pre] = mdsvex() as any[];
		const result = pre.resolveId.call(ctx, id, '/src/list.js');
		expect(await result).toBe(PREFIX + file + '.js');
	});

	test('takes the extensions option', async () => {
		const [pre] = mdsvex({ extensions: ['md', '.svx'] }) as any[];
		const md = pre.resolveId.call(ctx, './a.md?metadata', '/src/list.js');
		const svx = pre.resolveId.call(ctx, './a.svx?metadata', '/src/list.js');
		expect(await md).toBe(PREFIX + '/src/a.md.js');
		expect(await svx).toBe(PREFIX + '/src/a.svx.js');
		const [only_svx] = mdsvex() as any[];
		expect(
			only_svx.resolveId.call(ctx, './a.md?metadata', '/src/list.js')
		).toBeUndefined();
	});

	test.each([
		'./posts/a.svx',
		'./posts/a.svx?template=false',
		'./posts/a.svx?template=metadata',
		'./posts/a.svx?metadatas',
		'./posts/a.svx?metadata=1',
		'./posts/a.svx?raw',
		'./image.png?metadata',
		'./metadata.js',
		'mdsvex:components',
	])('leaves %s alone, without a promise', (id) => {
		const [pre] = mdsvex() as any[];
		expect(pre.resolveId.call(ctx, id, '/src/list.js')).toBeUndefined();
	});

	test('a document that does not resolve stays unresolved', async () => {
		const [pre] = mdsvex() as any[];
		expect(
			await pre.resolveId.call(ctx, './missing.svx?metadata', '/src/list.js')
		).toBeNull();
	});

	test('the id is neither a document nor a svelte file', () => {
		const [pre, post] = mdsvex({ extensions: ['.svx', '.md'] }) as any[];
		const code = 'export const metadata = {};' + DEFAULT;
		for (const file of ['/src/a.svx', 'C:/src/a.md']) {
			const id = PREFIX + file + '.js';
			expect(pre.transform(code, id)).toBeUndefined();
			expect(post.transform(code, id)).toBeUndefined();
			// the id filter of vite-plugin-svelte for these extensions
			const svelte = /^[^?#]+\.(?:svelte|svx|md)(?:[?#]|$)/;
			expect(svelte.test(id)).toBe(false);
			// a \0 alone would not keep either of them away
			expect(svelte.test(PREFIX + file)).toBe(true);
			expect(pre.transform('# Hi\n', PREFIX + file).code).toBe('<h1>Hi</h1>');
		}
	});
});

describe('?metadata load', () => {
	let dir: string;
	const path = (name: string) => join(dir, name).replace(/\\/g, '/');
	const write = (name: string, content: string) => {
		writeFileSync(join(dir, name), content);
		return PREFIX + path(name) + '.js';
	};

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'mdsvex-metadata-'));
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test('loads the metadata and watches the document in a build', async () => {
		const [pre] = mdsvex() as any[];
		const watched: string[] = [];
		const id = write('a.svx', '---\r\ntitle: A\r\n---\r\n\r\n# Post\r\n');
		const code = await pre.load.call(
			{ addWatchFile: (file: string) => watched.push(file) },
			id
		);
		expect(code).toBe('export const metadata = {"title":"A"};' + DEFAULT);
		expect(watched).toEqual([path('a.svx')]);
	});

	test('loads nothing else', () => {
		const [pre] = mdsvex() as any[];
		expect(pre.load.call({}, path('a.svx'))).toBeUndefined();
		expect(pre.load.call({}, '\0mdsvex:template/docs')).toBeUndefined();
	});

	test('uses frontmatter.parse', async () => {
		const [pre] = mdsvex({ frontmatter: { parse: keep } }) as any[];
		const id = write('toml.svx', '---\ntitle = "x"\n---\n');
		expect(await pre.load.call({ addWatchFile() {} }, id)).toBe(
			'export const metadata = {"raw":"title = \\"x\\"\\n"};' + DEFAULT
		);
	});

	test('an error names the document and the position in it', async () => {
		const [pre] = mdsvex() as any[];
		const raw = '---\r\ntitle: ok\r\ntags: [a\r\n---\r\n';
		const id = write('bad.svx', raw);
		const file = path('bad.svx');
		let compiled: any;
		try {
			compile(raw);
		} catch (e) {
			compiled = e;
		}
		expect(compiled.line).toBe(3);
		await expect(
			pre.load.call({ addWatchFile() {} }, id)
		).rejects.toMatchObject({
			name: 'FrontmatterError',
			message: compiled.message,
			id: file,
			loc: { file, line: 3, column: compiled.column },
		});
	});

	test('an error from frontmatter.parse names the document', async () => {
		const [pre] = mdsvex({
			frontmatter: {
				parse: () => {
					throw new Error('bad toml');
				},
			},
		}) as any[];
		const id = write('thrown.svx', '---\nx\n---\n');
		await expect(
			pre.load.call({ addWatchFile() {} }, id)
		).rejects.toMatchObject({ message: 'bad toml', id: path('thrown.svx') });
	});
});
