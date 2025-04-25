// @ts-ignore
globalThis.global = globalThis;

if (typeof window !== 'undefined') {
	// @ts-ignore
	window.global = globalThis;
}

export { defineConfig as defineMDSveXConfig } from './define-config';
export { compile, mdsvex, code_highlighter } from './index';
export { escape_svelty as escapeSvelte } from './transformers';
export type {
	MdsvexCompileOptions,
	MdsvexLanguage,
	MdsvexOptions,
} from './types';
