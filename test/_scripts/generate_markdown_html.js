import { readdirSync, writeFileSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import fetch from 'node-fetch';
import { gh_key } from '../../config.js';

const PATH = join(__dirname, '../_fixtures/markdown');
const INPUT_PATH = join(PATH, 'input');
const OUTPUT_PATH = join(PATH, 'output');

const md_files = readdirSync(INPUT_PATH).map(p => [
	p,
	readFileSync(join(INPUT_PATH, p), { encoding: 'utf8' }),
]);

function create_html([path, md]) {
	return new Promise(res => {
		fetch('https://api.github.com/markdown', {
			method: 'post',
			body: JSON.stringify({
				text: md,
				mode: 'gfm',
			}),
			headers: {
				'Content-Type': 'text/html',
				Authorization: `token ${gh_key}`,
			},
		})
			.then(v => v.text())
			.then(v => res([path, v]));
	});
}

Promise.all(md_files.map(create_html)).then(fs => {
	fs.forEach(([p, f]) => {
		writeFileSync(`${OUTPUT_PATH}/${basename(p, '.md')}.html`, f);
	});
});
