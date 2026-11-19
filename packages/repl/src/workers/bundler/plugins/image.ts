import type { Plugin } from '@rollup/browser';

const plugin: Plugin = {
	name: 'image',
	transform: (code, id) => {
		const match = id.match(/\.(png|webp)$/);
		if (!match) return;

		return {
			code: `export default "data:image/${match[1]};base64,${code}";`,
			map: null,
		};
	},
};

export default plugin;
