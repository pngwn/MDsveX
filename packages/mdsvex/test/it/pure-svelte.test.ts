import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { readdirSync, readFileSync, existsSync, lstatSync } from 'fs';
import { join, extname } from 'path';
import { lines } from '../utils';

import { transform } from '../../src';

const PATH = join(__dirname, '../_fixtures/svelte');

const is_dir = (path: string): boolean =>
	existsSync(path) && lstatSync(path).isDirectory();

type string_arr = string | string_arr[];

const get_dir_path = (d: string): string_arr => {
	const out = readdirSync(d);
	return out.map((f) => {
		const p = join(d, f);
		if (is_dir(p)) return get_dir_path(p);
		else return p;
	});
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flatten = (arr: any) =>
	arr.reduce(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(acc: any, next: any) =>
			acc.concat(Array.isArray(next) ? flatten(next) : next),
		[]
	);

const svelte = suite('pure-svelte');

let svelte_files;
try {
	svelte_files = (flatten(get_dir_path(PATH)) as string[])
		.filter((f: string) => extname(f) === '.svelte')
		.map((f) => [f, readFileSync(f, { encoding: 'utf8' })]);
} catch (e) {
	throw new Error(e);
}

svelte_files.forEach(([path, file], i) => {
	svelte(
		`it should correctly parse any svelte component: ${path.replace(
			join(__dirname, '../_fixtures/svelte/'),
			''
		)}`,
		async () => {
			let output;

			try {
				output = await transform().process(file);
			} catch (e) {
				console.log(i, e);
			}

			assert.equal(lines(file), output && lines(output.contents as string));
		}
	);
});

svelte.run();
