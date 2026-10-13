import { describe, expect, test } from 'vitest';

import type { ParsePlugin } from '../src/plugin_types';
import { expect_parity_logged } from './plugin_harness';

/** logs the text_content of every paragraph and heading when it closes */
const read_text = (log: string[]): ParsePlugin[] => [
	{
		paragraph: {
			parse: (node) => () => void log.push(`p ${node.text_content}`),
		},
		heading: {
			parse: (node) => () => void log.push(`h ${node.text_content}`),
		},
		html_comment: {
			parse: (node) => () => void log.push(`c ${node.text_content}`),
		},
	},
];

describe('text_content', () => {
	test('reads a soft break as a space', () => {
		const { log } = expect_parity_logged('one\ntwo\nthree\n', read_text);
		expect(log).toEqual(['p one two three']);
	});

	test('reads a hard break as a space', () => {
		const { log } = expect_parity_logged('one\\\ntwo\\\nthree\n', read_text);
		expect(log).toEqual(['p one two three']);
	});

	test('leaves out the text of a comment', () => {
		const { log } = expect_parity_logged('## A <!-- hidden --> b\n', read_text);
		expect(log).toEqual(['c  hidden ', 'h A  b']);
	});

	test('reads breaks and leaves out comments together', () => {
		const { log } = expect_parity_logged(
			'one\ntwo\\\nthree <!-- x -->four\n',
			read_text
		);
		expect(log).toEqual(['c  x ', 'p one two three four']);
	});
});
