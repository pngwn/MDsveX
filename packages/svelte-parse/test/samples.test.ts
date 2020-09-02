import * as path from 'path';
import * as fs from 'fs';

import { parse } from '../src/main';

const fixtures = path.join(__dirname, 'fixtures');

const inputs_paths = fs
	.readdirSync(fixtures, { encoding: 'utf-8' })
	.map((f) =>
		f.startsWith('error')
			? false
			: fs.readFileSync(path.join(fixtures, f, 'input.svelte')).toString()
	)
	.filter(Boolean);

inputs_paths.forEach((f) => {
	console.log('=====================');
	console.log(f);
	console.log(
		JSON.stringify(
			parse({ value: f as string, generatePositions: true }),
			null,
			2
		)
	);
});
