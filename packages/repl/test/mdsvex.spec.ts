import { describe, expect, test } from 'vitest';
import { decode } from '@jridgewell/sourcemap-codec';

import {
	COMPONENTS_ID,
	DIRECTIVES_ID,
	TEMPLATE_DIRECTIVES_PREFIX,
	TEMPLATE_PREFIX,
	compile_markdown,
	highlight_for,
	is_markdown,
	languages_used,
	prepare,
	resolve_virtual,
	scan_exports,
} from '../src/workers/mdsvex';
import { chain, offset_mapper } from '../src/workers/sourcemap';
import { pfm_ast } from '../src/workers/pfm_ast';

const files = (entries: Record<string, string>) =>
	new Map(Object.entries(entries));

describe('scan_exports', () => {
	test('reads named exports from a component module script only', () => {
		const names = scan_exports(
			'Template.svelte',
			files({
				'Template.svelte': `<script module>
	export { default as h2 } from './Heading.svelte';
	export const p = 1;
	export function img() {}
</script>

<script>
	export const not_this = 1;
</script>

<style>
	p { color: red; }
</style>`,
			})
		);

		expect(names).toEqual(['h2', 'p', 'img']);
	});

	test('accepts the legacy context attribute and typescript', () => {
		const names = scan_exports(
			'T.svelte',
			files({
				'T.svelte': `<script context="module" lang="ts">
	const level: number = 2;
	export { default as blockquote } from './Quote.svelte';
</script>`,
			})
		);

		expect(names).toEqual(['blockquote']);
	});

	test('a component without a module script has no replacements', () => {
		expect(
			scan_exports('T.svelte', files({ 'T.svelte': '<p>hi</p>' }))
		).toEqual([]);
	});

	test('follows star re-exports through the workspace', () => {
		const names = scan_exports(
			'components.js',
			files({
				'components.js': `export * from './more.js';\nexport { default as img } from './Image.svelte';`,
				'more.js': `export { default as pre } from './Code.svelte';\nexport * as ns from './ns.js';`,
			})
		);

		expect(names.sort()).toEqual(['img', 'ns', 'pre']);
	});

	test('cyclic re-exports terminate', () => {
		const names = scan_exports(
			'a.js',
			files({
				'a.js': `export * from './b.js'; export const a = 1;`,
				'b.js': `export * from './a.js'; export const b = 1;`,
			})
		);

		expect(names.sort()).toEqual(['a', 'b']);
	});

	test('default exports are not element names', () => {
		expect(
			scan_exports('a.js', files({ 'a.js': 'export default 1;' }))
		).toEqual([]);
	});
});

