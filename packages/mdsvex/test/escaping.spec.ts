import {
	compile as svelte_compile,
	parse as svelte_parse,
} from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

import { compile, CompilerSession } from '../src/main';
import type { ComponentSource } from '../src/main';

const DIRECTIVES: ComponentSource[] = [
	{ specifier: 'mdsvex:directives', names: ['note'] },
];

/** the code every walk renders, they must agree */
function compile_all(raw: string): string {
	const plain = compile(raw, { directives: DIRECTIVES });
	const mapped = compile(raw, { directives: DIRECTIVES, sourcemap: true });
	const session = new CompilerSession();
	const trace = session.compile_trace(
		raw,
		undefined,
		undefined,
		undefined,
		undefined,
		DIRECTIVES
	);
	const v3 = session.compile_v3(
		raw,
		'doc.svx',
		undefined,
		undefined,
		undefined,
		undefined,
		DIRECTIVES
	);
	for (const other of [mapped, trace, v3]) expect(other.code).toBe(plain.code);
	return plain.code;
}

interface SvelteNode {
	type: string;
	name?: string;
	data?: string;
	value?: unknown;
	expression?: { type: string; value?: unknown; name?: string };
	attributes?: SvelteNode[];
	fragment?: { nodes: SvelteNode[] };
	body?: { nodes: SvelteNode[] };
	[key: string]: unknown;
}

/** compiles code with svelte and returns the template nodes */
function svelte_nodes(code: string): SvelteNode[] {
	svelte_compile(code, { generate: 'server', filename: 'doc.svelte' });
	svelte_compile(code, { generate: 'client', filename: 'doc.svelte' });
	const ast = svelte_parse(code, { modern: true }) as unknown as {
		fragment: { nodes: SvelteNode[] };
	};
	return ast.fragment.nodes;
}

/** every element or component named name, depth first */
function find_all(nodes: SvelteNode[], name: string, out: SvelteNode[] = []) {
	for (const node of nodes) {
		if (node.name === name) out.push(node);
		for (const value of Object.values(node)) {
			if (value === null || typeof value !== 'object') continue;
			const kids = Array.isArray(value)
				? value
				: (value as { nodes?: unknown }).nodes;
			if (Array.isArray(kids)) find_all(kids as SvelteNode[], name, out);
		}
	}
	return out;
}

/** the text a reader sees in node, an expression would render something else */
function shown(node: SvelteNode): string {
	let text = '';
	for (const child of (node.fragment ?? node.body)!.nodes) {
		if (child.type === 'Text') text += child.data;
		else if (child.type === 'ExpressionTag')
			text += '<expr ' + (child.expression!.name ?? '?') + '>';
		else text += shown(child);
	}
	return text;
}

/** the text of every element named tag, as svelte shows it */
function shown_in(raw: string, tag: string) {
	const nodes = svelte_nodes(compile_all(raw));
	return find_all(nodes, tag).map(shown);
}

/** the decoded value of a static attribute */
function attr_value(node: SvelteNode, name: string): string {
	const attr = node.attributes!.find((a) => a.name === name)!;
	return (attr.value as SvelteNode[]).map((v) => v.data).join('');
}

describe('character references', () => {
	test('the text from the issue', () => {
		expect(compile_all('a &lt; b &copy;')).toBe('<p>a &lt; b &copy;</p>');
		expect(shown_in('a &lt; b &copy;', 'p')).toEqual(['a < b ©']);
	});

	test('the raw html from the issue', () => {
		expect(compile_all('<div>a &mdash; b</div>')).toBe(
			'<div>a &mdash; b</div>'
		);
		expect(shown_in('<div>a &mdash; b</div>', 'div')).toEqual(['a — b']);
	});

	const text: [string, string][] = [
		['&#123; &#x7D; &#X41; &#0065;', '{ } A A'],
		['AT&T & b && c', 'AT&T & b && c'],
		[
			'&MadeUp; &copy &#; &#x; &#12345678; &#xabcdefa;',
			'&MadeUp; &copy &#; &#x; &#12345678; &#xabcdefa;',
		],
		['&amp;lt; &AMP; &CounterClockwiseContourIntegral;', '&lt; & ∳'],
		['\\&copy; and \\\\&copy;', '&copy; and \\©'],
		['<b>&copy;</b> _&lt;_', '© <'],
	];
	for (const [raw, want] of text) {
		test(JSON.stringify(raw), () => {
			expect(shown_in(raw, 'p')).toEqual([want]);
		});
	}

	test('a bare & is escaped', () => {
		expect(compile_all('a & b &copy')).toBe('<p>a &amp; b &amp;copy</p>');
	});

	const nested: [string, string, string, string[]][] = [
		['block quote', '> &copy;', 'p', ['©']],
		['list', '- &copy;\n- &lt;', 'li', ['©', '<']],
		['heading', '# &copy;', 'h1', ['©']],
		['table cell', '| &copy; |\n|-|\n| &lt; |', 'td', ['<']],
		['raw html block', '<div>\n\n&copy; &\n\n</div>', 'p', ['© &']],
		['directive label', '::note[&copy; `a`]', 'Note_MDSVEX_D_G', ['© a']],
	];
	for (const [name, raw, tag, want] of nested) {
		test(`inside a ${name}`, () => {
			expect(shown_in(raw, tag)).toEqual(want);
		});
	}

	test('code shows references as written', () => {
		expect(shown_in('`&lt;` and &lt;', 'p')).toEqual(['&lt; and <']);
		expect(compile_all('`&lt; &copy; &`')).toBe(
			'<p><code>&amp;lt; &amp;copy; &amp;</code></p>'
		);
		expect(shown_in('```\n&lt; &copy; &#123;\n```', 'code')).toEqual([
			'&lt; &copy; &#123;',
		]);
	});

	test('link and image attributes keep references', () => {
		const raw =
			'[a &copy;](/x?a=1&amp;b=2&c "t &lt;") ![i &copy;](/i.png?a&amp;b)';
		const nodes = svelte_nodes(compile_all(raw));
		const [a] = find_all(nodes, 'a');
		expect(attr_value(a, 'href')).toBe('/x?a=1&b=2&c');
		expect(attr_value(a, 'title')).toBe('t <');
		expect(shown(a)).toBe('a ©');
		const [img] = find_all(nodes, 'img');
		expect(attr_value(img, 'src')).toBe('/i.png?a&b');
		expect(attr_value(img, 'alt')).toBe('i ©');
	});
});
