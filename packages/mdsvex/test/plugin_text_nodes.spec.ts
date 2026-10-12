import { compile as svelte_compile } from 'svelte/compiler';
import { describe, expect, test } from 'vitest';

import { compile } from '../src/main';
import type { ParsePlugin } from '../src/main';

const labelled: ParsePlugin = {
	link: {
		parse(node) {
			return () => {
				const label = node.append('html', {
					tag: 'span',
					attributes: { class: 'visually-hidden' },
				});
				label.append('text', ' (opens in a new tab)');
			};
		},
	},
};

describe('text a plugin adds', () => {
	test('renders where it was put', () => {
		const numbered: ParsePlugin = {
			heading: {
				parse(node) {
					node.prepend('text', 'Step 1: ');
				},
			},
		};
		expect(compile('# Install\n', { parse_plugins: [numbered] }).code).toBe(
			'<h1>Step 1: Install</h1>'
		);
	});

	test('renders inside an element the plugin made', () => {
		expect(
			compile('[spec](https://a.b)\n', { parse_plugins: [labelled] }).code
		).toBe(
			'<p><a href="https://a.b">spec<span class="visually-hidden"> (opens in a new tab)</span></a></p>'
		);
	});

	test('every render gives the same code', () => {
		const source = '# One\n\n[spec](https://a.b) and [more](https://c.d)\n';
		const options = { parse_plugins: [labelled] };
		const plain = compile(source, options).code;
		expect(compile(source, { ...options, sourcemap: true }).code).toBe(plain);
		expect(plain.match(/opens in a new tab/g)).toHaveLength(2);
	});

	test('is escaped as text, markup, braces and references are characters', () => {
		const raw: ParsePlugin = {
			paragraph: {
				parse(node) {
					node.append('text', '<b>{x} & "y" &lt;</b> ');
				},
			},
		};
		for (const sourcemap of [false, true]) {
			const { code } = compile('Body\n', { parse_plugins: [raw], sourcemap });
			expect(code).toBe(
				'<p>&lt;b&gt;&#123;x&#125; &amp; &quot;y&quot; &amp;lt;&lt;/b&gt; Body</p>'
			);
			// svelte reads no expression in it
			expect(() => svelte_compile(code, { generate: 'server' })).not.toThrow();
		}
	});
});
