import { compile as compileMdsvex, code_highlighter } from 'mdsvex';
import { sample } from '$lib';
import type { PageServerData } from './$types';

export async function load() {
	const result = await compileMdsvex(sample, {
		highlight: {
			highlighter: async (...args) => {
				const r = await code_highlighter(...args);
				return r.replace(/\`\}\<\/pre\>/, '</pre>').replace(/\{@html \`/, '');
			},
		},
	});
	return {
		html: result?.code,
	};
}
