import { describe, expect, test } from 'vitest';
import { read_json_config } from '../src/host';
import type { ConfigExports, ConfigHost } from '../src/host';

/** modules by path, a specifier is a path from the root or relative to its importer */
function host(modules: Record<string, Partial<ConfigExports>>): ConfigHost {
	return {
		resolve(spec, importer) {
			const dir = importer.slice(0, importer.lastIndexOf('/') + 1);
			const file = spec.startsWith('./')
				? dir + spec.slice(2)
				: spec.startsWith('/')
					? spec
					: '/node_modules/' + spec;
			return file in modules ? file : null;
		},
		scan: (file) => ({ names: [], directives: null, ...modules[file] }),
	};
}

const read = (
	config: unknown,
	modules: Record<string, Partial<ConfigExports>> = {}
) => read_json_config(config, '/app/mdsvex.config.json', '/app', host(modules));

describe('read_json_config', () => {
	test('gives the manifest the plugin writes for no options', () => {
		expect(read({})).toEqual({
			manifest: {
				version: 1,
				root: '/app',
				extensions: ['.svx'],
				component_mode: 'markdown',
				frontmatter_parse: false,
				directive_plugins: false,
				select_template: false,
				templates: {},
				components: [],
				directives: [],
				documents: {},
				highlight: 'twinkleplop',
				import_images: true,
			},
			errors: [],
		});
	});

	test('takes the default extensions of the host', () => {
		const { manifest } = read_json_config({}, '/c.json', '/', host({}), {
			extensions: ['.svx', '.md'],
		});
		expect(manifest.extensions).toEqual(['.svx', '.md']);
		expect(read({ extensions: ['md', '.svx'] }).manifest.extensions).toEqual([
			'.md',
			'.svx',
		]);
	});

	test('resolves and scans templates, components and their directives with the ids of the plugin', () => {
		const { manifest, errors } = read(
			{
				templates: {
					docs: './Docs.svelte',
					theme: { component: 'theme/Layout.svelte', components: './more.js' },
				},
				components: ['./md.js', './other.js'],
			},
			{
				'/app/Docs.svelte': {
					names: ['h2', 'default', 'directives'],
					directives: './docs-directives.js',
				},
				'/app/docs-directives.js': { names: ['note'] },
				'/node_modules/theme/Layout.svelte': { names: ['h1'] },
				'/app/more.js': {
					names: ['img', 'directives'],
					directives: './more-directives.js',
				},
				'/app/more-directives.js': { names: ['tip'] },
				'/app/md.js': {
					names: ['a', 'directives'],
					directives: './root-directives.js',
				},
				'/app/root-directives.js': { names: ['box'] },
				'/app/other.js': { names: ['em'] },
			}
		);
		expect(errors).toEqual([]);
		expect(manifest.templates).toEqual({
			docs: {
				id: 'mdsvex:template/docs',
				file: '/app/Docs.svelte',
				components: ['h2'],
				extra: null,
				directives: [
					{
						id: 'mdsvex:template-directives/docs',
						file: '/app/docs-directives.js',
						names: ['note'],
					},
				],
			},
			theme: {
				id: 'mdsvex:template/theme',
				file: '/node_modules/theme/Layout.svelte',
				components: ['h1'],
				extra: {
					id: 'mdsvex:template/theme',
					file: '/app/more.js',
					names: ['img'],
				},
				directives: [
					{
						id: 'mdsvex:template-directives/theme/components',
						file: '/app/more-directives.js',
						names: ['tip'],
					},
				],
			},
		});
		expect(manifest.components).toEqual([
			{ id: 'mdsvex:components/0', file: '/app/md.js', names: ['a'] },
			{ id: 'mdsvex:components/1', file: '/app/other.js', names: ['em'] },
		]);
		expect(manifest.directives).toEqual([
			{
				id: 'mdsvex:directives/0',
				file: '/app/root-directives.js',
				names: ['box'],
			},
		]);
	});

	test('one components module has the plain ids', () => {
		const { manifest } = read(
			{ components: './md.js' },
			{
				'/app/md.js': { names: ['a', 'directives'], directives: './d.js' },
				'/app/d.js': { names: ['box'] },
			}
		);
		expect(manifest.components[0].id).toBe('mdsvex:components');
		expect(manifest.directives[0].id).toBe('mdsvex:directives');
	});

	test('takes the directive names of a plugin, skipping one with none', () => {
		const { manifest, errors } = read(
			{
				plugins: [
					{ name: 'steps', module: './steps.js', directives: ['steps'] },
					{ module: './steps.js', directives: [] },
					{ module: 'tabs', directives: ['tabs'] },
				],
			},
			{ '/app/steps.js': {}, '/node_modules/tabs': {} }
		);
		expect(errors).toEqual([]);
		expect(manifest.plugin_data).toBe(true);
		expect(manifest.plugins).toEqual([
			{
				name: 'steps',
				directives: {
					id: 'mdsvex:plugin/0',
					file: '/app/steps.js',
					names: ['steps'],
				},
				components: null,
			},
			{
				name: 'tabs',
				directives: {
					id: 'mdsvex:plugin/2',
					file: '/node_modules/tabs',
					names: ['tabs'],
				},
				components: null,
			},
		]);
	});

	test('holds the flags as the plugin manifest does, a field only when it is on', () => {
		const on = read({
			unwrap_images: true,
			heading_ids: true,
			import_images: false,
			highlight: false,
			component_mode: 'all',
		}).manifest;
		expect(on).toMatchObject({
			unwrap_images: true,
			heading_ids: true,
			highlight: false,
			component_mode: 'all',
		});
		expect('import_images' in on).toBe(false);
		const off = read({ unwrap_images: false, heading_ids: false }).manifest;
		expect('unwrap_images' in off).toBe(false);
		expect('heading_ids' in off).toBe(false);
		expect(read({ highlight: { line_numbers: true } }).manifest.highlight).toBe(
			'twinkleplop'
		);
	});

	test('holds smart_punctuation as written, and none when it is off', () => {
		expect(read({ smart_punctuation: true }).manifest.smart_punctuation).toBe(
			true
		);
		expect(
			read({ smart_punctuation: { dashes: false } }).manifest.smart_punctuation
		).toEqual({ dashes: false });
		for (const off of [
			false,
			{ quotes: false, dashes: false, ellipses: false },
		])
			expect(
				'smart_punctuation' in read({ smart_punctuation: off }).manifest
			).toBe(false);
	});

	test('holds math as the manifest does, none for the default', () => {
		expect('math' in read({ math: {} }).manifest).toBe(false);
		expect(read({ math: false }).manifest.math).toBe(false);
		expect(read({ math: { renderer: 'katex' } }).manifest.math).toEqual({
			renderer: 'katex',
		});
		expect(
			read({ math: { options: { annotate: true } } }).manifest.math
		).toEqual({ renderer: 'temml', options: { annotate: true } });
	});

	test('lists what is wrong in the order of the keys and leaves each out', () => {
		const { manifest, errors } = read(
			{
				unwrap_images: 'yes',
				heading_ids: {},
				smart_punctuation: { quotes: ['a'] },
				math: { renderer: 'mathjax' },
				templates: { default: './Nope.svelte' },
				components: './md.js',
				plugins: [{ module: './steps.js' }],
			},
			{ '/app/md.js': { names: ['directives'] } }
		);
		expect(errors).toEqual([
			'mdsvex.config.json: unwrap_images must be true or false',
			'mdsvex.config.json: heading_ids must be true or false',
			'mdsvex.config.json: smart_punctuation.quotes must be true, false or four strings',
			`mdsvex.config.json: math.renderer must be 'temml' or 'katex', it is "mathjax"`,
			"mdsvex.config.json: templates.default points at './Nope.svelte', which does not exist",
			"/app/md.js exports directives, which must be a namespace re-export: export * as directives from './directives.js'",
			'mdsvex.config.json: plugins[0] needs a module and a list of directive names',
		]);
		expect(manifest).toMatchObject({
			templates: {},
			components: [{ id: 'mdsvex:components', file: '/app/md.js', names: [] }],
			directives: [],
			plugin_data: true,
		});
		for (const key of [
			'unwrap_images',
			'heading_ids',
			'smart_punctuation',
			'math',
		])
			expect(key in manifest).toBe(false);
	});

	test('reads anything that is not an object as no options', () => {
		expect(read([]).manifest).toEqual(read({}).manifest);
		expect(read(null).errors).toEqual([]);
	});
});
