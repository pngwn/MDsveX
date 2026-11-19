import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { take_info } from '../src/utils';

function noted(doc: string, text = 'src='): boolean {
	take_info('', text);
	const { source } = parse_markdown_svelte(doc);
	return take_info(source, text);
}

describe('take_info', () => {
	test('is true once after a parse that made a fence whose info string holds the text', () => {
		expect(noted('text\n\n```ts src=./a.ts\n```\n')).toBe(true);
		expect(take_info('text\n\n```ts src=./a.ts\n```\n', 'src=')).toBe(false);
	});

	test('stays false for documents whose info strings do not hold it', () => {
		for (const doc of [
			'',
			'# heading\n\ntext with `code` and a [link](./a.ts)\n',
			'```\nno info\n```\n',
			'```\n```\n',
			'    indented code\n',
			'<pre src="./a.ts"></pre>\n',
			'![alt](./a.png)\n',
			'```ts\nlet src = 1;\n```\n',
			'```ts title="x" {1}\nsrc=./a.ts\n```\n',
			'src=./a.ts\n\n```ts\n```\n\nsrc=./a.ts\n',
			'```ts sr\nc=./a.ts\n```\n',
			'text `#!ts src` text\n',
		])
			expect(noted(doc), doc).toBe(false);
	});

	test('sees the text wherever the fence sits and wherever the info string has it', () => {
		for (const doc of [
			'```src=./a.ts\n```\n',
			'```ts src=./a.ts\n```\n',
			'```ts {1} src=./a.ts\n```\n',
			'```ts title=x src=\n```\n',
			'> ```src=./a.ts\n> ```\n',
			'- ```ts src=./a.ts\n  a\n  ```\n',
			'<div>\n\n```ts src=./a.ts\n```\n\n</div>\n',
			'```js\n```\n\n```ts\n```\n\n```py src=./a.py\n```\n',
			// never closed, the fence runs to the end
			'```ts src=./a.ts\nlet a\n',
		])
			expect(noted(doc), doc).toBe(true);
	});

	test('looks for whatever text it is given', () => {
		expect(noted('```ts run\n```\n', 'run')).toBe(true);
		expect(noted('```ts run\n```\n', 'src=')).toBe(false);
		expect(noted('```ts\n```\n', 'ts')).toBe(true);
	});

	test('a document with more info strings than it notes is true, and the next is not', () => {
		const many = '```ts\n```\n\n'.repeat(200);
		expect(noted(many)).toBe(true);
		expect(noted('```ts\n```\n')).toBe(false);
	});

	test('parses nobody asked about leave no more than the cap behind', () => {
		take_info('', 'src=');
		for (let i = 0; i < 50; i++)
			parse_markdown_svelte('```ts a\n```\n\n'.repeat(10));
		const doc = '```ts\n```\n';
		parse_markdown_svelte(doc);
		// too many to tell, so the caller looks
		expect(take_info(doc, 'src=')).toBe(true);
		expect(noted(doc)).toBe(false);
	});
});
