import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { PFMParser, parse_markdown_svelte } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import type { NodeBuffer } from '../src/utils';

const NONE = 0xffffffff;
const FIXTURE_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'fixtures'
);

function fixtures(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) fixtures(path, out);
		else if (/\.(md|svx|svelte)$/.test(name)) out.push(path);
	}
	return out;
}

/**
 * what a printer that slices the source with node offsets relies on, one
 * line per node that breaks it
 */
function span_problems(nodes: NodeBuffer, source: string): string[] {
	const out: string[] = [];
	const root = nodes.get_node(0);
	if (root.start !== 0 || root.end !== source.length) {
		out.push(`root [${root.start},${root.end}] for length ${source.length}`);
	}
	const walk = (index: number): void => {
		const node = nodes.get_node(index);
		const { start, end } = node;
		const [vs, ve] = node.value;
		const at = `${node.kind} [${start},${end}] value=[${vs},${ve}]`;
		const meta = node.metadata;
		if (node.kind === 'html') {
			const tag = meta.tag as string;
			if (meta.self_closing) {
				if (vs !== end || ve !== end) out.push(`${at}: a leaf holds nothing`);
			} else if (!(start < vs && vs <= ve && ve <= end)) {
				out.push(`${at}: value is not between the tags`);
			} else {
				const open = source.slice(start, vs);
				if (!open.startsWith(`<${tag}`) || !open.endsWith('>')) {
					out.push(`${at}: open tag ${JSON.stringify(open)}`);
				}
				// an element closed by the end of an outer one has no close tag
				const close = source.slice(ve, end);
				if (close !== '' && !/^<\/[^>]+>$/.test(close)) {
					out.push(`${at}: close tag ${JSON.stringify(close)}`);
				}
			}
		} else if (node.kind === 'link' || node.kind === 'image') {
			const lead = node.kind === 'image' ? '![' : '[';
			const opener = source.slice(start, vs);
			// an autolink has no brackets, its value is the url between them
			if (opener !== lead && !(node.kind === 'link' && opener === '<')) {
				out.push(`${at}: opens with ${JSON.stringify(opener)}`);
			}
		} else if (node.kind === 'definition') {
			const label = meta.label as string;
			if (source.slice(vs, ve) !== label) out.push(`${at}: value is no label`);
			const text = source.slice(start, end);
			if (!text.startsWith(`[${label}]:`)) {
				out.push(`${at}: ${JSON.stringify(text)}`);
			}
			if (/\s$/.test(text)) out.push(`${at}: ends with a space`);
		}
		for (const child of node.children) walk(child);
	};
	walk(0);
	return out;
}

function fed(source: string, size: number): NodeBuffer {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < source.length; i += size) {
		parser.feed(source.slice(i, i + size));
	}
	parser.finish();
	return tree.get_buffer();
}

function spans(nodes: NodeBuffer, index = 0, out: string[] = []): string[] {
	const node = nodes.get_node(index);
	out.push(`${node.kind} [${node.start},${node.end}] [${node.value}]`);
	for (const child of node.children) spans(nodes, child, out);
	return out;
}

const DOCS = [
	'[ref]: https://x.com "T"\n\nsee [a][ref]',
	'[a]:\n  /u\n  "t\nu"  \n\n[x][a]\n',
	'[a]: /u\\\n"t"\n> [b]: /v\\\n',
	'> [q]: /q\n> after\n',
	'- [l]: /l\n\n  item\n',
	'<div class="a"\n  id={b}>text</div>\n',
	'<p><b>x</p>\n\n<section>\n\n# h\n\n</section>\n',
	'a <img src=a /> <br> <span>x <em>y</em></span>\n',
	'[a](/u) ![b](/i) [![c](/i)](/l) <https://x.y>\n',
	'',
	'no newline',
];

describe('source spans', () => {
	test('every fixture keeps the spans a printer slices with', () => {
		const out: string[] = [];
		for (const path of fixtures(FIXTURE_DIR)) {
			const source = readFileSync(path, 'utf8');
			const found = span_problems(parse_markdown_svelte(source).nodes, source);
			const name = relative(FIXTURE_DIR, path);
			for (const line of found) out.push(`${name}: ${line}`);
		}
		expect(out).toEqual([]);
	});

	test('a definition is a node from its bracket to its destination or title', () => {
		const source = '[ref]: https://x.com "T"  \n\nsee [a][ref]';
		const { nodes } = parse_markdown_svelte(source);
		const def = nodes.get_node(nodes.get_node(0).children[0]);
		expect(def.kind).toBe('definition');
		expect(source.slice(def.start, def.end)).toBe('[ref]: https://x.com "T"');
		expect(source.slice(def.value[0], def.value[1])).toBe('ref');
		expect(def.metadata).toEqual({
			label: 'ref',
			href: 'https://x.com',
			title: 'T',
		});
		expect(def.children).toEqual([]);
	});

	test('an element records where its open tag ends and its close tag starts', () => {
		const source = '<div class="a"\n  id={b}>text</div>\n';
		const { nodes } = parse_markdown_svelte(source);
		const html = nodes.get_node(nodes.get_node(0).children[0]);
		expect(source.slice(html.start, html.value[0])).toBe(
			'<div class="a"\n  id={b}>'
		);
		expect(source.slice(html.value[0], html.value[1])).toBe('text');
		expect(source.slice(html.value[1], html.end)).toBe('</div>');
	});

	test('the root spans the whole source', () => {
		for (const source of ['', 'a', 'a\n', '# h\n\n- b\n']) {
			const root = parse_markdown_svelte(source).nodes.get_node(0);
			expect([root.start, root.end]).toEqual([0, source.length]);
		}
	});

	for (const source of DOCS) {
		test(`fed in pieces ${JSON.stringify(source)}`, () => {
			const whole = spans(parse_markdown_svelte(source).nodes);
			expect(span_problems(fed(source, 1), source)).toEqual([]);
			for (const size of [1, 2, 3, 7]) {
				expect(spans(fed(source, size)), `size ${size}`).toEqual(whole);
			}
		});
	}
});
