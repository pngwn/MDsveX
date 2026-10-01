import { sveltekit } from '@sveltejs/kit/vite';
import { mdsvex } from 'mdsvex';
import { defineConfig } from 'vite';

const plugins = [mdsvex({ extensions: ['.svx'] }), sveltekit()];
if (process.env.MDSVEX_LAST) plugins.reverse();

export default defineConfig({ plugins });
