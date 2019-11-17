import retext from 'retext';
import smartypants from 'retext-smartypants';
import visit from 'unist-util-visit';
import yaml from 'js-yaml';
import * as svelte from 'svelte/compiler';
const { parse } = svelte;

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

export function escape_code() {
	function transformer(tree) {
		visit(tree, 'code', node => {
			for (let i = 0; i < entites.length; i += 1) {
				node.value = node.value.replace(entites[i][0], entites[i][1]);
			}
		});
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

				const result = parse(node.children[i].value);

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

			// add the layout if w are using one, resuing the existing script if one exists
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
