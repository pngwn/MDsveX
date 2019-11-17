import retext from 'retext';
import smartypants from 'retext-smartypants';
import visit from 'unist-util-visit';
import yaml from 'js-yaml';
import { parse } from 'svelte/compiler';

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

export function smartypants_transformer(options = {}) {
	const processor = retext().use(smartypants, options);

	function transformer(tree) {
		visit(tree, 'text', node => {
			node.value = String(processor.processSync(node.value));
		});
	}
	return transformer;
}

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

		if (!layout && !vFile.data.fm) return;
		// breaks positioning

		visit(tree, 'root', node => {
			// don't even ask

			const parts = {
				special: [],
				html: [],
				instance: [],
				module: [],
				css: [],
			};

			children: for (let i = 0; i < node.children.length; i += 1) {
				if (
					(node.children[i].type !== 'raw' &&
						(node.children[i].type === 'text' &&
							RE_BLANK.exec(node.children[i].value))) ||
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

				if (result.module) {
					_parts.push(['module', result.module.start, result.module.end]);
				}

				if (result.css) {
					_parts.push(['css', result.css.start, result.css.end]);
				}

				if (result.instance) {
					_parts.push(['instance', result.instance.start, result.instance.end]);
				}

				const sorted = _parts.sort((a, b) => a[1] - b[1]);

				sorted.forEach(next => {
					if (!parts[next[0]]) parts.html.push(next);

					parts[next[0]].push({
						type: 'raw',
						value: node.children[i].value.substring(next[1], next[2]),
					});
				});
			}

			const { special, html, instance, module: _module, css } = parts;

			const layout_import =
				layout && `import Layout_MDSVEX_DEFAULT from '${layout}';`;

			const fm =
				vFile.data.fm &&
				`export const metadata = ${JSON.stringify(vFile.data.fm)};`;

			const fm_key =
				fm &&
				Object.keys(vFile.data.fm)
					.map(k => `{${k}}`)
					.join(' ');

			if (layout && !instance[0]) {
				instance.push({
					type: 'raw',
					value: `\n<script>\n\t${layout_import}\n</script>\n`,
				});
			} else if (layout) {
				instance[0].value = instance[0].value.replace(
					RE_SCRIPT,
					`$1\n\t${layout_import}`
				);
			}

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
					value: layout
						? `<Layout_MDSVEX_DEFAULT${fm ? ` ${fm_key}` : ''}>`
						: '',
				},
				{ type: 'raw', value: '\n' },
				...html,
				{ type: 'raw', value: '\n' },
				{ type: 'raw', value: layout ? '</Layout_MDSVEX_DEFAULT>' : '' },
			];
		});
	}
}
