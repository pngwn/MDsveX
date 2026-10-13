import { describe, expect, test } from 'vitest';

import { compile } from '../src/main';

/** the code of the plain walk, which the mapped walk has to write too */
function code(raw: string): string {
	const plain = compile(raw).code;
	expect(compile(raw, { sourcemap: true }).code).toBe(plain);
	return plain;
}

describe('a value over lines in a container', () => {
	test('an expression in a block quote is written without the markers', () => {
		expect(code('> a {b +\n> c} d\n')).toBe(
			'<blockquote>\n<p>a {b +\nc} d</p>\n</blockquote>'
		);
	});

	test('attribute values and a svelte tag in a list item are written without the indent', () => {
		expect(
			code('- a <b class="x\n  y" title={t +\n  u}>z</b> {@html h +\n  i}\n')
		).toBe(
			'<ul>\n<li>a <b class="x\ny" title={t +\nu}>z</b> {@html h +\ni}</li>\n\n</ul>'
		);
	});

	test('an expression does not run out of its block quote', () => {
		expect(code('> a {b\nc} d\n')).toBe(
			'<blockquote>\n<p>a {b</p>\n</blockquote><p>c} d</p>'
		);
	});
});
