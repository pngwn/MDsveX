import { format } from 'prettier';
import type { Options } from 'prettier';
import * as svelte from 'prettier-plugin-svelte';
import { describe, expect, test } from 'vitest';

import plugin from '../src/index';

/** markup without markdown formats as prettier-plugin-svelte formats a component */
async function same(source: string, options: Options = {}) {
	const as_svelte = await format(source, {
		parser: 'svelte',
		plugins: [svelte],
		...options,
	});
	// with both plugins loaded, as a project that formats both has them
	const as_svx = await format(source, {
		parser: 'mdsvex',
		plugins: [plugin, svelte],
		...options,
	});
	expect(as_svx).toBe(as_svelte);
}

const MARKUP = [
	'<Item {id}   name={name.trim( )}/>',
	'<a href=\'/x\' title=hi data-x="{y}" b={b} {c}>t</a>',
	'<div class="a" id="b" style="color: red" data-long-attribute-name="some long value here" aria-label="label">\n<p>x</p>\n</div>',
	'<Component one two three four five six seven eight nine ten eleven twelve thirteen fourteen />',
	'<div>\n<Foo/>\n<Bar a="1"/>\n</div>',
	'{#if a}\n<Foo/>\n{:else if b}\n<Bar/>\n{:else}\n<Baz/>\n{/if}',
	'{#each items as {id,name}, i (id)}\n<Item {id} {name}/>\n{/each}',
	'{#await load( )}\n<Spinner/>\n{:then data}\n<Data {data}/>\n{/await}',
	'<div {...props} {@attach tip(x)}></div>',
	'<Foo a={() => {\n  go();\n}} />',
	'<section>\n<div>\n<Foo bar={baz}/>\n</div>\n</section>',
	'<p>This paragraph of markup is long enough that prettier-plugin-svelte would break it over several lines for sure.</p>',
	"<script lang='ts' context=module>\nlet a=1\n</script>",
	'<style>\na{color:red}\n</style>\n\n<script>\nlet a=1\n</script>\n\n<p>hi</p>',
	'<svelte:head>\n<title>{title}</title>\n<script>\nlet a=1\n</script>\n</svelte:head>',
	'{@debug  a,b}',
];

describe('markup formats as in a svelte component', () => {
	for (const source of MARKUP) {
		test(JSON.stringify(source).slice(0, 60), async () => {
			await same(source);
		});
	}

	test('with tabs and single quotes', async () => {
		for (const source of MARKUP)
			await same(source, { useTabs: true, singleQuote: true });
	});

	test('with svelteSortOrder and svelteIndentScriptAndStyle', async () => {
		for (const source of MARKUP) {
			// svelte prints nothing for a lone module script with none, a bug of its own
			if (!source.includes('context=module')) {
				await same(source, { svelteSortOrder: 'none' } as Options);
			}
			await same(source, {
				svelteSortOrder: 'markup-styles-scripts-options',
			} as Options);
			await same(source, { svelteIndentScriptAndStyle: false } as Options);
		}
	});

	test('with bracketSameLine and singleAttributePerLine', async () => {
		for (const source of MARKUP) {
			await same(source, { bracketSameLine: true });
			// svelte hugs the close of a broken inline element, here the open tag bracket breaks instead
			if (!source.startsWith('<a ')) {
				await same(source, { singleAttributePerLine: true });
			}
		}
	});

	test('a broken inline element puts the bracket of its open tag on its own line', async () => {
		const out = await format(
			'<a href=\'/x\' title=hi data-x="{y}" b={b} {c}>t</a>',
			{ parser: 'mdsvex', plugins: [plugin], singleAttributePerLine: true }
		);
		expect(out).toBe(
			'<a\n  href="/x"\n  title="hi"\n  data-x={y}\n  {b}\n  {c}\n>t</a>\n'
		);
	});
});
