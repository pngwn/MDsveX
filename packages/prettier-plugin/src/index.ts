import type { Parser, Plugin, SupportLanguage } from 'prettier';

import { parse } from './ast';
import type { SvxNode } from './ast';
import { printer } from './printer';

export const languages: SupportLanguage[] = [
	{
		name: 'mdsvex',
		parsers: ['mdsvex'],
		extensions: ['.svx', '.pfm'],
		vscodeLanguageIds: ['mdsvex', 'svx', 'pfm'],
	},
];

export const parsers: Record<string, Parser<SvxNode>> = {
	mdsvex: {
		parse,
		astFormat: 'mdsvex',
		locStart: (node) => node.start,
		locEnd: (node) => node.end,
	},
};

export const printers = { mdsvex: printer };

const plugin: Plugin<SvxNode> = { languages, parsers, printers };

export default plugin;
