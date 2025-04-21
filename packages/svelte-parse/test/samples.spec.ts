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
	let i;

	try {
		i = parse({ value: input, generatePositions: true });
	} catch (e) {
		console.warn(f);
		throw e;
	}
	return [f, i, output];
});

import { test, expect } from 'vitest';

input_outputs.forEach(([testname, input, output], i) => {
	test(`inputs should equal outputs: ${testname}`, () => {
		expect(input).toEqual(output);
	});
});
