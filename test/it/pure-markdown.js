import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { transform } from '../../src';

const PATH = join(__dirname, '../_fixtures/markdown');
const INPUT_PATH = join(PATH, 'input');
const OUTPUT_PATH = join(PATH, 'output');

export default function(test) {
	const md_files = readdirSync(INPUT_PATH).map(p => [
		p,
		readFileSync(join(INPUT_PATH, p), { encoding: 'utf8' }),
		readFileSync(join(OUTPUT_PATH, `${basename(p, '.md')}.html`), {
			encoding: 'utf8',
		}),
	]);

	md_files.forEach(([path, input, output], i) => {
		test(`it should correctly parse pure markdown files: ${path}`, async t => {
			// temp
			if (path === 'literal-html-tags.md') return;

			let result;
			try {
				result = await transform().process(input);
			} catch (e) {
				console.log(i, e);
			}

			t.equal(
				output.replace(/\n\n/, '\n').trim(),
				result.contents.replace(/\n\n/, '\n').trim()
			);
		});
	});
}
