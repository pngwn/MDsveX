import retext from 'retext';
import smartypants from 'retext-smartypants';
import visit from 'unist-util-visit';
import yaml from 'js-yaml';
import * as svelte from 'svelte/compiler';
import escape from 'escape-html';

const parse = svelte.parse || svelte.default.parse;

// extract the yaml from 'yaml' nodes and put them in the vfil for later use

export function parse_yaml() {
	return transformer;

	function transformer(tree, vFile) {
		visit(tree, 'yaml', node => {
			try {
				vFile.data.fm = yaml.safeLoad(node.value);
			} catch (e) {
				vFile.messages.push(['YAML failed to parse', e]);
			}
		});
	}
}

// in code nodes replace the character witrh the html entities
// maybe I'll need more of these

const entites = [
	[/</g, '&lt;'],
	[/>/g, '&gt;'],
	[/{/g, '&#123;'],
	[/}/g, '&#125;'],
];

export function escape_code({ blocks }) {
	function transformer(tree) {
		if (!blocks) {
			visit(tree, 'code', escape);
		}

		visit(tree, 'inlineCode', escape);

		function escape(node) {
			for (let i = 0; i < entites.length; i += 1) {
				node.value = node.value.replace(entites[i][0], entites[i][1]);
			}
		}
	}
	return transformer;
}

// special case - process nodes with retext and smarypants
// retext plugins can't work generally due to the difficulties in converting between the two trees

export function smartypants_transformer(options = {}) {
	const processor = retext().use(smartypants, options);

	function transformer(tree) {
		visit(tree, 'text', node => {
			node.value = String(processor.processSync(node.value));
		});
	}
	return transformer;
}

// regex for scripts and attributes

const attrs = `(?:\\s{0,1}[a-zA-z]+=(?:"){0,1}[a-zA-Z0-9]+(?:"){0,1})*`;
const context = `(?:\\s{0,1}context)=(?:"){0,1}module(?:"){0,1}`;

const RE_BLANK = /^\n+$|^\s+$/;

const RE_SCRIPT = new RegExp(`^(<script` + attrs + `>)`);

const RE_MODULE_SCRIPT = new RegExp(
	`^(<script` + attrs + context + attrs + `>)`
);

export function transform_hast({ layout }) {
	return transformer;

	function transformer(tree, vFile) {
		// we need to keep { and } intact for svelte, so reverse the escaping in links and images
		visit(tree, 'element', node => {
			if (node.tagName === 'a' && node.properties.href) {
				node.properties.href = node.properties.href
					.replace(/%7B/g, '{')
					.replace(/%7D/g, '}');
			}

			if (node.tagName === 'img' && node.properties.src) {
				node.properties.src = node.properties.src
					.replace(/%7B/g, '{')
					.replace(/%7D/g, '}');
			}
		});

		// the rest only applies to layouts and front matter
		// this currently breaks position data svelte preprocessors don't currently support sourcemaps
		// i'll fix this when they do

		if (!layout && !vFile.data.fm) return;

		visit(tree, 'root', node => {
			// since we are wrapping and replacing we need to keep track of the different component 'parts'
			// many special tags cannot be wrapped nor  can style or script tags
			const parts = {
				special: [],
				html: [],
				instance: [],
				module: [],
				css: [],
			};

			// iterate through all top level child nodes and assign them to the correct 'part'
			// anything that is a normal HAST node gets stored as HTML untouched
			// everything else gets parsed by the svelte parser

			children: for (let i = 0; i < node.children.length; i += 1) {
				if (
					(node.children[i].type !== 'raw' &&
						node.children[i].type === 'text' &&
						RE_BLANK.exec(node.children[i].value)) ||
					!node.children[i].value
				) {
					if (
						!parts.html[parts.html.length - 1] ||
						!(
							RE_BLANK.exec(node.children[i].value) &&
							RE_BLANK.exec(parts.html[parts.html.length - 1].value)
						)
					) {
						parts.html.push(node.children[i]);
					}

					continue children;
				}

				let result;
				try {
					result = parse(node.children[i].value);
				} catch (e) {
					parts.html.push(node.children[i]);
					continue children;
				}

				// svelte special tags that have to be top level

				const _parts = result.html.children.map(v => {
					if (
						v.type === 'Options' ||
						v.type === 'Head' ||
						v.type === 'Window' ||
						v.type === 'Body'
					) {
						return ['special', v.start, v.end];
					} else {
						return ['html', v.start, v.end];
					}
				});

				// module scripts

				if (result.module) {
					_parts.push(['module', result.module.start, result.module.end]);
				}

				// style elements

				if (result.css) {
					_parts.push(['css', result.css.start, result.css.end]);
				}

				// instance scripts

				if (result.instance) {
					_parts.push(['instance', result.instance.start, result.instance.end]);
				}

				// sort them to ensure the array is in the order they appear in the source, no gaps
				// this might not be necessary any more, i forget
				const sorted = _parts.sort((a, b) => a[1] - b[1]);

				// push the nodes into the correct 'part' since they are sorted everything should be in the correct order
				sorted.forEach(next => {
					parts[next[0]].push({
						type: 'raw',
						value: node.children[i].value.substring(next[1], next[2]),
					});
				});
			}

			const { special, html, instance, module: _module, css } = parts;

			const fm =
				vFile.data.fm &&
				`export const metadata = ${JSON.stringify(vFile.data.fm)};`;

			// don't @ me

			const _layout =
				vFile.data.fm &&
				vFile.data.fm.layout !== undefined &&
				vFile.data.fm.layout === false
					? false
					: vFile.data.fm && vFile.data.fm.layout
						? vFile.data.fm.layout
						: layout;

			const layout_import =
				_layout && `import Layout_MDSVEX_DEFAULT from '${_layout}';`;

			// add the layout if w are using one, reusing the existing script if one exists
			if (_layout && !instance[0]) {
				instance.push({
					type: 'raw',
					value: `\n<script>\n\t${layout_import}\n</script>\n`,
				});
			} else if (_layout) {
				instance[0].value = instance[0].value.replace(
					RE_SCRIPT,
					`$1\n\t${layout_import}`
				);
			}

			// inject the frontmatter into the module script if there is any, resuing the existing module script if one exists
			if (!_module[0] && fm) {
				_module.push({
					type: 'raw',
					value: `<script context="module">\n\t${fm}\n</script>`,
				});
			} else if (fm) {
				_module[0].value = _module[0].value.replace(
					RE_MODULE_SCRIPT,
					`$1\n\t${fm}`
				);
			}

			// smoosh it all together in an order that makes sense,
			// if using a layout we only wrap the html and nothing else
			node.children = [
				..._module,
				{ type: 'raw', value: _module[0] ? '\n' : '' },
				...instance,
				{ type: 'raw', value: instance[0] ? '\n' : '' },
				...css,
				{ type: 'raw', value: css[0] ? '\n' : '' },
				...special,
				{ type: 'raw', value: special[0] ? '\n' : '' },
				{
					type: 'raw',
					value: _layout
						? `<Layout_MDSVEX_DEFAULT${fm ? ' {...metadata}' : ''}>`
						: '',
				},
				{ type: 'raw', value: '\n' },
				...html,
				{ type: 'raw', value: '\n' },
				{ type: 'raw', value: _layout ? '</Layout_MDSVEX_DEFAULT>' : '' },
			];
		});
	}
}

