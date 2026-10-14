import fs from 'node:fs';
import path from 'node:path';

type Language = {
	/** the vscode language id, it names the embedded scope */
	language: string;
	/**
	 * the names a fence can use for the language
	 * @example ['js', 'javascript']
	 */
	identifiers: string[];
	/** the grammars included in the fence, in order */
	source: string | string[];
};

const languages: Language[] = [
	{
		language: 'javascript',
		identifiers: ['js', 'javascript', 'mjs', 'cjs', 'es6'],
		source: 'source.js',
	},
	{
		language: 'javascriptreact',
		identifiers: ['jsx'],
		source: 'source.js.jsx',
	},
	{
		language: 'typescript',
		identifiers: ['ts', 'typescript', 'mts', 'cts'],
		source: 'source.ts',
	},
	{ language: 'typescriptreact', identifiers: ['tsx'], source: 'source.tsx' },
	{ language: 'css', identifiers: ['css'], source: 'source.css' },
	{ language: 'scss', identifiers: ['scss'], source: 'source.css.scss' },
	{ language: 'less', identifiers: ['less'], source: 'source.css.less' },
	{
		language: 'html',
		identifiers: ['html', 'htm', 'xhtml'],
		source: 'text.html.basic',
	},
	{ language: 'json', identifiers: ['json', 'json5'], source: 'source.json' },
	{ language: 'jsonc', identifiers: ['jsonc'], source: 'source.json.comments' },
	{
		language: 'jsonl',
		identifiers: ['jsonl', 'jsonlines'],
		source: 'source.json.lines',
	},
	{ language: 'svelte', identifiers: ['svelte'], source: 'source.svelte' },
	{ language: 'vue', identifiers: ['vue'], source: 'text.html.vue' },
	{
		language: 'handlebars',
		identifiers: ['handlebars', 'hbs'],
		source: 'text.html.handlebars',
	},
	{ language: 'jade', identifiers: ['pug', 'jade'], source: 'text.pug' },
	{ language: 'twig', identifiers: ['twig'], source: 'source.twig' },
	{
		language: 'python',
		identifiers: ['python', 'py', 'py3'],
		source: 'source.python',
	},
	{ language: 'rust', identifiers: ['rust', 'rs'], source: 'source.rust' },
	{ language: 'go', identifiers: ['go', 'golang'], source: 'source.go' },
	{
		language: 'shellscript',
		identifiers: ['bash', 'sh', 'shell', 'zsh'],
		source: 'source.shell',
	},
	{
		language: 'powershell',
		identifiers: ['powershell', 'ps1', 'pwsh'],
		source: 'source.powershell',
	},
	{
		language: 'bat',
		identifiers: ['bat', 'batch'],
		source: 'source.batchfile',
	},
	{ language: 'yaml', identifiers: ['yaml', 'yml'], source: 'source.yaml' },
	{ language: 'ini', identifiers: ['ini', 'conf'], source: 'source.ini' },
	{ language: 'xml', identifiers: ['xml', 'xsd', 'rss'], source: 'text.xml' },
	{ language: 'xsl', identifiers: ['xsl', 'xslt'], source: 'text.xml.xsl' },
	{ language: 'sql', identifiers: ['sql'], source: 'source.sql' },
	{
		language: 'dockerfile',
		identifiers: ['dockerfile', 'Dockerfile'],
		source: 'source.dockerfile',
	},
	{
		language: 'makefile',
		identifiers: ['makefile', 'Makefile', 'make'],
		source: 'source.makefile',
	},
	{
		language: 'ignore',
		identifiers: ['gitignore', 'ignore'],
		source: 'source.ignore',
	},
	{ language: 'diff', identifiers: ['diff', 'patch'], source: 'source.diff' },
	{ language: 'log', identifiers: ['log'], source: 'text.log' },
	{ language: 'c', identifiers: ['c', 'h'], source: 'source.c' },
	{
		language: 'cpp',
		identifiers: ['cpp', 'c++', 'cxx', 'hpp'],
		source: 'source.cpp',
	},
	{
		language: 'csharp',
		identifiers: ['csharp', 'cs', 'c#'],
		source: 'source.cs',
	},
	{
		language: 'fsharp',
		identifiers: ['fsharp', 'fs', 'f#'],
		source: 'source.fsharp',
	},
	{ language: 'java', identifiers: ['java'], source: 'source.java' },
	{ language: 'scala', identifiers: ['scala', 'sbt'], source: 'source.scala' },
	{
		language: 'groovy',
		identifiers: ['groovy', 'gvy'],
		source: 'source.groovy',
	},
	{
		language: 'clojure',
		identifiers: ['clojure', 'clj', 'cljs'],
		source: 'source.clojure',
	},
	{ language: 'swift', identifiers: ['swift'], source: 'source.swift' },
	{
		language: 'objective-c',
		identifiers: ['objective-c', 'objectivec', 'objc', 'obj-c'],
		source: 'source.objc',
	},
	{ language: 'dart', identifiers: ['dart'], source: 'source.dart' },
	{ language: 'vb', identifiers: ['vb'], source: 'source.asp.vb.net' },
	{
		language: 'coffeescript',
		identifiers: ['coffeescript', 'coffee'],
		source: 'source.coffee',
	},
	{ language: 'ruby', identifiers: ['ruby', 'rb'], source: 'source.ruby' },
	{
		language: 'php',
		identifiers: ['php'],
		// html first, the php grammar reads bare html as operators and constants
		source: ['text.html.basic', 'source.php'],
	},
	{
		language: 'perl',
		identifiers: ['perl', 'pl', 'pm'],
		source: 'source.perl',
	},
	{ language: 'raku', identifiers: ['raku', 'perl6'], source: 'source.perl.6' },
	{ language: 'lua', identifiers: ['lua'], source: 'source.lua' },
	{ language: 'r', identifiers: ['r', 'R'], source: 'source.r' },
	{ language: 'julia', identifiers: ['julia'], source: 'source.julia' },
	{
		language: 'erlang',
		identifiers: ['erlang', 'erl'],
		source: 'source.erlang',
	},
	{
		language: 'elixir',
		identifiers: ['elixir', 'ex', 'exs'],
		source: 'source.elixir',
	},
	{ language: 'abap', identifiers: ['abap'], source: 'source.abap' },
	{ language: 'yang', identifiers: ['yang'], source: 'source.yang' },
	{
		language: 'latex',
		identifiers: ['math', 'latex', 'tex'],
		source: 'text.tex.latex',
	},
	{ language: 'bibtex', identifiers: ['bibtex'], source: 'text.bibtex' },
	{
		language: 'restructuredtext',
		identifiers: ['restructuredtext', 'rst'],
		source: 'source.rst',
	},
	{
		language: 'markdown',
		identifiers: ['markdown', 'md'],
		source: 'text.html.markdown',
	},
	{ language: 'mdx', identifiers: ['mdx'], source: 'source.mdx' },
	{
		language: 'pfm',
		identifiers: ['svx', 'pfm', 'mdsvex'],
		source: '$self',
	},
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fence(language: Language) {
	const sources = Array.isArray(language.source)
		? language.source
		: [language.source];
	return {
		name: 'markup.fenced_code.block.pfm',
		begin: `^([ \\t]*(?:>[ \\t]*)*)(\`{3,})(${language.identifiers.map(escape).join('|')})(?=[ \\t]|$)([^\`]*)$`,
		end: '^[ \\t]*(?:>[ \\t]*)*(\\2`*)[ \\t]*$',
		beginCaptures: {
			2: { name: 'punctuation.definition.code.begin.pfm' },
			3: { name: 'fenced_code.block.language.pfm' },
			4: { patterns: [{ include: '#fence-meta' }] },
		},
		endCaptures: {
			1: { name: 'punctuation.definition.code.end.pfm' },
		},
		patterns: [
			{
				begin: '(^|\\G)(\\s*)(.*)',
				while: '(^|\\G)(?![ \\t]*(?:>[ \\t]*)*`{3,}[ \\t]*$)',
				contentName: `meta.embedded.block.${language.language}`,
				patterns: sources.map((source) => ({ include: source })),
			},
		],
	};
}

function check_identifiers() {
	const seen = new Map<string, string>();
	for (const { language, identifiers } of languages) {
		for (const identifier of identifiers) {
			const other = seen.get(identifier);
			if (other !== undefined)
				throw new Error(`${identifier} names both ${other} and ${language}`);
			seen.set(identifier, language);
		}
	}
}

const root = path.join(import.meta.dirname, '..');
const insert = '{ "#insert": "fenced_code_block_definitions" }';

function build_grammar() {
	const base = fs.readFileSync(
		path.join(import.meta.dirname, 'pfm.tmLanguage.base.json'),
		'utf-8'
	);
	if (!base.includes(insert)) throw new Error(`the base has no ${insert}`);
	const fences = languages
		.map((language) =>
			JSON.stringify(fence(language), null, '\t').replace(/\n/g, '\n\t\t\t\t')
		)
		.join(',\n\t\t\t\t');
	const grammar = base.replace(insert, () => fences);
	JSON.parse(grammar);
	fs.writeFileSync(path.join(root, 'syntaxes', 'pfm.tmLanguage.json'), grammar);
}

function build_embedded_languages() {
	const file = path.join(root, 'package.json');
	const pkg = JSON.parse(fs.readFileSync(file, 'utf-8'));
	const grammar = pkg.contributes.grammars.find(
		(grammar: { language: string }) => grammar.language === 'pfm'
	);
	const embedded: Record<string, string> = {};
	for (const [scope, language] of Object.entries<string>(
		grammar.embeddedLanguages
	)) {
		if (!scope.startsWith('meta.embedded.block.')) embedded[scope] = language;
	}
	for (const { language } of languages) {
		embedded[`meta.embedded.block.${language}`] = language;
	}
	grammar.embeddedLanguages = embedded;
	fs.writeFileSync(file, JSON.stringify(pkg, null, '\t') + '\n');
}

check_identifiers();
build_grammar();
build_embedded_languages();
