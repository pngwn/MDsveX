import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { anchors } from '@mdsvex/plugin-anchors';
import { compile, mdsvex } from 'mdsvex';
import type { Bundle } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));

function html(
	source: string,
	plugins: Bundle[] = [anchors()],
	options: Parameters<typeof compile>[1] = {}
): string {
	return compile(source, { heading_ids: true, plugins, ...options }).code;
}

describe('wrap', () => {
	test('the content of each heading becomes a link to its id', () => {
		expect(html('# One\n\n## Two *words*\n\ntext\n')).toBe(
			'<h1 id="one"><a href="#one">One</a></h1>' +
				'<h2 id="two-words"><a href="#two-words">Two <strong>words</strong></a></h2>' +
				'<p>text</p>'
		);
	});

	test('the link uses the id heading_ids made, numbered when it repeats', () => {
		expect(html('## Same\n\n## Same\n')).toBe(
			'<h2 id="same"><a href="#same">Same</a></h2>' +
				'<h2 id="same-1"><a href="#same-1">Same</a></h2>'
		);
	});

	test('a custom slug is the one linked', () => {
		expect(
			html('## Title\n', [anchors()], {
				heading_ids: { slug: (text) => 'x-' + text.length },
			})
		).toBe('<h2 id="x-5"><a href="#x-5">Title</a></h2>');
	});

	test('a heading that holds a link is left as it is', () => {
		expect(html('## See [the docs](/docs)\n')).toBe(
			'<h2 id="see-the-docs">See <a href="/docs">the docs</a></h2>'
		);
		expect(html('## See *[the docs](/docs)*\n')).toBe(
			'<h2 id="see-the-docs">See <strong><a href="/docs">the docs</a></strong></h2>'
		);
		expect(html('## See <a href="/docs">the docs</a>\n')).toBe(
			'<h2 id="see-the-docs">See <a href="/docs">the docs</a></h2>'
		);
	});

	test('attrs are added to the link', () => {
		expect(html('## One\n', [anchors({ attrs: { class: 'anchor' } })])).toBe(
			'<h2 id="one"><a href="#one" class="anchor">One</a></h2>'
		);
	});
});

describe('prepend and append', () => {
	test('prepend puts an empty hidden link ahead of the content', () => {
		expect(html('## Two *words*\n', [anchors({ position: 'prepend' })])).toBe(
			'<h2 id="two-words">' +
				'<a href="#two-words" aria-hidden="true" tabindex="-1"></a>' +
				'Two <strong>words</strong></h2>'
		);
	});

	test('append puts it after the content', () => {
		expect(html('## Two *words*\n', [anchors({ position: 'append' })])).toBe(
			'<h2 id="two-words">Two <strong>words</strong>' +
				'<a href="#two-words" aria-hidden="true" tabindex="-1"></a></h2>'
		);
	});

	test('a heading that holds a link still gets one beside it', () => {
		expect(
			html('## See [docs](/docs)\n', [anchors({ position: 'prepend' })])
		).toBe(
			'<h2 id="see-docs">' +
				'<a href="#see-docs" aria-hidden="true" tabindex="-1"></a>' +
				'See <a href="/docs">docs</a></h2>'
		);
	});

	test('attrs replace a default of the same name', () => {
		expect(
			html('## One\n', [
				anchors({
					position: 'prepend',
					attrs: { class: 'anchor', tabindex: '0' },
				}),
			])
		).toBe(
			'<h2 id="one"><a href="#one" aria-hidden="true" tabindex="0" class="anchor"></a>One</h2>'
		);
	});
});

describe('ids', () => {
	const SOURCE = '# One\n\n## Two\n';

	test('without heading_ids no heading has an id and nothing is linked', () => {
		for (const position of ['wrap', 'prepend', 'append'] as const) {
			expect(compile(SOURCE, { plugins: [anchors({ position })] }).code).toBe(
				compile(SOURCE).code
			);
		}
	});

	test('a heading with no id is left alone beside ones that have one', () => {
		expect(html('# {title}\n\n## Real\n')).toBe(
			'<h1>{title}</h1><h2 id="real"><a href="#real">Real</a></h2>'
		);
	});

	test('an id a parse plugin set is linked, with or without heading_ids', () => {
		const ids = {
			heading: {
				parse(node: { attrs: Record<string, unknown> }) {
					node.attrs.id = 'mine';
				},
			},
		};
		const expected = '<h2 id="mine"><a href="#mine">Two</a></h2>';
		expect(
			compile('## Two\n', { plugins: [anchors()], parse_plugins: [ids] }).code
		).toBe(expected);
		expect(html('## Two\n', [anchors()], { parse_plugins: [ids] })).toBe(
			expected
		);
	});

	test('a heading typed as html is not a markdown heading', () => {
		expect(html('<h2 id="typed">Typed</h2>\n')).toBe(
			'<h2 id="typed">Typed</h2>'
		);
	});
});

describe('options', () => {
	test('an unknown position throws when the plugin is made', () => {
		expect(() => anchors({ position: 'before' as any })).toThrow(
			`[@mdsvex/plugin-anchors] position must be 'wrap', 'prepend' or 'append', got "before"`
		);
	});

	test('one plugin serves many documents', () => {
		const plugins = [anchors()];
		expect(html('## A\n', plugins)).toBe('<h2 id="a"><a href="#a">A</a></h2>');
		expect(html('## B\n', plugins)).toBe('<h2 id="b"><a href="#b">B</a></h2>');
	});
});

describe('vite plugin', () => {
	test('the plugins option takes it beside heading_ids', async () => {
		const [plugin] = mdsvex({ heading_ids: true, plugins: [anchors()] });
		const transform = plugin.transform as Function;
		const result = await transform.call(
			{ addWatchFile() {} },
			'## Hello *there*\n',
			'/app/src/doc.svx'
		);
		expect(result.code).toContain(
			'<h2 id="hello-there"><a href="#hello-there">Hello <strong>there</strong></a></h2>'
		);
	});
});

describe('as published', () => {
	test('the files it publishes are the ones its exports name', async () => {
		const root = write_app(HERE, {}, [dirname(HERE)]);
		try {
			const entry = createRequire(join(root, 'index.js')).resolve(
				'@mdsvex/plugin-anchors'
			);
			expect(entry).toBe(
				join(
					root,
					'node_modules',
					'@mdsvex',
					'plugin-anchors',
					'dist',
					'index.js'
				)
			);
			const installed = await import(pathToFileURL(entry).href);
			expect(html('## A\n', [installed.anchors()])).toBe(
				'<h2 id="a"><a href="#a">A</a></h2>'
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
