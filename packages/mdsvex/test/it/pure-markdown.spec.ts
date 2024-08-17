import { test, expect } from 'vitest';

import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { lines } from '../utils';
import { transform } from '../../src';

const PATH = join(__dirname, '../_fixtures/markdown');
const INPUT_PATH = join(PATH, 'input');
const OUTPUT_PATH = join(PATH, 'output');

const md_files = readdirSync(INPUT_PATH).map((p) => [
	p,
	readFileSync(join(INPUT_PATH, p), { encoding: 'utf8' }),
	readFileSync(join(OUTPUT_PATH, `${basename(p, '.md')}.html`), {
		encoding: 'utf8',
	}),
]);

md_files.forEach(([path, input, output], i) => {
	test(`it should correctly parse pure markdown files: ${path}`, async () => {
		// temp
		if (path === 'literal-html-tags.md') return;

		let result;
		try {
			result = await transform().process(input);
		} catch (e) {
			console.log(i, e);
		}
		expect(lines(output)).toEqual(result && lines(result.contents as string));
	});
});
