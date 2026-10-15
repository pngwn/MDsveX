import type { Parser, Plugin, SupportLanguage, SupportOptions } from 'prettier';

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

export const options: SupportOptions = {
	mdsvexFormatFences: {
		type: 'boolean',
		category: 'mdsvex',
		default: false,
		description:
			'Format the code in a fence whose info string is a language Prettier knows and nothing else.',
	},
};

const plugin: Plugin<SvxNode> = { languages, parsers, printers, options };

export default plugin;
