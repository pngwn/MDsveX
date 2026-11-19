import type { Plugin } from '@rollup/browser';

const plugin: Plugin = {
	name: 'svg',
	transform: (code, id) => {
		if (!id.endsWith('.svg')) return;

		return {
			code: `export default ${btoa(code)};`,
			map: null,
		};
	},
};

export default plugin;
