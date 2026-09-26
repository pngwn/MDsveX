import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import type { NodeBuffer } from '../src/utils';
import { print_ast } from './print';

function kinds(nodes: NodeBuffer, parent: number = 0): string[] {
	return nodes
		.get_node(parent)
		.children.map((i) => nodes.get_node(i).kind)
		.filter((k) => k !== 'line_break');
}

let error_spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	error_spy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	error_spy.mockRestore();
});

describe('unclosed delimiter before a block interrupt', () => {
	test('ordered list: `1. ~1\\n2. *`', () => {
		const input = '1. ~1\n2. *';
		const { nodes } = parse_markdown_svelte(input);

		expect(error_spy).not.toHaveBeenCalled();
		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  list ordered=true start=1 tight=true',
				'    list_item',
				'      text "~1"',
				'    list_item',
				'      text "*"',
			].join('\n')
		);
	});

	test('nested list marker: `- *a\\n  - b`', () => {
		const input = '- *a\n  - b';
		const { nodes } = parse_markdown_svelte(input);

		expect(error_spy).not.toHaveBeenCalled();
		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "*a"',
				'      list ordered=false start=0 tight=true',
				'        list_item',
				'          text "b"',
			].join('\n')
		);
	});

	const openers = ['*a', '_a', '~~a', '~a', '^a'];
	const interrupts: [string, string][] = [
		['- b', 'list'],
		['1. b', 'list'],
		['> b', 'block_quote'],
		['```\nb\n```', 'code_fence'],
		['<div>\n</div>', 'html'],
	];

	for (const opener of openers) {
		for (const [interrupt, kind] of interrupts) {
			const input = `${opener}\n${interrupt}`;
			test(JSON.stringify(input), () => {
				const { nodes } = parse_markdown_svelte(input);

				expect(error_spy).not.toHaveBeenCalled();
				expect(kinds(nodes)).toEqual(['paragraph', kind]);
				const para = nodes.get_node(0).children[0];
				expect(kinds(nodes, para).every((k) => k === 'text')).toBe(true);
			});
		}

		const input = `- ${opener}\n- b`;
		test(JSON.stringify(input), () => {
			const { nodes } = parse_markdown_svelte(input);

			expect(error_spy).not.toHaveBeenCalled();
			const list = nodes.get_node(0).children[0];
			expect(kinds(nodes)).toEqual(['list']);
			expect(kinds(nodes, list)).toEqual(['list_item', 'list_item']);
		});
	}
});
