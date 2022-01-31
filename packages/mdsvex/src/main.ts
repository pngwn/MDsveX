export { defineConfig as defineMDSveXConfig } from './define-config';
export { compile, mdsvex } from './index';
export { escape_svelty as escapeSvelte } from './transformers';
export type {
	MdsvexCompileOptions,
	MdsvexLanguage,
	MdsvexOptions,
} from './types';