describe('prepare', () => {
	test('without a config every option is left to core', () => {
		const { options, error, config } = prepare(files({ 'App.svx': '# hi' }));
		expect(error).toBeNull();
		expect(options).toEqual({});
		expect(config.extensions).toEqual(['.svx', '.md']);
	});

	test('builds the plain compile options the vite plugin would', () => {
		const { options, error } = prepare(
			files({
				'mdsvex.config.json': JSON.stringify({
					templates: {
						default: './Template.svelte',
						docs: { component: 'Docs.svelte', components: './overrides.js' },
					},
					components: './components.js',
				}),
				'Template.svelte': `<script module>export { default as h2 } from './H.svelte';</script>`,
				'Docs.svelte': `<script module>export const p = 1;</script>`,
				'overrides.js': `export const a = 1; export const p = 2;`,
				'components.js': `export { default as img } from './Image.svelte';`,
			})
		);

		expect(error).toBeNull();
		expect(options).toEqual({
			component_mode: 'markdown',
			templates: {
				default: { specifier: TEMPLATE_PREFIX + 'default', components: ['h2'] },
				docs: { specifier: TEMPLATE_PREFIX + 'docs', components: ['p', 'a'] },
			},
			default_template: 'default',
			components: [{ specifier: COMPONENTS_ID, names: ['img'] }],
		});
	});

	test('a relative template that does not exist is an error', () => {
		const { error } = prepare(
			files({
				'mdsvex.config.json': '{ "templates": { "default": "./Nope.svelte" } }',
			})
		);
		expect(error?.message).toMatch(
			/templates\.default points at '\.\/Nope\.svelte'/
		);
	});

	test('a package template passes through with no replacements', () => {
		const { config, error } = prepare(
			files({
				'mdsvex.config.json':
					'{ "templates": { "default": "@acme/theme/Layout.svelte" } }',
			})
		);
		expect(error).toBeNull();
		expect(resolve_virtual(TEMPLATE_PREFIX + 'default', config)).toEqual({
			file: null,
			specifier: '@acme/theme/Layout.svelte',
			components: [],
			directives: [],
		});
	});

	test('invalid json is reported, not thrown', () => {
		const { error } = prepare(files({ 'mdsvex.config.json': '{' }));
		expect(error?.message).toMatch(/^mdsvex\.config\.json:/);
	});

	test('extensions decide which files are markdown', () => {
		const { config } = prepare(
			files({ 'mdsvex.config.json': '{ "extensions": ["md"] }' })
		);
		expect(is_markdown('a.md', config)).toBe(true);
		expect(is_markdown('a.svx', config)).toBe(false);
	});

	test('a directives namespace export becomes the directives options', () => {
		const { options, config, error } = prepare(
			files({
				'mdsvex.config.json': JSON.stringify({
					templates: { default: './lib/Docs.svelte' },
					components: './lib/markdown.js',
				}),
				'lib/Docs.svelte': `<script module>
	export { default as p } from './P.svelte';
	export * as directives from './docs-directives.js';
</script>`,
				'lib/docs-directives.js': `export { default as note } from './Note.svelte';`,
				'lib/markdown.js': `export { default as img } from './Image.svelte';
export * as directives from './directives.js';`,
				'lib/directives.js': `export { default as Callout } from './Callout.svelte';`,
			})
		);

		expect(error).toBeNull();
		expect(options.components).toEqual([
			{ specifier: COMPONENTS_ID, names: ['img'] },
		]);
		expect(options.directives).toEqual([
			{ specifier: DIRECTIVES_ID, names: ['Callout'] },
		]);
		const docs = TEMPLATE_DIRECTIVES_PREFIX + 'default/0';
		expect(options.templates?.default).toEqual({
			specifier: TEMPLATE_PREFIX + 'default',
			components: ['p'],
			directives: [{ specifier: docs, names: ['note'] }],
		});
		expect(resolve_virtual(DIRECTIVES_ID, config).file).toBe(
			'lib/directives.js'
		);
		expect(resolve_virtual(docs, config).file).toBe('lib/docs-directives.js');
	});

	test('a directives export that is not a namespace re-export is an error', () => {
		const { error } = prepare(
			files({
				'mdsvex.config.json': '{ "components": "./markdown.js" }',
				'markdown.js': 'export const directives = {};',
			})
		);
		expect(error?.message).toMatch(/must be a namespace re-export/);
	});

	test('virtual ids resolve to workspace files', () => {
		const { config } = prepare(
			files({
				'mdsvex.config.json':
					'{ "templates": { "default": "./lib/T.svelte" } }',
				'lib/T.svelte': '',
			})
		);
		expect(resolve_virtual(TEMPLATE_PREFIX + 'default', config).file).toBe(
			'lib/T.svelte'
		);
		expect(() => resolve_virtual(TEMPLATE_PREFIX + 'nope', config)).toThrow(
			/not configured/
		);
	});
});

describe('compile_markdown', () => {
	test('maps the svelte output back to the markdown file', () => {
		const source = '# hello\n\nsome *text*';
		const { code, map } = compile_markdown(source, 'App.svx', {});

		expect(code).toContain('<h1>hello</h1>');
		expect(map.sources).toEqual(['App.svx']);
		expect(map.sourcesContent).toEqual([source]);

		const to_source = offset_mapper(map, code, source);
		expect(source.slice(to_source(code.indexOf('text')))).toMatch(/^text/);
	});

	test('chained maps keep the markdown as their only source', () => {
		const source = '# hello';
		const { code, map } = compile_markdown(source, 'App.svx', {});
		const outer = {
			version: 3,
			sources: ['App.svx'],
			names: [],
			mappings: 'AAAA',
			file: 'App.js',
		};

		const chained = chain(outer, map, 'App.svx');
		expect(chained.sources).toEqual(['App.svx']);
		expect(decode(chained.mappings)[0].length).toBeGreaterThan(0);
		expect(code).toContain('hello');
	});
});

