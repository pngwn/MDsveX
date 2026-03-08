import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url'
import type { RouteId, RouteParams, PageServerLoad } from './$types';



const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function get_samples(kind: string) {
	console.log(`dirname: ${__dirname || "NONE"}. kind: ${kind}`)
	const test = fs.readdirSync(
		path.join(
			__dirname,
			'..',
			'..',
			'..',
			'..',
			'..',
			'..',
			'pfm-tests',
			'tests',
			kind
		)
	);

	const samples = test
		.filter((file) => !file.endsWith('.js'))
		.map((file) => [
			file.replace('.css', ''),
			fs.readFileSync(
				path.join(
					__dirname,
					'..',
					'..',
					'..',
					'..',
					'..',
					'..',
					'pfm-tests',
					'tests',
					kind,
					file,
					'input.md'
				),
				'utf-8'
			),
		]);

	return samples;
}

function get_all_kinds() {
	const test_cases = fs.readdirSync(
		path.join(
			__dirname,
			'..',
			'..',
			'..',
			'..',
			'..',
			'..',
			'pfm-tests',
			'tests'
		)
	);

	return test_cases;
}

export const load: PageServerLoad = async ({ params }) => {
	const { node_kind, sample } = params;

	// console.log('node_kind', node_kind);

	const samples_for_kind = get_samples(node_kind);

	return {
		kind_id: node_kind,
		samples_for_kind: samples_for_kind as [string, string][],
		sample_id: sample,
		all_kinds: get_all_kinds(),
	};
};
