import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compile as svelte_compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { afterAll, describe, expect, test } from 'vitest';

import { compile } from '../src/main';
import type { ParsePlugin } from '../src/main';

// inside the package, so the compiled modules find its svelte
const DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	'.plugin-data-context'
);
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

/** a component that shows what the outline plugin wrote, read from the context */
const SHOW = `<script>
	import { getContext } from 'svelte';
	const data = getContext(Symbol.for('mdsvex.plugin_data'));
</script>

<p class="show">{JSON.stringify(data?.current?.outline ?? null)}</p>
`;

const outline: ParsePlugin = {
	name: 'outline',
	heading: {
		parse(node, ctx) {
			return () => ctx.add('headings', node.attrs.id ?? node.text_content);
		},
	},
};

let count = 0;

/** the server render of a compiled document, beside the component that shows the data */
async function rendered(code: string): Promise<string> {
	const dir = join(DIR, String(count++));
	mkdirSync(dir, { recursive: true });
	const modules: [string, string][] = [
		['Show', SHOW],
		['Doc', code],
	];
	for (const [name, source] of modules) {
		const js = svelte_compile(source, {
			generate: 'server',
			filename: name + '.svelte',
		}).js.code.replace("'./Show.svelte'", "'./Show.js'");
		writeFileSync(join(dir, name + '.js'), js);
	}
	const doc = await import(pathToFileURL(join(dir, 'Doc.js')).href);
	return render(doc.default).body.replace(/<!--[^]*?-->/g, '');
}

describe('the plugin data of a compiled document', () => {
	const raw =
		"<script>\n\timport Show from './Show.svelte';\n</script>\n\n<Show />\n\n# One\n\n## Two\n";

	test('is in the context of its components, under the key a stream uses', async () => {
		const out = compile(raw, {
			heading_ids: true,
			parse_plugins: [outline],
		});
		expect(out.data).toEqual({ outline: { headings: ['one', 'two'] } });
		expect(out.code).toContain(
			"set_context_MDSVEX(Symbol.for('mdsvex.plugin_data'), { current: plugin_data });"
		);
		expect(await rendered(out.code)).toContain(
			'<p class="show">{"headings":["one","two"]}</p>'
		);
	});

	test('a document no plugin wrote for sets none', async () => {
		const out = compile(raw, { heading_ids: true });
		expect(out.code).not.toContain('set_context_MDSVEX');
		expect(await rendered(out.code)).toContain('<p class="show">null</p>');
	});

	test('with images as imports both sets of lines are kept', () => {
		const out = compile('# One\n\n![a](./a.png)\n', {
			parse_plugins: [outline],
			import_images: true,
		});
		expect(out.code).toContain('set_context_MDSVEX(');
		expect(out.code).toMatch(/import \w+ from '\.\/a\.png'/);
	});
});
