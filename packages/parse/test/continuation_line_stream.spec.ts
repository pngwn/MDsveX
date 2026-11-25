import { describe, expect, test } from 'vitest';
import { PFMParser, NodeKind } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import { NodeField, kind_to_string } from '../src/utils';

const STRIDE = NodeField.stride;

/** every value in the tree, in document order */
function shown(tree: TreeBuilder, source: string): string {
	const buf = tree.get_buffer();
	const n = buf._n;
	let out = '';
	for (let i = 0; i < buf._size; i++) {
		const b = i * STRIDE;
		const start = n[b + NodeField.value_start];
		const end = n[b + NodeField.value_end];
		if (end > start && end <= source.length) out += source.slice(start, end);
	}
	return out;
}

/** the kinds under the root, in document order */
function blocks(tree: TreeBuilder): string[] {
	const buf = tree.get_buffer();
	const n = buf._n;
	const out: string[] = [];
	for (let i = 1; i < buf._size; i++)
		if (n[i * STRIDE + NodeField.parent] === 0)
			out.push(kind_to_string(n[i * STRIDE] & 0xff));
	return out;
}

/** a paragraph line and then line, fed a character at a time, with the tree after each */
function typed(line: string): { fed: string; text: string; kinds: string[] }[] {
	const source = 'aa\n' + line;
	const tree = new TreeBuilder(64);
	const parser = new PFMParser(tree);
	parser.init();
	const out = [];
	for (let i = 0; i < source.length; i++) {
		const fed = source.slice(0, i + 1);
		tree.hide_open_text();
		parser.feed(source[i]);
		tree.show_open_text(fed);
		if (i >= 3)
			out.push({
				fed: fed.slice(3),
				text: shown(tree, fed),
				kinds: blocks(tree).filter((kind) => kind !== 'line_break'),
			});
	}
	return out;
}

/** what of line is fed when the tree first shows more than the line before it */
function first_shown(line: string): string | null {
	return typed(line).find((step) => step.text !== 'aa')?.fed ?? null;
}

describe('the second line of a paragraph shows as it is fed', () => {
	// each with what has to arrive before the line is known not to open a block
	const lines: [name: string, line: string, decided: string][] = [
		['a code span', '`bb` cc', '`b'],
		['a code span of two backticks', '``bb`` cc', '``b'],
		['emphasis', '*bb* cc', '*b'],
		['strong emphasis', '**bb** cc', '**b'],
		['underscore emphasis', '_bb_ cc', '_b'],
		['a dash with no space', '-bb cc', '-b'],
		['a plus with no space', '+bb cc', '+b'],
		['a number that is no marker', '12 bb', '12 '],
		['an inline tag', '<b>bb</b> cc', '<b>b'],
		['a link', '[bb](c) dd', '[b'],
		['an expression', '{bb} cc', '{bb}'],
		['an inline directive', ':bb[x] cc', ':bb[x'],
	];
	for (const [name, line, decided] of lines) {
		test(name, () => {
			expect(first_shown(line)).toBe(decided);
			const steps = typed(line);
			expect(steps[steps.length - 1].kinds).toEqual(['paragraph']);
		});
	}
});

describe('a line that opens a block opens it once it can be no other', () => {
	const lines: [name: string, line: string, decided: string, kind: string][] = [
		['a list item', '- bb cc', '- b', 'list'],
		['a plus list item', '+ bb', '+ b', 'list'],
		['an ordered list item', '1. bb cc', '1. b', 'list'],
		['a fence, at the first char of its info', '```js', '```j', 'code_fence'],
		[
			'a block directive, at the end of its line',
			'::bb',
			'::bb\n',
			'directive_leaf',
		],
	];
	for (const [name, line, decided, kind] of lines) {
		test(name, () => {
			const steps = typed(line + '\n');
			const at = steps.findIndex((step) => step.kinds.length > 1);
			expect(steps[at].fed).toBe(decided);
			expect(steps[at].kinds).toEqual(['paragraph', kind]);
		});
	}
});

describe('a line that may still open a block waits', () => {
	const lines: [name: string, held: string][] = [
		['one backtick', '`'],
		['two backticks', '``'],
		['a marker and its space', '- '],
		['markers and spaces alone, which may be a thematic break', '* * '],
		['underscores alone', '__'],
		['a number and its delimiter', '1. '],
		['a tag name that has not ended', '<di'],
		['a bracket alone', '['],
		['a colon alone', ':'],
	];
	for (const [name, held] of lines) {
		test(name, () => {
			const steps = typed(held);
			const last = steps[steps.length - 1];
			expect(last.text).toBe('aa');
			expect(last.kinds).toEqual(['paragraph']);
		});
	}

	test('a thematic break is one only at the end of its line', () => {
		const steps = typed('* * *\n');
		expect(steps[steps.length - 2].kinds).toEqual(['paragraph']);
		expect(steps[steps.length - 1].kinds).toEqual([
			'paragraph',
			'thematic_break',
		]);
	});
});
