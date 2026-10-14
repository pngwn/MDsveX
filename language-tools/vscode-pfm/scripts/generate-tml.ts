import fs from 'node:fs';
import path from 'node:path';

type Language = {
	/** Full or shorthand name of the language. */
	name: string;
	/** Full name of the language. */
	language?: string;
	/**
	 * List of names that can be used to trigger syntax highlighting for the language.
	 * @example ['js', 'javascript']
	 */
	identifiers: string[];
	/** Source that is used inside code block, can be multiple. */
	source: string | string[];
};

//
const languages: Language[] = [
	{
		name: 'css',
		language: 'css',
		identifiers: ['css', 'css.erb'],
		source: 'source.css',
	},
	{
		name: 'basic',
		language: 'html',
		identifiers: ['html', 'htm', 'shtml', 'xhtml', 'inc', 'tmpl', 'tpl'],
		source: 'text.html.basic',
	},
	{
		name: 'ini',
		language: 'ini',
		identifiers: ['ini', 'conf'],
		source: 'source.ini',
	},
	{
		name: 'java',
		language: 'java',
		identifiers: ['java', 'bsh'],
		source: 'source.java',
	},
	{ name: 'lua', language: 'lua', identifiers: ['lua'], source: 'source.lua' },
	{
		name: 'makefile',
		language: 'makefile',
		identifiers: ['Makefile', 'makefile', 'GNUmakefile', 'OCamlMakefile'],
		source: 'source.makefile',
	},
	{
		name: 'perl',
		language: 'perl',
		identifiers: ['perl', 'pl', 'pm', 'pod', 't', 'PL', 'psgi', 'vcl'],
		source: 'source.perl',
	},
	{
		name: 'r',
		language: 'r',
		identifiers: ['R', 'r', 's', 'S', 'Rprofile', '\\{\\.r.+?\\}'],
		source: 'source.r',
	},
	{
		name: 'ruby',
		language: 'ruby',
		identifiers: [
			'ruby',
			'rb',
			'rbx',
			'rjs',
			'Rakefile',
			'rake',
			'cgi',
			'fcgi',
			'gemspec',
			'irbrc',
			'Capfile',
			'ru',
			'prawn',
			'Cheffile',
			'Gemfile',
			'Guardfile',
			'Hobofile',
			'Vagrantfile',
			'Appraisals',
			'Rantfile',
			'Berksfile',
			'Berksfile.lock',
			'Thorfile',
			'Puppetfile',
		],
		source: 'source.ruby',
	},
	// Left to its own devices, the PHP grammar will match HTML as a combination of operators
	// and constants. Therefore, HTML must take precedence over PHP in order to get proper
	// syntax highlighting.
	{
		name: 'php',
		language: 'php',
		identifiers: ['php', 'php3', 'php4', 'php5', 'phpt', 'phtml', 'aw', 'ctp'],
		source: ['text.html.basic', 'source.php'],
	},
	{
		name: 'sql',
		language: 'sql',
		identifiers: ['sql', 'ddl', 'dml'],
		source: 'source.sql',
	},
	{
		name: 'vs_net',
		language: 'vs_net',
		identifiers: ['vb'],
		source: 'source.asp.vb.net',
	},
	{
		name: 'xml',
		language: 'xml',
		identifiers: [
			'xml',
			'xsd',
			'tld',
			'jsp',
			'pt',
			'cpt',
			'dtml',
			'rss',
			'opml',
		],
		source: 'text.xml',
	},
	{
		name: 'xsl',
		language: 'xsl',
		identifiers: ['xsl', 'xslt'],
		source: 'text.xml.xsl',
	},
	{
		name: 'yaml',
		language: 'yaml',
		identifiers: ['yaml', 'yml'],
		source: 'source.yaml',
	},
	{
		name: 'dosbatch',
		language: 'dosbatch',
		identifiers: ['bat', 'batch'],
		source: 'source.batchfile',
	},
	{
		name: 'clojure',
		language: 'clojure',
		identifiers: ['clj', 'cljs', 'clojure'],
		source: 'source.clojure',
	},
	{
		name: 'coffee',
		language: 'coffee',
		identifiers: ['coffee', 'Cakefile', 'coffee.erb'],
		source: 'source.coffee',
	},
	{ name: 'c', language: 'c', identifiers: ['c', 'h'], source: 'source.c' },
	{
		name: 'cpp',
		language: 'cpp',
		identifiers: ['cpp', 'c\\+\\+', 'cxx'],
		source: 'source.cpp',
	},
	{
		name: 'diff',
		language: 'diff',
		identifiers: ['patch', 'diff', 'rej'],
		source: 'source.diff',
	},
	{
		name: 'dockerfile',
		language: 'dockerfile',
		identifiers: ['dockerfile', 'Dockerfile'],
		source: 'source.dockerfile',
	},
	{
		name: 'git_commit',
		identifiers: ['COMMIT_EDITMSG', 'MERGE_MSG'],
		source: 'text.git-commit',
	},
	{
		name: 'git_rebase',
		identifiers: ['git-rebase-todo'],
		source: 'text.git-rebase',
	},
	{
		name: 'go',
		language: 'go',
		identifiers: ['go', 'golang'],
		source: 'source.go',
	},
	{
		name: 'groovy',
		language: 'groovy',
		identifiers: ['groovy', 'gvy'],
		source: 'source.groovy',
	},
	{
		name: 'pug',
		language: 'pug',
		identifiers: ['jade', 'pug'],
		source: 'text.pug',
	},

	{
		name: 'ignore',
		language: 'ignore',
		identifiers: ['gitignore', 'ignore'],
		source: 'source.ignore',
	},
	{
		name: 'js',
		language: 'javascript',
		identifiers: [
			'js',
			'javascript',
			'es6',
			'mjs',
			'cjs',
			'dataviewjs',
			'\\{\\.js.+?\\}',
		],
		source: 'source.js',
	},
	{
		name: 'jsx',
		language: 'javascriptreact',
		identifiers: ['jsx'],
		source: 'source.js.jsx',
	},
	{ name: 'js_regexp', identifiers: ['regexp'], source: 'source.js.regexp' },
	{
		name: 'json',
		language: 'json',
		identifiers: [
			'json',
			'json5',
			'sublime-settings',
			'sublime-menu',
			'sublime-keymap',
			'sublime-mousemap',
			'sublime-theme',
			'sublime-build',
			'sublime-project',
			'sublime-completions',
		],
		source: 'source.json',
	},
	{
		name: 'jsonc',
		language: 'jsonc',
		identifiers: ['jsonc'],
		source: 'source.json.comments',
	},
	{
		name: 'jsonl',
		language: 'jsonl',
		identifiers: ['jsonl', 'jsonlines'],
		source: 'source.json.lines',
	},
	{
		name: 'less',
		language: 'less',
		identifiers: ['less'],
		source: 'source.css.less',
	},
	{
		name: 'objc',
		language: 'objc',
		identifiers: ['objectivec', 'objective-c', 'mm', 'objc', 'obj-c', 'm', 'h'],
		source: 'source.objc',
	},
	{
		name: 'swift',
		language: 'swift',
		identifiers: ['swift'],
		source: 'source.swift',
	},
	{
		name: 'scss',
		language: 'scss',
		identifiers: ['scss'],
		source: 'source.css.scss',
	},

	{
		name: 'perl6',
		language: 'perl6',
		identifiers: ['perl6', 'p6', 'pl6', 'pm6', 'nqp'],
		source: 'source.perl.6',
	},
	{
		name: 'powershell',
		language: 'powershell',
		identifiers: ['powershell', 'ps1', 'psm1', 'psd1', 'pwsh'],
		source: 'source.powershell',
	},
	{
		name: 'python',
		language: 'python',
		identifiers: [
			'python',
			'py',
			'py3',
			'rpy',
			'pyw',
			'cpy',
			'SConstruct',
			'Sconstruct',
			'sconstruct',
			'SConscript',
			'gyp',
			'gypi',
			'\\{\\.python.+?\\}',
		],
		source: 'source.python',
	},
	{
		name: 'julia',
		language: 'julia',
		identifiers: ['julia', '\\{\\.julia.+?\\}'],
		source: 'source.julia',
	},
	{
		name: 'regexp_python',
		identifiers: ['re'],
		source: 'source.regexp.python',
	},
	{
		name: 'rust',
		language: 'rust',
		identifiers: ['rust', 'rs', '\\{\\.rust.+?\\}'],
		source: 'source.rust',
	},
	{
		name: 'scala',
		language: 'scala',
		identifiers: ['scala', 'sbt'],
		source: 'source.scala',
	},
	{
		name: 'shell',
		language: 'shellscript',
		identifiers: [
			'shell',
			'sh',
			'bash',
			'zsh',
			'bashrc',
			'bash_profile',
			'bash_login',
			'profile',
			'bash_logout',
			'.textmate_init',
			'\\{\\.bash.+?\\}',
		],
		source: 'source.shell',
	},
	{
		name: 'ts',
		language: 'typescript',
		identifiers: ['typescript', 'ts'],
		source: 'source.ts',
	},
	{
		name: 'tsx',
		language: 'typescriptreact',
		identifiers: ['tsx'],
		source: 'source.tsx',
	},
	{
		name: 'csharp',
		language: 'csharp',
		identifiers: ['cs', 'csharp', 'c#'],
		source: 'source.cs',
	},
	{
		name: 'fsharp',
		language: 'fsharp',
		identifiers: ['fs', 'fsharp', 'f#'],
		source: 'source.fsharp',
	},
	{
		name: 'dart',
		language: 'dart',
		identifiers: ['dart'],
		source: 'source.dart',
	},
	{
		name: 'handlebars',
		language: 'handlebars',
		identifiers: ['handlebars', 'hbs'],
		source: 'text.html.handlebars',
	},
	{
		name: 'markdown',
		language: 'markdown',
		identifiers: ['markdown', 'md'],
		source: 'text.html.markdown',
	},
	{ name: 'mdx', language: 'mdx', identifiers: ['mdx'], source: 'source.mdx' },
	{
		name: 'pfm',
		language: 'pfm',
		identifiers: ['pfm', 'svx', 'mdsvex'],
		source: '$self',
	},
	{
		name: 'vue',
		language: 'vue',
		identifiers: ['vue'],
		source: 'text.html.vue',
	},
	{
		name: 'svelte',
		language: 'svelte',
		identifiers: ['svelte'],
		source: 'source.svelte',
	},
	{ name: 'log', language: 'log', identifiers: ['log'], source: 'text.log' },
	{
		name: 'erlang',
		language: 'erlang',
		identifiers: ['erlang'],
		source: 'source.erlang',
	},
	{
		name: 'elixir',
		language: 'elixir',
		identifiers: ['elixir'],
		source: 'source.elixir',
	},
	{
		name: 'latex',
		language: 'latex',
		identifiers: ['latex', 'tex', 'math'],
		source: 'text.tex.latex',
	},
	{
		name: 'bibtex',
		language: 'bibtex',
		identifiers: ['bibtex'],
		source: 'text.bibtex',
	},
	{
		name: 'twig',
		language: 'twig',
		identifiers: ['twig'],
		source: 'source.twig',
	},
	{
		name: 'yang',
		language: 'yang',
		identifiers: ['yang'],
		source: 'source.yang',
	},
	{
		name: 'abap',
		language: 'abap',
		identifiers: ['abap'],
		source: 'source.abap',
	},
	{
		name: 'restructuredtext',
		language: 'restructuredtext',
		identifiers: ['restructuredtext', 'rst'],
		source: 'source.rst',
	},
];

