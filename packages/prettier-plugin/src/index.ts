import type { Parser, Plugin, SupportLanguage, SupportOptions } from 'prettier';

import { parse } from './ast';
import { formats_frontmatter } from './config';
import type { FrontmatterMode } from './config';
import type { SvxNode } from './ast';
import { has_ignore_pragma, has_pragma } from './pragma';
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
		async parse(text, options) {
			const root = parse(text);
			root.yaml = await formats_frontmatter(
				(options as { mdsvexFrontmatter?: FrontmatterMode }).mdsvexFrontmatter,
				options.filepath
			);
			return root;
		},
		astFormat: 'mdsvex',
		locStart: (node) => node.start,
		locEnd: (node) => node.end,
		hasPragma: has_pragma,
		hasIgnorePragma: has_ignore_pragma,
	},
};

export const printers = { mdsvex: printer };

export const options: SupportOptions = {
	mdsvexFrontmatter: {
		type: 'choice',
		category: 'mdsvex',
		default: 'auto',
		description: 'How to format the frontmatter of a document.',
		choices: [
			{
				value: 'auto',
				description:
					'As yaml, unless the mdsvex manifest says the project parses frontmatter itself.',
			},
			{ value: 'yaml', description: 'Always as yaml.' },
			{ value: 'keep', description: 'Never, keep it as written.' },
		],
	},
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
