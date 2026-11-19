import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import { mdsvex } from 'mdsvex';
import { defineConfig } from 'vite';

const plugins = [
	mdsvex({
		extensions: ['.svx'],
		import_images: process.env.MDSVEX_PLAIN ? { enhanced: false } : true,
	}),
	enhancedImages(),
	sveltekit(),
];
if (process.env.MDSVEX_LAST) plugins.reverse();

export default defineConfig({ plugins });
