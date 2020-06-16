import retext from 'retext';
import smartypants from 'retext-smartypants';
import visit from 'unist-util-visit';
import yaml from 'js-yaml';
import { parse } from 'svelte/compiler';
import escape from 'escape-html';

// this needs a big old cleanup

const newline = '\n';
// extract the yaml from 'yaml' nodes and put them in the vfil for later use

export function default_frontmatter(value, messages) {
	try {
		return yaml.safeLoad(value);
	} catch (e) {
		messages.push(['YAML failed to parse', e]);
	}
}

export function parse_frontmatter({ parse, type }) {
	return transformer;

	function transformer(tree, vFile) {
		visit(tree, type, node => {
			const data = parse(node.value, vFile.messages);
			if (data) {
				vFile.data.fm = data;
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

function map_layout_to_path(filename, layout_map) {
	const match = Object.keys(layout_map).find(l =>
		new RegExp(`\\/${l}\\/`).test(filename.replace(process.cwd(), ''))
	);

	if (match) {
		return layout_map[match];
	} else {
		return layout_map['_'] ? layout_map['_'] : undefined;
	}
}

function extract_parts(nodes) {
	// since we are wrapping and replacing we need to keep track of the different component 'parts'
	// many special tags cannot be wrapped nor can style or script tags
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

	children: for (let i = 0; i < nodes.length; i += 1) {
		const empty_node =
			nodes[i].type === 'text' && RE_BLANK.exec(nodes[i].value);

		// i no longer knwo why i did this

		if (empty_node || !nodes[i].value) {
			if (
				!parts.html.length ||
				!(
					RE_BLANK.exec(nodes[i].value) &&
					RE_BLANK.exec(parts.html[parts.html.length - 1].value)
				)
			) {
				parts.html.push(nodes[i]);
			}

			continue children;
		}

		let result;
		try {
			result = parse(nodes[i].value);
		} catch (e) {
			parts.html.push(nodes[i]);
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

		results: for (const key in result) {
			if (key === 'html' || !result[key]) continue results;
			_parts.push([key, result[key].start, result[key].end]);
		}

		// sort them to ensure the array is in the order they appear in the source, no gaps
		// this might not be necessary any more, i forget
		const sorted = _parts.sort((a, b) => a[1] - b[1]);

		// push the nodes into the correct 'part' since they are sorted everything should be in the correct order
		sorted.forEach(next => {
			parts[next[0]].push({
				type: 'raw',
				value: nodes[i].value.substring(next[1], next[2]),
			});
		});
	}

	return parts;
}

export function transform_hast({ layout }) {
	return transformer;

	function transformer(tree, vFile) {
		// we need to keep { and } intact for svelte, so reverse the escaping in links and images
		// if anyone actually uses these characters for any other reason i'll probably just cry
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
		// this  breaks position data
		// svelte preprocessors don't currently support sourcemaps
		// i'll fix this when they do

		if (!layout && !vFile.data.fm) return;

		visit(tree, 'root', node => {
			const { special, html, instance, module: _module, css } = extract_parts(
				node.children
			);

			const fm =
				vFile.data.fm &&
				`export const metadata = ${JSON.stringify(vFile.data.fm)};${newline}` +
					`\tconst { ${Object.keys(vFile.data.fm).join(', ')} } = metadata;`;

			const _fm_layout = vFile.data.fm && vFile.data.fm.layout;

			let _layout;

			// passing false in fm forces no layout
			if (_fm_layout === false) _layout = false;
			// no frontmatter layout provided
			else if (_fm_layout === undefined) {
				// both layouts undefined

				if (layout === undefined) {
					_layout = false;

					// a single layout was passed to options, so always use it
				} else if (layout.__mdsvex_default) {
					_layout = layout.__mdsvex_default;

					// multiple layouts were passed to options, so map folder to layout
				} else if (typeof layout === 'object' && layout !== null) {
					_layout = map_layout_to_path(vFile.filename, layout);

					if (_layout === undefined)
						vFile.messages.push([
							`Could not find a matching layout for ${vFile.filename}.`,
						]);
				}

				// front matter layout is a string
			} else if (typeof _fm_layout === 'string') {
				// options layout is a string, so this doesn't make sense: recover but warn
				if (layout.__mdsvex_default) {
					_layout = false;

					vFile.messages.push([
						`You attempted to apply a named layout in the front-matter of ${vFile.filename}, but did not provide any named layouts as options to the preprocessor. `,
					]);

					// options layout is an object so do a simple lookup
				} else if (typeof layout === 'object' && layout !== null) {
					_layout = layout[_fm_layout] || layout['*'];

					if (_layout === undefined)
						vFile.messages.push([
							`Could not find a layout with the name ${_fm_layout} and no fall back ('*') was provided.`,
						]);
				}
			}

			if (_layout && _layout.components && _layout.components.length) {
				for (let i = 0; i < _layout.components.length; i++) {
					visit(tree, 'element', node => {
						if (node.tagName === _layout.components[i]) {
							node.tagName = `Components.${_layout.components[i]}`;
						}
					});
				}
			}

			const layout_import =
				_layout &&
				`import Layout_MDSVEX_DEFAULT${
					_layout.components ? `, * as Components` : ''
				} from '${_layout.path}';`;

			// add the layout if we are using one, reusing the existing script if one exists
			if (_layout && !instance[0]) {
				instance.push({
					type: 'raw',
					value: `${newline}<script>${newline}\t${layout_import}${newline}</script>${newline}`,
				});
			} else if (_layout) {
				instance[0].value = instance[0].value.replace(
					RE_SCRIPT,
					`$1${newline}\t${layout_import}`
				);
			}

			// inject the frontmatter into the module script if there is any, reusing the existing module script if one exists
			if (!_module[0] && fm) {
				_module.push({
					type: 'raw',
					value: `<script context="module">${newline}\t${fm}${newline}</script>`,
				});
			} else if (fm) {
				_module[0].value = _module[0].value.replace(
					RE_MODULE_SCRIPT,
					`$1${newline}\t${fm}`
				);
			}

			// smoosh it all together in an order that makes sense,
			// if using a layout we only wrap the html and nothing else
			node.children = [
				..._module,
				{ type: 'raw', value: _module[0] ? newline : '' },
				...instance,
				{ type: 'raw', value: instance[0] ? newline : '' },
				...css,
				{ type: 'raw', value: css[0] ? newline : '' },
				...special,
				{ type: 'raw', value: special[0] ? newline : '' },
				{
					type: 'raw',
					value: _layout
						? `<Layout_MDSVEX_DEFAULT${fm ? ' {...metadata}' : ''}>`
						: '',
				},
				{ type: 'raw', value: newline },
				...html,
				{ type: 'raw', value: newline },
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

	// todo: DRY this up, it is literally identical

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
	if (!process.browser) {
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
}

function load_language(lang) {
	if (!process.browser) {
		if (!langs[lang]) return;

		langs[lang].deps.forEach(name => load_language(name));

		require(langs[lang].path);
	}
}

export function highlight_blocks({ highlighter: highlight_fn, alias } = {}) {
	if (!highlight_fn || process.browser) return;

	load_language_metadata();

	if (alias) {
		for (const lang in alias) {
			langs[lang] = langs[alias[lang]];
		}
	}

	return function(tree, vFile) {
		visit(tree, 'code', node => {
			node.type = 'html';
			node.value = highlight_fn(node.value, node.lang, vFile.messages);
		});
	};
}
// escape curlies, backtick, \t, \r, \n to avoid breaking output of {@html `here`} in .svelte
const escape_svelty = str =>
	str.replace(
		/[{}`]/g,
		c => ({ '{': '&#123;', '}': '&#125;', '`': '&#96;' }[c])
	).replace(/\\([trn])/g,'&#92;$1');

export function code_highlight(code, lang) {
	if (!process.browser) {
		let _lang = langs[lang] || false;

		if (!Prism) Prism = require('prismjs');

		if (_lang && !Prism.languages[_lang.name]) {
			load_language(_lang.name);
		}

		if (!_lang && Prism.languages[lang]) {
			langs[lang] = { name: lang };
			_lang = langs[lang];
		}

		return `<pre class="language-${lang}">{@html \`
<code class="language-${lang || ''}">${escape_svelty(
	_lang
		? Prism.highlight(code, Prism.languages[_lang.name], _lang.name)
		: escape(code)
)}</code>\`}
</pre>`;
	} else {
		return `<pre class="language-${lang}">{@html \`
<code class="language-${lang || ''}">
${escape_svelty(escape(code))}</code>\`}
</pre>`;
	}
}
