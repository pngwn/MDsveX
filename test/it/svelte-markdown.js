import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { mdsvex } from '../../src';

const PATH = join(__dirname, '../_fixtures/hybrid');
const INPUT_PATH = join(PATH, 'input');
const OUTPUT_PATH = join(PATH, 'output');

export default function(test) {
	const md_files = readdirSync(INPUT_PATH).map(p => [
		p,
		readFileSync(join(INPUT_PATH, p), { encoding: 'utf8' }),
		readFileSync(join(OUTPUT_PATH, `${basename(p, '.svx')}.svelte`), {
			encoding: 'utf8',
		}),
	]);

	md_files.forEach(([path, input, output], i) => {
		test(`it should correctly parse hybrid svelte-markdown files: ${path}`, async t => {
			let result;
			try {
				result = await mdsvex().markup({ content: input, filename: path });
			} catch (e) {
				console.log(i, e);
			}

			t.equal(
				output.replace(/\n\n/, '\n').trim(),
				result.code.replace(/\n\n/, '\n').trim()
			);
		});
	});
}
