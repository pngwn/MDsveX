import { describe, expect, it } from 'vitest';

import type { NodeView } from '../src/node_view';
import type { ParsePlugin } from '../src/plugin_types';
import { expect_parity, expect_parity_logged } from './plugin_harness';

const KINDS = [
	'heading',
	'paragraph',
	'emphasis',
	'strong_emphasis',
	'link',
	'list',
	'list_item',
	'block_quote',
	'code_fence',
	'directive_container',
	'directive_inline',
	'html',
];

/** calls parse for every node of the kinds above */
const every = (
	parse: (node: NodeView) => (() => void) | void,
	sequential = false
): ParsePlugin => {
	const plugin: ParsePlugin = { sequential };
	for (const kind of KINDS) plugin[kind] = { parse };
	return plugin;
};

const label = (node: NodeView) =>
	node.attrs.name ?? node.attrs.tag ?? node.type;

describe('node.pending', () => {
	it('is true at the open of a node the parser may still revoke', () => {
		const { log } = expect_parity_logged(
			'# Title\n\nA _b_ and *c* and [d](e) and :kbd[f].\n\n- tight\n\n> quote\n\n```js\n```\n\n:::box\nx <span>y</span>\n:::\n',
			(log) => [
				every((node) => {
					log.push(`${label(node)} ${node.pending}`);
				}),
			]
		);
		expect(log).toEqual([
			'heading false',
			'paragraph false',
			'emphasis true',
			'strong_emphasis true',
			'link true',
			'kbd true',
			'list false',
			'list_item false',
			// a list is tight until a blank line shows otherwise
			'paragraph true',
			'block_quote false',
			'paragraph false',
			'code_fence false',
			'box false',
			'paragraph false',
			// the tag of an element follows its open
			'html true',
		]);
	});

	it('is false in the close callback of a node that closed for good', () => {
		const { log } = expect_parity_logged(
			'A _b_ and [d](e) and <i>f</i> and :kbd[g].\n',
			(log) => [
				every((node) => () => {
					log.push(`${label(node)} ${node.pending}`);
				}),
			]
		);
		expect(log).toEqual([
			'emphasis false',
			'link false',
			'i false',
			'kbd false',
			'paragraph false',
		]);
	});

	it('stays true in the close callback of a node whose revoke or commit follows', () => {
		const { log } = expect_parity_logged(
			'A _b c\n\n- tight\n- list\n\n1. loose\n\n2. list\n',
			(log) => [
				every((node) => {
					if (node.type !== 'emphasis' && node.type !== 'paragraph') return;
					return () => log.push(`${node.type} ${node.pending}`);
				}),
			]
		);
		expect(log).toEqual([
			// the delimiter never closes, the parser closes it and revokes it
			'emphasis true',
			'paragraph false',
			// revoked when the list closes tight
			'paragraph true',
			'paragraph true',
			// committed when the blank line makes the list loose
			'paragraph true',
			'paragraph true',
		]);
	});

	it('reads the node it is asked about, not the one whose handler runs', () => {
		const { log } = expect_parity_logged('- a _b_\n', (log) => [
			{
				emphasis: {
					parse(node) {
						const paragraph = node.parent!;
						const item = paragraph.parent!;
						log.push(
							`${paragraph.type} ${paragraph.pending}, ${item.type} ${item.pending}`
						);
					},
				},
			},
		]);
		expect(log).toEqual(['paragraph true, list_item false']);
	});

	it('is false for every node in a sequential pass', () => {
		const { log } = expect_parity_logged(
			'A _b_ and [d](e).\n\n- tight\n\n1. loose\n\n2. list\n',
			(log) => [
				every((node) => {
					if (node.pending) log.push('pending ' + node.type);
					return () => {
						if (node.pending) log.push('pending at close ' + node.type);
					};
				}, true),
			]
		);
		expect(log).toEqual([]);
	});

	it('is false for a node a plugin made', () => {
		const { log } = expect_parity_logged('# T\n', (log) => [
			{
				heading: {
					parse(node) {
						log.push(String(node.append('html', { tag: 'span' }).pending));
						log.push(String(node.wrap_from('html', { tag: 'div' }).pending));
					},
				},
			},
		]);
		expect(log).toEqual(['false', 'false']);
	});
});

describe('wrap_from and close with node.pending', () => {
	const SOURCE =
		'# Title\n\nA _b_ and _c and [d](e) and [f] g.\n\n- tight _h_\n\n1. loose\n\n2. list\n\n:::box\nx <span>y</span> :kbd[z]\n:::\n';

	it('throw exactly when the node whose handler runs is pending', () => {
		const { log } = expect_parity_logged(SOURCE, (log) => [
			every((node) => {
				const attempt = (when: string) => {
					const pending = node.pending;
					let threw = false;
					try {
						node.wrap_from('html', { tag: 'wrap' }).close();
					} catch (e) {
						threw = true;
						expect(String(e)).toContain('pending');
					}
					log.push(`${when} ${label(node)} pending=${pending} threw=${threw}`);
					expect(threw).toBe(pending);
				};
				attempt('open');
				return () => attempt('close');
			}),
		]);
		expect(log.length).toBeGreaterThan(30);
		expect(
			log.filter((l) => l.includes('pending=true')).length
		).toBeGreaterThan(8);
		expect(
			log.filter((l) => l.includes('pending=false')).length
		).toBeGreaterThan(8);
	});

	it('wrap an inline node in its close callback once it closed for good', () => {
		const tree = expect_parity(
			'A [d](e) and [f] g _h_ and _i\n',
			() => [
				every((node) => {
					if (node.type !== 'link' && node.type !== 'emphasis') return;
					return () => {
						if (!node.pending) node.wrap_from('html', { tag: 'mark' }).close();
					};
				}),
			],
			{ attrs: ['tag'] }
		);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				'text:A ',
				['html tag="mark"', ['link', 'text:d']],
				'text: and [f] g ',
				['html tag="mark"', ['emphasis', 'text:h']],
				'text: and _i',
			],
		]);
	});
});
