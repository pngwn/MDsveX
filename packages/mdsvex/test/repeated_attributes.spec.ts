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
	return plain.code;
}

function svelte_error(code: string): string {
	try {
		svelte_compile(code, { generate: 'server', filename: 'doc.svelte' });
	} catch (error) {
		return (error as { code: string }).code;
	}
	return '';
}

describe('a repeated attribute of a typed element', () => {
	test.each([
		['<div class="a" class="b">x</div>', '<div class="a" class="b">x</div>'],
		['a <b id=x id=y>c</b> d', '<p>a <b id="x" id="y">c</b> d</p>'],
		[
			'<div class="a" hidden class={b} hidden {class}>\n\nx\n\n</div>',
			'<div class="a" hidden class={b} hidden class={class}><p>x</p></div>',
		],
		['<Box title="a" title={b}>x</Box>', '<Box title="a" title={b}>x</Box>'],
		['<img alt="a" alt="b" />', '<img alt="a" alt="b" />'],
	])('%j is written out and svelte reports it', (raw, body) => {
		const code = compile_all(raw + '\n');
		expect(code).toBe(body);
		expect(svelte_error(code)).toBe('attribute_duplicate');
	});

	test('a replaced element gets every value too', () => {
		const div: ComponentSource[] = [
			{ specifier: 'mdsvex:components', names: ['div'] },
		];
		const code = compile_all('<div class="a" class="b">x</div>\n', div, 'all');
		expect(code).toContain(
			'<Div_MDSVEX_G class="a" class="b">x</Div_MDSVEX_G>'
		);
		expect(svelte_error(code)).toBe('attribute_duplicate');
	});

	test('an element with no repeated attribute compiles as before', () => {
		const code = compile_all('<div class="a" id="b">x</div>\n');
		expect(code).toBe('<div class="a" id="b">x</div>');
		expect(svelte_error(code)).toBe('');
	});
});