// highlighting stuff

// { [lang]: { path, deps: pointer to key } }
const langs = {};
let Prism;

const make_path = (base_path, id) => base_path.replace('{id}', id);

// we need to get all language metadata
// also track if they depend on other languages so we can autoload without breaking
// i don't actually know what the require key means but it sounds important

function get_lang_info(name, lang_meta, base_path) {
	const _lang_meta = {
		name,
		path: `prismjs/${make_path(base_path, name)}`,
		deps: new Set(),
	};

	const aliases = new Set();

	// todo: DRY this up

	if (lang_meta.require) {
		if (Array.isArray(lang_meta.require)) {
			lang_meta.require.forEach(id => _lang_meta.deps.add(id));
		} else {
			_lang_meta.deps.add(lang_meta.require);
		}
	}

	if (lang_meta.peerDependencies) {
		if (Array.isArray(lang_meta.peerDependencies)) {
			lang_meta.peerDependencies.forEach(id => _lang_meta.deps.add(id));
		} else {
			_lang_meta.deps.add(lang_meta.peerDependencies);
		}
	}

	if (lang_meta.alias) {
		if (Array.isArray(lang_meta.alias)) {
			lang_meta.alias.forEach(id => aliases.add(id));
		} else {
			aliases.add(lang_meta.alias);
		}
	}

	return [{ ..._lang_meta, aliases }, aliases];
}

function load_language_metadata() {
	const { meta, ...languages } = require('prismjs/components.json').languages;

	for (const lang in languages) {
		const [lang_info, aliases] = get_lang_info(
			lang,
			languages[lang],
			meta.path
		);

		langs[lang] = lang_info;
		aliases.forEach(_n => {
			langs[_n] = langs[lang];
		});
	}
}

function load_language(lang) {
	if (!langs[lang]) return;

	langs[lang].deps.forEach(name => load_language(name));

	require(langs[lang].path);
}

export function highlight_blocks({ highlighter: highlight_fn }) {
	if (!highlight_fn) return;

	load_language_metadata();

	return function(tree, vFile) {
		visit(tree, 'code', node => {
			node.type = 'html';
			node.value = highlight_fn(node.value, node.lang, vFile.messages);
		});
	};
}

const escape_curlies = str =>
	str.replace(/[{}]/g, c => ({ '{': '&#123;', '}': '&#125;' }[c]));

export function code_highlight(code, lang) {
	const _lang = langs[lang] || false;

	if (!Prism) Prism = require('prismjs');
	if (!Prism.languages[_lang.name]) {
		load_language(_lang.name);
	}

	return `<pre class="language-${lang}">
  <code class="language-${lang || ''}">
${
	_lang
		? escape_curlies(
			Prism.highlight(code, Prism.languages[_lang.name], _lang.name)
		  )
		: escape_curlies(escape(code))
}
  </code>
</pre>`;
}
