import * as path from 'path';
import * as fs from 'fs';

import { parse } from '../src/main';

const fixtures = path.join(__dirname, 'fixtures');

const inputs = fs
	.readdirSync(fixtures, { encoding: 'utf-8' })
	.filter(
		(f) => !f.startsWith('error') && f !== 'generate.ts' && f !== '.DS_Store'
	)
	.map((f) => [
		f,
		fs.readFileSync(path.join(fixtures, f, 'input.svelte')).toString(),
		JSON.parse(
			fs.readFileSync(path.join(fixtures, f, 'output.json')).toString()
		),
	])
	.filter(Boolean);

const input_outputs = inputs.map(([f, input, output]) => {
	// if (f === '02-Table-Table') {
	// 	console.log(
	// 		JSON.stringify(parse({ value: input, generatePositions: false }), null, 2)
	// 	);
	// }
	return [f, parse({ value: input, generatePositions: true }), output];
});

import { suite } from 'uvu';
import * as assert from 'uvu/assert';

const samples = suite('parsing-samples');

input_outputs.forEach(([testname, input, output], i) => {
	samples(`inputs should equal outputs: ${testname}`, () => {
		assert.equal(input, output);
	});
});

samples.run();
