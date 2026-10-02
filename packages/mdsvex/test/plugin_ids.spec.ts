import { describe, expect, test } from 'vitest';

import { mdsvex } from '../src/main';

const CSS = 'h1 { color: red; }';

describe('vite plugin ids', () => {
	test('compiles a document', () => {
		const [pre] = mdsvex() as any[];
		expect(pre.transform('# Hi\n', '/doc.svx').code).toBe('<h1>Hi</h1>');
	});

	test.each([
		'/doc.svx?template=false',
		'/doc.svx?template=false&t=1',
		'/doc.svx?t=1',
	])('compiles a document imported with a query: %s', (id) => {
		const [pre] = mdsvex() as any[];
		expect(pre.transform('# Hi\n', id).code).toBe('<h1>Hi</h1>');
	});

	test.each([
		'/doc.svx?svelte&type=style&lang.css',
		'/doc.svx?svelte&type=style&lang.css&inline',
		'/doc.svx?template=false&svelte&type=style&lang.css',
	])('leaves a vite-plugin-svelte sub-request alone: %s', (id) => {
		const [pre, post] = mdsvex() as any[];
		expect(pre.transform(CSS, id)).toBeUndefined();
		expect(post.transform(CSS, id)).toBeUndefined();
	});

	test('leaves other extensions alone', () => {
		const [pre] = mdsvex() as any[];
		expect(pre.transform(CSS, '/style.css?svx')).toBeUndefined();
	});
});
