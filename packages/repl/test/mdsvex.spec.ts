import { describe, expect, test } from 'vitest';
import { decode } from '@jridgewell/sourcemap-codec';

import {
	COMPONENTS_ID,
	TEMPLATE_PREFIX,
	compile_markdown,
	is_markdown,
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
