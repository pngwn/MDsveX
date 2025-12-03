import { extname } from 'node:path';
import { sveltekit } from '@sveltejs/kit/vite';
import { mdsvex } from 'mdsvex';
import slug from 'rehype-slug';
import link from 'rehype-autolink-headings';
import inspect from 'vite-plugin-inspect';

function mdsvex_transform() {
	return {
		name: 'mdsvex-transform',
		enforce: 'pre',
		async transform(code, id) {
			if (extname(id) !== '.svtext') return;
			console.log(
				'+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++'
			);
			console.log('+++++++++++++ mdsvex_transform processing:', id);
			console.log(
				'+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++'
			);
			const c = (
				await mdsvex({
					highlight: {
						alias: {
							ts: 'typescript',
							mdx: 'markdown',
							svelte: 'svelte',
							svx: 'mdx',
							mdsvex: 'svx',
							sig: 'ts',
						},
					},
					extension: '.svtext',
					rehypePlugins: [slug, link],
				}).markup({ content: code, filename: id })
			).code;
			return `export default \`${c.replace(/`/g, '\\`').trim()}\`;`;
		},
	};
}

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [mdsvex_transform(), sveltekit()],
};

export default config;
