import { describe, expect, test } from 'vitest';

import { PFMParser, parse_markdown_svelte, take_src } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';

describe('take_src', () => {
	test('is true once after a parse that made an image with a url', () => {
		take_src();
		parse_markdown_svelte('text ![alt](./a.png) more\n');
		expect(take_src()).toBe(true);
		expect(take_src()).toBe(false);
	});

	test('stays false for documents without one', () => {
		take_src();
		for (const doc of [
			'',
			'# heading\n\ntext with a [link](./a.png "title")\n',
			'<img src="./a.png" alt="typed">\n',
			'```js\nconst src = "./a.png";\n```\n',
			// never closed, so no image
			'![alt](./a.png\n',
			'- [x] task\n\n| a |\n| - |\n| b |\n',
		]) {
			parse_markdown_svelte(doc);
			expect(take_src(), doc).toBe(false);
		}
	});

	test('sees an image wherever it sits and with whatever else it has', () => {
		for (const doc of [
			'![alt](a.png "title")\n',
			'[![alt](a.png)](/page)\n',
			'> - ![alt](a.png)\n',
			'| a |\n| - |\n| ![alt](a.png) |\n',
			'<div>\n\n![alt](a.png)\n\n</div>\n',
			'![alt](<a b.png>)\n',
		]) {
			parse_markdown_svelte(doc, { unwrap_images: true });
			expect(take_src(), doc).toBe(true);
			parse_markdown_svelte(doc);
			expect(take_src(), doc).toBe(true);
		}
	});

	test('an image with an empty url counts, a src it has', () => {
		take_src();
		parse_markdown_svelte('![alt]()\n');
		expect(take_src()).toBe(true);
	});

	test('a fed parse notes it too', () => {
		take_src();
		const tree = new TreeBuilder(16);
		const parser = new PFMParser(tree);
		parser.init();
		for (const chunk of ['te', 'xt ![al', 't](./a', '.png) more\n'])
			parser.feed(chunk);
		parser.finish();
		expect(take_src()).toBe(true);
	});

	test('the note waits for whoever asks next', () => {
		take_src();
		parse_markdown_svelte('![alt](a.png)\n');
		parse_markdown_svelte('no image\n');
		expect(take_src()).toBe(true);
		expect(take_src()).toBe(false);
	});
});
