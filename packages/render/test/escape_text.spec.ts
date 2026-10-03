import { describe, it, expect } from 'vitest';
import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { Cursor } from '@mdsvex/parse/cursor';
import {
	_escape_code_text,
	_escape_text_html,
	escape,
	escape_text,
} from '../src/html_cursor';

const DOCS = [
	'a & b < c > d "e"\n\nplain\n',
	'`x < y && "z"` and `a\nb` then & more\n',
	'```js\nif (a < b && c > "d") {}\n```\n\ntext " after\n',
	'<div>\n\n& inside <em>html</em>\n\n</div>\n\n> quote & "q"\n',
	'| a & b | "c" |\n|:-|-:|\n| <x> | y > z |\n',
	'no escapes here at all\n\n- item\n- item two\n',
	'&&&<<<>>>"""\n',
	'a &lt; b &copy; & c &#123; &#x7d; &MadeUp; &copy\n\n`&lt; {x}` &amp;\n',
	'<div>\n\na &mdash; b & "c"\n\n</div>\n\n&#12345678; &#; &;\n',
	'```js\nconst s = "&amp;" && 1;\n```\n\n&copy; `&lt;` &copy;\n',
];

function cursor_for(source: string): { c: Cursor } {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	new PFMParser(tree).parse(source);
	return { c: new Cursor(tree.get_buffer(), source) };
}

function indices(c: Cursor): number[] {
	const out: number[] = [];
	const walk = (): void => {
		out.push(c.index);
		if (!c.goto_first_child()) return;
		do walk();
		while (c.goto_next_sibling());
		c.goto_parent();
	};
	c.reset();
	walk();
	return out;
}

function check(c: Cursor, order: number[]): void {
	for (const idx of order) {
		(c as unknown as { idx: number }).idx = idx;
		expect(escape_text(c)).toBe(_escape_text_html(c.text()));
		// code shares the index, so its lookups interleave with the text ones
		expect(_escape_code_text(c)).toBe(escape(c.text()));
	}
}

describe('escape_text', () => {
	for (const doc of DOCS) {
		it(`matches _escape_text_html(text()) in any visit order: ${JSON.stringify(doc)}`, () => {
			const { c } = cursor_for(doc);
			const order = indices(c);
			check(c, order);
			check(c, order.slice().reverse());
			// interleave front and back so the index keeps moving backwards
			const mixed: number[] = [];
			for (let i = 0, j = order.length - 1; i <= j; i++, j--) {
				mixed.push(order[i]);
				if (i !== j) mixed.push(order[j]);
			}
			check(c, mixed);
		});
	}

	it('escapes an & a backslash escaped, the slice no longer shows it', () => {
		const { c } = cursor_for('a \\&copy; b \\\\&copy;\n');
		const out = indices(c).map((idx) => {
			c.move_to(idx);
			return escape_text(c);
		});
		expect(out).toContain('&amp;copy; b ');
		expect(out).toContain('\\&copy;');
	});

	it('follows the cursor to a new source', () => {
		const a = cursor_for(DOCS[0]);
		const b = cursor_for(DOCS[2]);
		check(a.c, indices(a.c));
		check(b.c, indices(b.c));
		check(a.c, indices(a.c));
	});
});
