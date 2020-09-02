import * as path from 'path';
import * as fs from 'fs';

import { parse } from '../../src/main';

const fixtures = path.join(__dirname);
console.log(
	__filename,
	fs
		.readdirSync(fixtures, { encoding: 'utf-8' })
		.filter((f) => !f.startsWith('error') && f !== 'generate.ts')
);
const inputs_paths = fs
	.readdirSync(fixtures, { encoding: 'utf-8' })
	.filter((f) => !f.startsWith('error') && f !== 'generate.ts')
	.map((f) => [
		fs.readFileSync(path.join(fixtures, f, 'input.svelte')).toString(),
		path.join(fixtures, f),
	]);

inputs_paths.forEach(([s, f]) => {
	const output = JSON.stringify(
		parse({ value: s as string, generatePositions: true }),
		null,
		'\t'
	);

	fs.writeFileSync(path.join(f, 'output.json'), output + '\n');
	try {
		fs.unlinkSync(path.join(f, 'output.js'));
	} catch {
		console.log('oops');
	}
});
