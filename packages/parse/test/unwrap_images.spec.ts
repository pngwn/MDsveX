import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { PFMParser, WireEmitter, parse_markdown_svelte } from '../src/main';
import type { SyntaxOptions } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import { expect_linked, shape } from './plugin_harness';
import { print_ast } from './print';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(THIS_DIR, 'fixtures', 'unwrap_images');
const SNAPSHOT_DIR = resolve(THIS_DIR, 'snapshots', 'unwrap_images');

const ON: SyntaxOptions = { unwrap_images: true };

function ast(input: string, options?: SyntaxOptions): string {
	return print_ast(parse_markdown_svelte(input, options).nodes, input);
}

function fed(input: string, size: number, options?: SyntaxOptions): string {
	const tree = new TreeBuilder(input.length || 16);
	const parser = new PFMParser(tree, 2, options);
	parser.init();
	for (let i = 0; i < input.length; i += size) {
		parser.feed(input.slice(i, i + size));
	}
	parser.finish();
	const nodes = tree.get_buffer();
	expect_linked(nodes);
	return print_ast(nodes, input);
}

/** the tree the wire builder makes, size 0 is one parse call */
function wire(input: string, size: number, options?: SyntaxOptions): unknown {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter, 2, options);
	const builder = new WireTreeBuilder(128);
	if (size === 0) {
		emitter.set_source(input);
		parser.parse(input);
	} else {
		parser.init();
		for (let i = 0; i < input.length; i += size) {
			emitter.set_source(input.slice(0, i + size));
			parser.feed(input.slice(i, i + size));
			builder.apply(emitter.flush());
		}
		emitter.set_source(input);
		parser.finish();
	}
	builder.apply(emitter.flush());
	const nodes = builder.get_buffer();
	expect_linked(nodes);
	return shape(nodes, null, 0, { merge_text: true, attrs: ATTRS });
}

const ATTRS = ['src', 'href', 'title', 'tag', 'checked', 'tight'];

function batch_shape(input: string, options?: SyntaxOptions): unknown {
	const { nodes } = parse_markdown_svelte(input, options);
	return shape(nodes, input, 0, { merge_text: true, attrs: ATTRS });
}

/** the kinds of the children of the root with the option on, line breaks left out */
function top(input: string): string[] {
	return top_with(input, ON);
}

function top_with(input: string, options?: SyntaxOptions): string[] {
	const { nodes } = parse_markdown_svelte(input, options);
	return nodes
		.get_node(0)
		.children.map((c) => nodes.get_node(c).kind as string)
		.filter((k) => k !== 'line_break');
}

const fixtures = readdirSync(FIXTURE_DIR)
	.filter((f) => f.endsWith('.md'))
	.sort();

describe('unwrap_images fixtures', () => {
	for (const file of fixtures) {
		const name = basename(file, '.md');
		const input = readFileSync(join(FIXTURE_DIR, file), 'utf8');

		describe(name, () => {
			test('on', async () => {
				const out = ast(input, ON);
				await expect(out).toMatchFileSnapshot(
					join(SNAPSHOT_DIR, `${name}.snap.ast`),
					`Input: \n${input}\n\n${out}`
				);
			});

			test('off is the parse without options', () => {
				const plain = ast(input);
				expect(ast(input, { unwrap_images: false })).toBe(plain);
				expect(ast(input, {})).toBe(plain);
			});

			for (const options of [ON, undefined]) {
				const mode = options === undefined ? 'off' : 'on';
				for (const size of [1, 2, 3]) {
					test(`${mode}, fed ${size} matches batch`, () => {
						expect(fed(input, size, options)).toBe(ast(input, options));
					});
				}
				for (const size of [0, 1, 2, 3]) {
					test(`${mode}, wire${size === 0 ? '' : ` fed ${size}`} matches batch`, () => {
						expect(wire(input, size, options)).toEqual(
							batch_shape(input, options)
						);
					});
				}
			}
		});
	}
});

