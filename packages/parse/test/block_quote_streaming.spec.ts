import { describe, expect, test } from 'vitest';

import { PFMParser, WireEmitter } from '../src/main';
import { SourceTextSource, WireTextSource } from '../src/node_view';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type { ParsePlugin } from '../src/plugin_types';
import { TreeBuilder } from '../src/tree_builder';
import type { NodeBuffer } from '../src/utils';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import { expect_linked, shape } from './plugin_harness';

const MERGE = { merge_text: true };

/** a handled heading takes the plugin path of both builders */
const heading_plugin = (): ParsePlugin[] => [
	{
		heading: {
			parse(node) {
				node.attrs.id = 'h';
			},
		},
	},
];

/** the wire tree after each char, keyed by what was fed */
function wire_steps(
	source: string,
	plugins?: ParsePlugin[]
): Map<string, unknown> {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const builder = new WireTreeBuilder(
		128,
		plugins && new PluginDispatcher(plugins, new WireTextSource([]))
	);
	const steps = new Map<string, unknown>();
	parser.init();
	for (let i = 0; i < source.length; i++) {
		const fed = source.slice(0, i + 1);
		emitter.set_source(fed);
		parser.feed(source[i]);
		builder.apply(emitter.flush());
		expect_linked(builder.get_buffer());
		steps.set(fed, shape(builder.get_buffer(), null, 0, MERGE));
	}
	return steps;
}

/** the batch tree after each char, an open text node has no end so only kinds are read */
function batch_steps(
	source: string,
	plugins?: ParsePlugin[]
): Map<string, unknown> {
	const tree = new TreeBuilder(
		source.length,
		plugins && new PluginDispatcher(plugins, new SourceTextSource(source))
	);
	const parser = new PFMParser(tree);
	const steps = new Map<string, unknown>();
	parser.init();
	for (let i = 0; i < source.length; i++) {
		const fed = source.slice(0, i + 1);
		parser.feed(source[i]);
		expect_linked(tree.get_buffer());
		steps.set(fed, kinds(shape(tree.get_buffer(), fed, 0, MERGE)));
	}
	return steps;
}

/** a shape without its text content */
function kinds(tree: unknown): unknown {
	if (typeof tree === 'string') {
		return tree.startsWith('text:') ? 'text' : tree;
	}
	return (tree as unknown[]).map(kinds);
}

/** document, then the tree expected once each prefix is fed */
type Case = [
	name: string,
	source: string,
	steps: [fed: string, tree: unknown][],
];

/** a root holding one quote, shape prints a childless node as its kind */
const quote = (...kids: unknown[]) => [
	'root',
	kids.length === 0 ? 'block_quote' : ['block_quote', ...kids],
];

const cases: Case[] = [
	[
		'a paragraph after a heading',
		'> # Foo\n> bar\n> baz\n',
		[
			['> # Foo\n', quote(['heading', 'text:Foo'])],
			// blank, nested quote or text, the first char after the marker says which
			['> # Foo\n> ', quote(['heading', 'text:Foo'])],
			['> # Foo\n> b', quote(['heading', 'text:Foo'], ['paragraph', 'text:b'])],
			[
				'> # Foo\n> bar',
				quote(['heading', 'text:Foo'], ['paragraph', 'text:bar']),
			],
			[
				'> # Foo\n> bar\n> b',
				quote(
					['heading', 'text:Foo'],
					['paragraph', 'text:bar', 'soft_break', 'text:b']
				),
			],
		],
	],
	[
		'a quote that starts with a paragraph',
		'> foo\n> bar\n',
		[
			['> f', quote(['paragraph', 'text:f'])],
			['> foo\n> ', quote(['paragraph', 'text:foo'])],
			['> foo\n> b', quote(['paragraph', 'text:foo', 'soft_break', 'text:b'])],
		],
	],
	[
		'a paragraph of three lines',
		'> a\n> b\n> c\n',
		[
			['> a\n> b', quote(['paragraph', 'text:a', 'soft_break', 'text:b'])],
			[
				'> a\n> b\n> c',
				quote([
					'paragraph',
					'text:a',
					'soft_break',
					'text:b',
					'soft_break',
					'text:c',
				]),
			],
		],
	],
	[
		'a hard break',
		'> a\\\n> b\n',
		[['> a\\\n> b', quote(['paragraph', 'text:a', 'hard_break', 'text:b'])]],
	],
	[
		'a nested quote',
		'> a\n> > b\n> > c\n',
		[
			['> a\n> >', quote(['paragraph', 'text:a'], 'block_quote')],
			[
				'> a\n> > b',
				quote(
					['paragraph', 'text:a'],
					['block_quote', ['paragraph', 'text:b']]
				),
			],
			[
				'> a\n> > b\n> > c',
				quote(
					['paragraph', 'text:a'],
					['block_quote', ['paragraph', 'text:b', 'soft_break', 'text:c']]
				),
			],
		],
	],
	[
		'a quote in a list item',
		'- x\n  > a\n  > b\n',
		[
			[
				'- x\n  > a\n  > b',
				[
					'root',
					[
						'list',
						[
							'list_item',
							['paragraph', 'text:x'],
							['block_quote', ['paragraph', 'text:a', 'soft_break', 'text:b']],
						],
					],
				],
			],
		],
	],
	[
		'an unmarked line ends the quote at its first char',
		'> a\nb\n',
		[
			[
				'> a\nb',
				[
					'root',
					['block_quote', ['paragraph', 'text:a']],
					['paragraph', 'text:b'],
				],
			],
		],
	],
	[
		'a first line that opens with a delimiter',
		'> *a* b\n',
		[
			['> *a', quote(['paragraph', ['strong_emphasis', 'text:a']])],
			[
				'> *a* b',
				quote(['paragraph', ['strong_emphasis', 'text:a'], 'text: b']),
			],
		],
	],
	[
		'a list in a quote',
		'> - a\n> - b\n',
		[
			// a thematic break until a char that is no marker
			['> - ', quote()],
			['> - a', quote(['list', ['list_item', ['paragraph', 'text:a']]])],
		],
	],
	[
		'a line that may start a block waits for its end',
		'> a\n> - b\n> c\n',
		[
			['> a\n> - b', quote(['paragraph', 'text:a'])],
			[
				'> a\n> - b\n> c',
				quote([
					'paragraph',
					'text:a',
					'soft_break',
					'text:- b',
					'soft_break',
					'text:c',
				]),
			],
		],
	],
];

describe('block quote content streams as it is fed', () => {
	for (const [label, plugins] of [
		['no plugins', undefined],
		['a heading plugin', heading_plugin],
	] as const) {
		describe(label, () => {
			for (const [name, source, steps] of cases) {
				test(name, () => {
					const wire = wire_steps(source, plugins?.());
					const batch = batch_steps(source, plugins?.());
					for (const [fed, tree] of steps) {
						const at = JSON.stringify(fed);
						expect(wire.get(fed), `wire at ${at}`).toEqual(tree);
						expect(batch.get(fed), `batch at ${at}`).toEqual(kinds(tree));
					}
				});
			}
		});
	}
});
