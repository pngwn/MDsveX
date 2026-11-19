import { describe, expect, test } from 'vitest';

import { SourceError, compile_async } from '../src/main';
import type { CompileOptions } from '../src/main';

const files: Record<string, string> = {
	'/site/a.ts': 'export const a = 1;\n',
	'/site/b.ts': 'export const b = 2;\n',
};
const reads: string[] = [];
const host: CompileOptions = {
	filename: '/site/post.svx',
	highlight: false,
	read: async (path) => {
		reads.push(path);
		const text = files[path];
		if (text === undefined) throw new Error(`no file ${path}`);
		return text;
	},
	resolve: (spec, from) =>
		spec.startsWith('./') || spec.startsWith('/')
			? spec.startsWith('/')
				? spec
				: from!.replace(/[^/]+$/, spec.slice(2))
			: null,
};

describe('compile_async with a reader and a resolver', () => {
	test('reads the files fences show and names them in dependencies', async () => {
		reads.length = 0;
		const { code, dependencies } = await compile_async(
			'```ts src=./a.ts\n```\n\n```ts src=./b.ts#L1\n```\n',
			host
		);
		expect(code).toContain('export const a = 1;');
		expect(code).toContain('export const b = 2;');
		expect(dependencies?.sort()).toEqual(['/site/a.ts', '/site/b.ts']);
		expect(reads.sort()).toEqual(['/site/a.ts', '/site/b.ts']);
	});

	test('names the module of its template', async () => {
		const { dependencies, template } = await compile_async('# a\n', {
			...host,
			templates: { default: { specifier: '/site/Post.svelte' } },
		});
		expect(template).toBe('default');
		expect(dependencies).toEqual(['/site/Post.svelte']);
	});

	test('a source given as text is not read and names no file', async () => {
		reads.length = 0;
		const { code, dependencies } = await compile_async(
			'```ts src=./a.ts\n```\n',
			{
				...host,
				sources: { './a.ts': 'given' },
			}
		);
		expect(code).toContain('given');
		expect(reads).toEqual([]);
		expect(dependencies).toBeUndefined();
	});

	test('a file nothing resolves throws the SourceError compile throws', async () => {
		await expect(
			compile_async('```ts src=gone.ts\n```\n', host)
		).rejects.toBeInstanceOf(SourceError);
	});

	test('without both options it compiles as compile does', async () => {
		await expect(
			compile_async('```ts src=./a.ts\n```\n', { filename: '/site/post.svx' })
		).rejects.toBeInstanceOf(SourceError);
	});
});