describe('unwrap_images', () => {
	test('a paragraph of one image has no paragraph node', () => {
		expect(top('![a](/a.png)\n')).toEqual(['image']);
		expect(top('![a](/a.png)')).toEqual(['image']);
		expect(top_with('![a](/a.png)\n')).toEqual(['paragraph']);
		expect(top_with('![a](/a.png)\n', { unwrap_images: false })).toEqual([
			'paragraph',
		]);
	});

	test('images apart by spaces or soft breaks all lose the paragraph', () => {
		expect(top('![a](/a.png) ![b](/b.png)\n')).toEqual([
			'image',
			'text',
			'image',
		]);
		expect(top('![a](/a.png)\n![b](/b.png)\n')).toEqual([
			'image',
			'soft_break',
			'image',
		]);
	});

	test('a link that holds only images counts as its images', () => {
		expect(top('[![a](/a.png)](/b)\n')).toEqual(['link']);
		expect(top('[![a](/a.png) ![b](/b.png)](/c)\n')).toEqual(['link']);
		expect(top('[![a](/a.png)](/b)\n[![c](/c.png)](/d)\n')).toEqual([
			'link',
			'soft_break',
			'link',
		]);
	});

	test('any text keeps the paragraph', () => {
		for (const input of [
			'![a](/a.png) text\n',
			'text ![a](/a.png)\n',
			'![a](/a.png)\ntext\n',
			'![a](/a.png) [text](/b)\n',
			'[![a](/a.png) text](/b)\n',
			'[text ![a](/a.png)](/b)\n',
			'![a](/a.png) *![b](/b.png)*\n',
			'![a](/a.png)\\\n![b](/b.png)\n',
			'![a](/a.png) `x`\n',
			'![a](/a.png) {x}\n',
		]) {
			expect(top(input), input).toEqual(['paragraph']);
		}
	});

	test('a link that never closes leaves its bracket as text', () => {
		expect(top('[![a](/a.png)\n')).toEqual(['paragraph']);
		expect(top('[![a](/a.png)] ![b](/b.png)\n')).toEqual(['paragraph']);
		expect(top('[![a](/a.png) [![b](/b.png)](/c)\n')).toEqual(['paragraph']);
	});

	test('what only looks like an image keeps the paragraph', () => {
		for (const input of ['!text\n', '![a\n', '![a](/a.png\n', '![a]\n', '!']) {
			expect(top(input), input).toEqual(['paragraph']);
		}
	});

	test('an image counts as a tag does in a paragraph of tags', () => {
		expect(top('![a](/a.png) <Badge />\n')).toEqual(['image', 'text', 'html']);
		expect(top('<Badge /> ![a](/a.png)\n')).toEqual(['html', 'text', 'image']);
		expect(top_with('<Badge /> ![a](/a.png)\n')).toEqual(['paragraph']);
		expect(top('<Badge /> ![a](/a.png) text\n')).toEqual(['paragraph']);
	});

	test('the image is a child of the container that held the paragraph', () => {
		expect(batch_shape('> ![a](/a.png)\n', ON)).toEqual([
			'root',
			['block_quote', ['image src="/a.png"', 'text:a']],
		]);
		expect(batch_shape(':::note[]\n![a](/a.png)\n:::\n', ON)).toEqual([
			'root',
			['directive_container', ['image src="/a.png"', 'text:a']],
		]);
		expect(batch_shape('<div>\n\n![a](/a.png)\n\n</div>\n', ON)).toEqual([
			'root',
			['html tag="div"', ['image src="/a.png"', 'text:a']],
		]);
	});

	test('a loose list item of only an image has no paragraph', () => {
		expect(batch_shape('- ![a](/a.png)\n\n- text\n', ON)).toEqual([
			'root',
			[
				'list tight=false',
				['list_item', ['image src="/a.png"', 'text:a']],
				['list_item', ['paragraph', 'text:text']],
			],
		]);
		expect(batch_shape('- ![a](/a.png)\n\n- text\n')).toEqual([
			'root',
			[
				'list tight=false',
				['list_item', ['paragraph', ['image src="/a.png"', 'text:a']]],
				['list_item', ['paragraph', 'text:text']],
			],
		]);
	});

	test('a loose list item with an image and text keeps its paragraph', () => {
		expect(batch_shape('- ![a](/a.png) text\n\n- b\n', ON)).toEqual([
			'root',
			[
				'list tight=false',
				[
					'list_item',
					['paragraph', ['image src="/a.png"', 'text:a'], 'text: text'],
				],
				['list_item', ['paragraph', 'text:b']],
			],
		]);
	});

	test('a tight list is the same with the option on or off', () => {
		const input = '- ![a](/a.png)\n- ![b](/b.png) text\n- [x] ![c](/c.png)\n';
		expect(ast(input, ON)).toBe(ast(input));
	});

	test('a parser kept across documents follows a changed option', () => {
		const input = '![a](/a.png)\n';
		const run = (parser: PFMParser, tree: TreeBuilder) => {
			tree.reset();
			parser.parse(input);
			const nodes = tree.get_buffer();
			return nodes.get_node(nodes.get_node(0).children[0]).kind;
		};
		const tree = new TreeBuilder(16);
		const parser = new PFMParser(tree);
		expect(run(parser, tree)).toBe('paragraph');
		parser.set_options(ON);
		expect(run(parser, tree)).toBe('image');
		parser.set_options({});
		expect(run(parser, tree)).toBe('paragraph');
		parser.set_options(ON);
		expect(run(parser, tree)).toBe('image');
		parser.set_options();
		expect(run(parser, tree)).toBe('paragraph');
	});

	test('parse_markdown_svelte reads the option on every call', () => {
		const input = '![a](/a.png)\n';
		expect(top_with(input, ON)).toEqual(['image']);
		expect(top_with(input)).toEqual(['paragraph']);
		expect(top_with(input, ON)).toEqual(['image']);
	});
});
