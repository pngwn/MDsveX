// the home page's quick start, from docs/learn/quick-start. Kept out of the
// .svelte file: Vite's dependency scan reads the import lines of a template
// string in a component's script as real imports, and bundles vite for the browser
export const install = 'pnpm add --save-dev mdsvex@next';

export const config = `// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { mdsvex } from 'mdsvex';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [mdsvex({ extensions: ['.svx', '.md'] }), sveltekit()]
});`;
