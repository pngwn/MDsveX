import type { Plugin } from '@rollup/browser';

const plugin: Plugin = {
	name: 'json',
	transform: (code, id) => {
		if (!id.endsWith('.json')) return;

		return {
			code: `export default ${code};`,
			map: null,
		};
	},
};

export default plugin;
