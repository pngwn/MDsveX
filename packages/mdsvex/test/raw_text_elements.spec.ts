import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

import { compile, CompilerSession } from '../src/main';
import type { ComponentSource } from '../src/main';

/** the code every walk renders, they must agree */
function compile_all(
	raw: string,
	components?: ComponentSource[],
	component_mode?: 'all'
): string {
	const plain = compile(raw, { components, component_mode });
	const mapped = compile(raw, { components, component_mode, sourcemap: true });
	const session = new CompilerSession();
	const trace = session.compile_trace(
		raw,
		undefined,
		components,
		undefined,
		undefined,
		undefined,
		component_mode
	);
	const v3 = session.compile_v3(
		raw,
		'doc.svx',
		undefined,
		components,
		undefined,
		undefined,
		undefined,
		component_mode
	);
	for (const other of [mapped, trace, v3]) expect(other.code).toBe(plain.code);
	svelte_compile(plain.code, { generate: 'server', filename: 'doc.svelte' });
	return plain.code;
}

const PRE = '<pre>\nline one\n  indented *x*\n\n# line three\n</pre>';
const TEXTAREA = '<textarea>\n# not a heading\n\n- [ ] no list\n</textarea>';

describe('typed pre and textarea', () => {
	test('a pre keeps its lines and indent, with no blocks and no markup', () => {
		expect(compile_all(PRE + '\n')).toBe(PRE);
	});

	test('a textarea holds its text as written', () => {
		expect(compile_all(TEXTAREA + '\n')).toBe(TEXTAREA);
	});

	test('the document goes on after the close tag', () => {
		expect(compile_all(PRE + '\n\n# after *it*\n')).toBe(
			PRE + '<h1>after <strong>it</strong></h1>'
		);
	});

	test('a pre in a block quote has no markers in its text', () => {
		expect(compile_all('> <pre>\n> a\n>   b\n> </pre>\n')).toBe(
			'<blockquote>\n<pre>\na\n  b\n</pre>\n</blockquote>'
		);
	});

	test('an expression and an element in a pre go to svelte as written', () => {
		const raw = '<pre class="x">{a.b} <b>c</b></pre>';
		expect(compile_all(raw + '\n')).toBe(raw);
	});

	test('a replaced pre gets its text as children', () => {
		const pre: ComponentSource[] = [
			{ specifier: 'mdsvex:components', names: ['pre'] },
		];
		expect(compile_all('<pre class="x">\n  a *b*\n</pre>\n', pre, 'all')).toBe(
			"<script>\nimport { pre as Pre_MDSVEX_G } from 'mdsvex:components';\n</script>" +
				'<Pre_MDSVEX_G class="x">\n  a *b*\n</Pre_MDSVEX_G>'
		);
	});
});
