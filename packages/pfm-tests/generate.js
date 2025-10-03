// @ts-check

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tests } from 'commonmark-spec';

console.log(tests);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sections = {};
for (const test of tests) {
	if (!sections[test.section]) {
		sections[test.section] = [];
	}
	sections[test.section].push(test);
}

const output = join(__dirname, 'tests');
await mkdir(output, { recursive: true });

for (const section in sections) {
	const dir = join(
		__dirname,
		'tests',
		section.toLowerCase().replace(/ /g, '_')
	);

	for (const test of sections[section]) {
		await mkdir(join(dir, test.number.toString()), { recursive: true });

		await writeFile(join(dir, `${test.number}/input.md`), test.markdown);

		await writeFile(join(dir, `${test.number}/output.html`), test.html);
		await writeFile(join(dir, `${test.number}/ast.js`), 'export default {}');
	}
}
