import * as acorn from 'acorn';
import { tsPlugin } from '@sveltejs/acorn-typescript';
import yaml from 'js-yaml';
import postcss from 'postcss';
import type { ChildNode, Root } from 'postcss';

import { parse } from '../src/ast';
import type { SvxNode } from '../src/ast';

const TS = acorn.Parser.extend(tsPlugin() as never);
const JS_OPTIONS = {
	ecmaVersion: 'latest',
	sourceType: 'module',
	locations: true,
} as const;

// offsets into the source, which formatting moves
const OFFSET_META = new Set(['info_start', 'info_end']);

/**
 * the tree as lines of text without offsets, two documents whose shapes match
 * mean the same: code compares by its syntax tree, yaml by its value and css
 * by its rules, and the spaces that end a line are left out as they mean nothing
 */
export function shape(source: string): string {
	const lines: string[] = [];
	const walk = (node: SvxNode, depth: number) => {
		let line = '  '.repeat(depth) + node.type;
		if (node.meta) {
			const meta = Object.entries(node.meta)
				.filter(([k]) => !OFFSET_META.has(k))
				.map(([k, v]) => [k, k === 'attributes' ? attributes(v) : v]);
			if (meta.length > 0)
				line += ' ' + JSON.stringify(Object.fromEntries(meta));
		}
		const own = meaning(node, source);
		if (own !== undefined) line += ' ' + own;
		lines.push(line);
		if (own !== undefined && node.type !== 'svelte_branch') return;

		const children = node.children;
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (child.type !== 'text') {
				walk(child, depth + 1);
				continue;
			}
			// texts split and merge as offsets move
			let value = '';
			while (i < children.length && children[i].type === 'text') {
				value +=
					children[i].content ??
					source.slice(children[i].value_start, children[i].value_end);
				i++;
			}
			i--;
			// the text of a revoked tag holds its line ends
			value = value.replace(/[ \t]+\n/g, '\n');
			const next = children[i + 1]?.type;
			if (
				next === undefined ||
				next === 'soft_break' ||
				next === 'line_break'
			) {
				value = value.replace(/[ \t]+$/, '');
			}
			if (value === '') continue;
			lines.push('  '.repeat(depth + 1) + 'text ' + JSON.stringify(value));
		}
	};
	walk(parse(source), 0);
	return lines.join('\n');
}

/** what a node holds that is not its children, undefined when that is all it is */
function meaning(node: SvxNode, source: string): string | undefined {
	const value = () => source.slice(node.value_start, node.value_end);
	switch (node.type) {
		case 'frontmatter':
			return yaml_shape(value());
		case 'import_statement':
			return program(source.slice(node.start, node.end));
		case 'mustache':
			return expression(value());
		case 'svelte_tag':
			if (node.meta?.tag === 'const') return program(`const ${value()};`);
			return node.meta?.tag === 'html' || node.meta?.tag === 'render'
				? expression(value())
				: raw(source.slice(node.start, node.end));
		case 'svelte_branch':
			return node.meta?.tag === 'if' ||
				node.meta?.tag === 'else if' ||
				node.meta?.tag === 'key'
				? expression(value())
				: head(value());
		case 'html': {
			const tag = node.meta?.tag;
			if (tag === 'script') return program(value());
			if (tag === 'style') return css(value());
			if (tag === 'pre' || tag === 'textarea')
				return raw(source.slice(node.start, node.end));
			return undefined;
		}
		case 'code_fence': {
			const { info_start, info_end } = node.meta as {
				info_start?: number;
				info_end?: number;
			};
			const info =
				info_start === undefined ? '' : source.slice(info_start, info_end);
			// the code as a renderer sees it, a fence in a container holds it as a string
			return 'fence ' + JSON.stringify([info.trim(), node.content ?? value()]);
		}
		case 'code_span':
			return 'code ' + JSON.stringify(node.content ?? value());
		case 'html_comment':
		case 'raw':
			return raw(source.slice(node.start, node.end));
	}
	return undefined;
}

/** attribute expressions by their syntax tree, a value that mixes text and braces without its spaces */
function attributes(value: unknown): unknown {
	if (value === null || typeof value !== 'object') return value;
	const out: Record<string, unknown> = {};
	for (const [name, v] of Object.entries(value)) {
		const key = name.replace(/\s+/g, '');
		if (typeof v === 'object' && v !== null && 'value' in v) {
			out[key] = expression(String((v as { value: unknown }).value));
		} else if (typeof v === 'string' && v.includes('{')) {
			out[key] = head(v);
		} else {
			out[key] = v;
		}
	}
	return out;
}

/** the head of an each, await or snippet, its spacing and the quotes of its strings left out */
function head(text: string): string {
	return (
		'head ' +
		JSON.stringify(text.replace(/\s+/g, '').replace(/'([^'"]*)'/g, '"$1"'))
	);
}

function raw(text: string): string {
	return JSON.stringify(text.replace(/[ \t]+$/, ''));
}

function strip(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(strip);
	if (value === null || typeof value !== 'object') return value;
	const out: Record<string, unknown> = {};
	for (const [key, v] of Object.entries(value)) {
		if (
			key === 'start' ||
			key === 'end' ||
			key === 'loc' ||
			key === 'range' ||
			key === 'raw'
		) {
			continue;
		}
		out[key] = strip(v);
	}
	return out;
}

function program(code: string): string {
	try {
		return 'js ' + JSON.stringify(strip(TS.parse(code, JS_OPTIONS)));
	} catch {
		return raw(code);
	}
}

function expression(code: string): string {
	try {
		const node = TS.parseExpressionAt(code, 0, JS_OPTIONS);
		if (code.slice(node.end).trim() !== '') return raw(code);
		return 'js ' + JSON.stringify(strip(node));
	} catch {
		return raw(code);
	}
}

function yaml_shape(text: string): string {
	try {
		return 'yaml ' + JSON.stringify(yaml.load(text));
	} catch {
		return raw(text);
	}
}

function css(text: string): string {
	let root: Root;
	try {
		root = postcss.parse(text);
	} catch {
		return raw(text);
	}
	// prettier picks the quotes of a string
	const squash = (s: string | undefined) =>
		s
			?.replace(/\s+/g, ' ')
			.replace(/\s*([,>+~():])\s*/g, '$1')
			.replace(/'([^'"]*)'/g, '"$1"')
			.trim();
	const rule = (node: ChildNode): unknown => {
		switch (node.type) {
			case 'rule':
				return { selector: squash(node.selector), nodes: node.nodes.map(rule) };
			case 'atrule':
				return {
					at: node.name,
					params: squash(node.params),
					nodes: node.nodes?.map(rule),
				};
			case 'decl':
				return {
					prop: node.prop,
					value: squash(node.value),
					important: node.important,
				};
			case 'comment':
				return { comment: node.text };
		}
	};
	return 'css ' + JSON.stringify(root.nodes.map(rule));
}
