import { describe, expect, it } from 'vitest';

import type { NodeView } from '../src/node_view';
import type { ParsePlugin } from '../src/plugin_types';
import {
	PATHS,
	expect_parity,
	expect_parity_logged,
	shape,
} from './plugin_harness';

type Parse = (node: NodeView) => (() => void) | void;

const on = (kind: string, parse: Parse): ParsePlugin => ({ [kind]: { parse } });

const TAGGED = { attrs: ['tag'] };

describe('a text node a plugin adds', () => {
	it('is prepended ahead of the text the parser sends', () => {
		const tree = expect_parity('# Title\n\nBody _here_.\n', () => [
			on('heading', (node) => {
				node.prepend('text', 'Step 1: ');
			}),
			on('paragraph', (node) => {
				node.prepend('text', '> ');
			}),
		]);
		expect(tree).toEqual([
			'root',
			['heading', 'text:Step 1: Title'],
			['paragraph', 'text:> Body ', ['emphasis', 'text:here'], 'text:.'],
		]);
	});

	it('stays apart from the text that follows it', () => {
		for (const [name, run] of PATHS) {
			const out = run('Body text.\n', [
				on('paragraph', (node) => {
					node.append('text', 'lead ');
				}),
			]);
			expect(shape(out.nodes, out.source), name).toEqual([
				'root',
				['paragraph', 'text:lead ', 'text:Body text.'],
			]);
		}
	});

	it('is appended in a close callback, after everything the node holds', () => {
		const tree = expect_parity('See [the _spec_](https://a.b) now.\n', () => [
			on('link', (node) => () => {
				node.append('text', ' (external)');
			}),
		]);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:See ',
				['link', 'text:the ', ['emphasis', 'text:spec'], 'text: (external)'],
				'text: now.',
			],
		]);
	});

	it('is a child of a node the plugin made', () => {
		const tree = expect_parity(
			'[a](https://a.b)\n',
			() => [
				on('link', (node) => () => {
					const label = node.append('html', { tag: 'span' });
					label.append('text', 'opens in a new tab');
					label.prepend('text', '(');
					label.append('text', ')');
				}),
			],
			TAGGED
		);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				['link', 'text:a', ['html tag="span"', 'text:(opens in a new tab)']],
			],
		]);
	});

	it('reads as text_content, its own and of what holds it', () => {
		const { log } = expect_parity_logged('# Title\n', (log) => [
			on('heading', (node) => {
				const made = node.prepend('text', 'Step: ');
				log.push(`made ${made.type} "${made.text_content}"`);
				return () => {
					log.push(`first "${node.first_child!.text_content}"`);
				};
			}),
		]);
		expect(log).toEqual(['made text "Step: "', 'first "Step: "']);
	});

	it('can be empty', () => {
		const tree = expect_parity('# Title\n', () => [
			on('heading', (node) => {
				node.append('html', { tag: 'span' }).append('text', '');
			}),
		]);
		expect(tree).toEqual([
			'root',
			['heading', ['html', 'text:'], 'text:Title'],
		]);
	});

	it('is added in a sequential pass', () => {
		const tree = expect_parity('# Title\n\n- one\n- two\n', () => [
			{
				sequential: true,
				heading: {
					parse(node) {
						node.append('text', ' #');
					},
				},
				list_item: {
					parse(node) {
						node.prepend('text', 'item ');
					},
				},
			},
		]);
		expect(tree).toEqual([
			'root',
			['heading', 'text:Title #'],
			['list', ['list_item', 'text:item one'], ['list_item', 'text:item two']],
		]);
	});
});

describe('a text node of a handler whose node is revoked', () => {
	it('goes with an emphasis that never closes', () => {
		const tree = expect_parity('a _b c\n\nd _e_ f\n', () => [
			on('emphasis', (node) => {
				node.prepend('text', '[');
				return () => {
					node.append('text', ']');
				};
			}),
		]);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:a _b c'],
			['paragraph', 'text:d ', ['emphasis', 'text:[e]'], 'text: f'],
		]);
	});

	it('goes with a link that has no destination', () => {
		const tree = expect_parity('[a] b [c](d)\n', () => [
			on('link', (node) => {
				node.prepend('text', '>');
			}),
		]);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:[a] b ', ['link', 'text:>c']],
		]);
	});

	it('goes with the paragraphs of a tight list and stays in a loose one', () => {
		const mark = () => [
			on('paragraph', (node) => {
				node.prepend('text', '+');
				return () => {
					node.append('text', '!');
				};
			}),
		];
		expect(expect_parity('- one\n- two\n', mark)).toEqual([
			'root',
			['list', ['list_item', 'text:one'], ['list_item', 'text:two']],
		]);
		expect(expect_parity('- one\n\n- two\n', mark)).toEqual([
			'root',
			[
				'list',
				['list_item', ['paragraph', 'text:+one!']],
				['list_item', ['paragraph', 'text:+two!']],
			],
		]);
	});

	it('goes with its handler node, whichever node it was put on', () => {
		const tree = expect_parity('a _b\n\nc _d_\n', () => [
			on('emphasis', (node) => {
				node.parent!.prepend('text', 'seen ');
			}),
		]);
		expect(tree).toEqual([
			'root',
			['paragraph', 'text:a _b'],
			['paragraph', 'text:seen c ', ['emphasis', 'text:d']],
		]);
	});
});

describe('what prepend and append take', () => {
	const run = (parse: Parse) =>
		expect_parity('# Title\n', () => [on('heading', parse)]);

	it('a text node with no text throws', () => {
		expect(() =>
			run((node) => {
				// @ts-expect-error the text is required
				node.append('text');
			})
		).toThrow(TypeError);
		expect(() =>
			run((node) => {
				node.prepend('text', { value: 'x' } as any);
			})
		).toThrow(
			"a text node takes its text, as in append('text', 'some text'), got object"
		);
	});

	it('text for a node of another type throws', () => {
		expect(() =>
			run((node) => {
				node.append('emphasis', 'x' as any);
			})
		).toThrow(
			'only a text node takes text, the second argument of a emphasis node is its attrs'
		);
	});
});
