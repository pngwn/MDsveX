import { redirect } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

import type { PageServerLoad } from './$types';

function get_first_sample(kind: string) {
	return fs.readdirSync(
		path.join(
			import.meta.dirname,

			'..',
			'..',
			'..',
			'..',
			'pfm-tests',
			'tests',
			kind
		)
	)[0];
}

export const load: PageServerLoad = async ({ params }) => {
	throw redirect(302, '/explorer/atx_headings');
};
