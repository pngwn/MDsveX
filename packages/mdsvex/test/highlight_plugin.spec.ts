import { describe, expect, test } from 'vitest';

import { mdsvex } from '../src/main';
import type { MdsvexOptions } from '../src/main';

const ID = '/src/routes/page.svx';

function plugin(options: MdsvexOptions = {}) {
	const [pre] = mdsvex(options) as any[];
	const warned: unknown[][] = [];
	const ctx = {
		addWatchFile() {},
		warn: (...args: unknown[]) => warned.push(args),
	};
	const transform = (code: string, id = ID) =>
		pre.transform.call(ctx, code, id);
	return { transform, warned };
}

describe('vite plugin highlighting', () => {
	test('a document without code compiles without loading twinkleplop', () => {
		const { transform } = plugin();
		const out = transform('# a\n\n`b`\n');
		expect(out).not.toBeInstanceOf(Promise);
		expect(out.code).toBe('<h1>a</h1><p><code>b</code></p>');
	});

	test('twinkleplop loads with the first document that has code', async () => {
		const { transform } = plugin();
		const first = transform('```ts\nlet a\n```\n');
		expect(first).toBeInstanceOf(Promise);
		expect((await first).code).toContain(
			'<pre class="twinkleplop language-ts" data-language="ts">'
		);
		const second = transform('`#!ts let b`\n');
		expect(second).not.toBeInstanceOf(Promise);
		expect(second.code).toContain('twinkleplop twinkleplop-inline language-ts');
	});

	test('options pass through to create_highlight, languages merge over the defaults', async () => {
		const { transform } = plugin({
			highlight: {
				languages: { box: 'bash' },
				line_numbers: true,
			},
		});
		const out = await transform('```box\nls\n```\n\n```ts\nx\n```\n');
		expect(out.code).toContain('language-box" data-language="box"');
		expect(out.code).toContain('language-ts" data-language="ts"');
		expect(out.code).toContain('<span class="ln">1</span>');
	});

	test('false renders plain code', () => {
		const { transform } = plugin({ highlight: false });
		expect(transform('```ts\nlet {a}\n```\n').code).toBe(
			'<pre><code class="language-ts">let &#123;a&#125;</code></pre>'
		);
	});

	test('a custom highlighter is called synchronously with the file', () => {
		const files: (string | undefined)[] = [];
		const { transform } = plugin({
			highlight: (code, { filename }) => {
				files.push(filename);
				return `<pre class="mine">${code}</pre>`;
			},
		});
		expect(transform('```ts\n{a}\n```\n', ID + '?x').code).toBe(
			'<pre class="mine">&#123;a&#125;</pre>'
		);
		expect(files).toEqual([ID]);
	});

	test('rejects a highlight option of the wrong type', () => {
		expect(() => mdsvex({ highlight: 'ts' as never })).toThrow(
			/highlight must be/
		);
	});

	test('an unknown language warns once per file', async () => {
		const { transform, warned } = plugin();
		const doc = '```nope\na\n```\n\n```nope\nb\n```\n';
		await transform(doc);
		await transform(doc);
		await transform(doc, '/src/other.svx');
		expect(warned).toEqual([
			[
				'no highlighter for the language nope, its code renders plain',
				{ line: 1, column: 0 },
			],
			[
				'no highlighter for the language nope, its code renders plain',
				{ line: 1, column: 0 },
			],
		]);
	});

	test('twoslash renders fences marked twoslash', async () => {
		const { transform } = plugin({ highlight: { twoslash: true } });
		const out = await transform(
			'```ts twoslash\nconst a = 1\n```\n\n```ts\nconst b = 2\n```\n'
		);
		expect(out.code).toContain('twoslash');
		expect(out.code).not.toMatch(/[{}]/);
	}, 30_000);
});