describe('highlight', () => {
	const config_with = (highlight: unknown) =>
		prepare(files({ 'mdsvex.config.json': JSON.stringify({ highlight }) }));

	test('highlighting is on without a config, as in the vite plugin', async () => {
		const { config, options } = prepare(files({}));
		const source = '```js\nlet a = { b };\n```';
		const highlight = await highlight_for(source, config);
		const { code } = compile_markdown(source, 'App.svx', {
			...options,
			highlight,
		});
		expect(code).toContain('<pre class="twinkleplop language-js"');
		expect(code).toContain('<span class="tok keyword">let</span>');
		expect(code).toContain('&#123;');
	});

	test('only the languages a document names are loaded', () => {
		const used = languages_used(
			'```ts title="x"\na\n```\n\n~~~Dockerfile\nb\n~~~\n\n`#!sh ls`\n\n```nope\n```\n\n```\nplain\n```',
			{}
		);
		expect([...used].sort()).toEqual(['bash', 'dockerfile', 'typescript']);
	});

	test('config aliases and markdown front matter are followed', () => {
		const used = languages_used('```vue\n```\n\n```md\n```', {
			languages: { vue: 'html' },
		});
		expect([...used].sort()).toEqual(['html', 'markdown', 'yaml']);
	});

	test('the options mirror the plugin ones', async () => {
		const { config, error } = config_with({
			languages: { vue: 'html' },
			line_numbers: true,
			annotations: ['hl', 'shiki_notation'],
		});
		expect(error).toBe(null);
		const source = '```vue\n<p>a</p> <!-- [!code ++] -->\n```';
		const highlight = await highlight_for(source, config);
		const { code } = compile_markdown(source, 'App.svx', { highlight });
		expect(code).toContain('language-vue');
		expect(code).toContain('<span class="ln">1</span>');
		expect(code).toContain('diff-add');
		expect(code).not.toContain('[!code ++]');
	});

	test('highlight: false renders plain code', async () => {
		const { config } = config_with(false);
		const source = '```js\nlet a;\n```';
		expect(await highlight_for(source, config)).toBe(false);
		const { code } = compile_markdown(source, 'App.svx', { highlight: false });
		expect(code).toBe('<pre><code class="language-js">let a;</code></pre>');
	});

	test('plugin only options are errors', () => {
		expect(config_with({ twoslash: true }).error?.message).toBe(
			'mdsvex.config.json: highlight.twoslash is not available in the playground'
		);
		expect(config_with({ annotations: ['nope'] }).error?.message).toContain(
			'has no annotation named nope'
		);
		expect(
			config_with({ languages: { zig: { tokenize: 1 } } }).error?.message
		).toContain('highlight.languages.zig must name another language');
	});
});

describe('unwrap_images', () => {
	const config_with = (unwrap_images: unknown) =>
		prepare(files({ 'mdsvex.config.json': JSON.stringify({ unwrap_images }) }));

	test('is off without the key and on when the config says so', () => {
		const source = '![cat](/cat.png)\n';
		const off = prepare(files({ 'mdsvex.config.json': '{}' }));
		expect(off.config.unwrap_images).toBe(false);
		expect('unwrap_images' in off.options).toBe(false);
		expect(compile_markdown(source, 'App.svx', off.options).code).toBe(
			'<p><img src="/cat.png" alt="cat" /></p>'
		);

		const on = config_with(true);
		expect(on.error).toBeNull();
		expect(on.config.unwrap_images).toBe(true);
		expect(on.options.unwrap_images).toBe(true);
		expect(compile_markdown(source, 'App.svx', on.options).code).toBe(
			'<img src="/cat.png" alt="cat" />'
		);
		expect('unwrap_images' in config_with(false).options).toBe(false);
	});

	test('anything but a boolean is an error', () => {
		expect(config_with('yes').error?.message).toBe(
			'mdsvex.config.json: unwrap_images must be true or false'
		);
	});

	test('the ast view shows the tree the compile renders', () => {
		const source = '![cat](/cat.png)\n';
		const kinds = (root: ReturnType<typeof pfm_ast>) =>
			root.children!.map((n) => n.type).filter((t) => t !== 'line_break');
		expect(kinds(pfm_ast(source))).toEqual(['paragraph']);
		expect(kinds(pfm_ast(source, config_with(true).options))).toEqual([
			'image',
		]);
	});
});

describe('pfm_ast', () => {
	test('rebuilds the arena as plain nodes with source offsets', () => {
		const source = '# hi\n\nsome *text*';
		const root = pfm_ast(source);

		expect(root.type).toBe('root');
		const heading = root.children!.find((n) => n.type === 'heading')!;
		const paragraph = root.children!.find((n) => n.type === 'paragraph')!;
		expect(heading).toMatchObject({ depth: 1 });
		expect(source.slice(heading.start, heading.end)).toBe('# hi');

		const strong = paragraph.children!.find(
			(n) => n.type === 'strong_emphasis'
		)!;
		expect(strong.children![0]).toMatchObject({ type: 'text', value: 'text' });
		expect(() => structuredClone(root)).not.toThrow();
	});
});