function fenced_code_block_definition(language: Language) {
	const is_multiple_sources = Array.isArray(language.source);
	const sources = (
		!is_multiple_sources
			? [language.source as string]
			: (language.source as string[])
	).map((source) => `{ "include": "${source}" }`);

	return `{
					"begin": "^([ \\t]*(?:>[ \\t]*)*)(\`{3,})(?i:(${language.identifiers.join('|')})(?=[ \\t]|$)([^\`]*)$)",
					"beginCaptures": {
						"2": { "name": "punctuation.definition.code.begin.pfm" },
						"3": { "name": "entity.name.function.${language.language ?? language.name}" },
						"4": { "patterns": [{ "include": "#fence-meta" }] }
					},
					"end": "(^|\\1)(\\2\`*)[ \\t]*$",
					"endCaptures": {
						"2": { "name": "punctuation.definition.code.end.pfm" }
					},
					"name": "markup.fenced_code.block.pfm",
					"patterns": [
						{
							"begin": "(^|\\G)(\\s*)(.*)",
							"while": "(^|\\G)(?!\\s*(\`{3,})\\s*$)",
							"contentName": "meta.embedded.block.${language.language}",
							"patterns": [${!is_multiple_sources ? sources[0] : `\n${indent(8, sources.join(',\n'))}\n`}${indent(!is_multiple_sources ? 0 : 7, ']')}
						}
					]
				}`;
}

const indent = (count: number, text: string) =>
	text.replace(/^/gm, `\t`.repeat(count));

function fenced_code_block_definitions() {
	return languages
		.map(fenced_code_block_definition)
		.join(',\n\t\t\t\t')
		.replace(/\\/gm, '\\\\');
}

const includes = [fenced_code_block_definitions];

function build_grammar() {
	let text = fs.readFileSync(
		path.join(import.meta.dirname, 'pfm.tmLanguage.base.json'),
		'utf-8'
	);
	// Replace inserts with matching functions' outputs
	includes.map((include_fn) => {
		text = text.replace(`{ "#insert": "${include_fn.name}" }`, include_fn());
	});
	fs.writeFileSync(
		path.join(import.meta.dirname, '..', 'syntaxes', 'pfm.tmLanguage.json'),
		text
	);
}

build_grammar();
