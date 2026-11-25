import { describe, expect, it } from 'vitest';
import {
	as_bundle,
	components_module,
	find_directives,
	find_plugins,
	plugins_entry,
} from '../src/workers/plugins';
import { compile_markdown_settled, prepare } from '../src/workers/mdsvex';

const FILES = [
	'App.svx',
	'directives/kbd.svelte',
	'directives/not-a-name.svelte',
	'directives/nested/deep.svelte',
	'plugins/shout/plugin.js',
	'plugins/shout/shout.svelte',
	'plugins/shout/Loud.svelte',
	'plugins/links/plugin.ts',
	'plugins/only/part.svelte',
	'plugins/loose.js',
];

describe('the files the repl registers', () => {
	it('finds a plugin by its folder, with the components beside it', () => {
		expect(find_plugins(FILES)).toEqual([
			{ name: 'links', file: 'plugins/links/plugin.ts', components: [] },
			{
				name: 'only',
				file: null,
				components: [{ name: 'part', file: 'plugins/only/part.svelte' }],
			},
			{
				name: 'shout',
				file: 'plugins/shout/plugin.js',
				components: [
					{ name: 'Loud', file: 'plugins/shout/Loud.svelte' },
					{ name: 'shout', file: 'plugins/shout/shout.svelte' },
				],
			},
		]);
	});

	it('finds the directives folder, a name javascript can not bind is left out', () => {
		expect(find_directives(FILES)).toEqual([
			{ name: 'kbd', file: 'directives/kbd.svelte' },
		]);
	});

	it('imports each plugin file under the name of its folder', () => {
		const entry = plugins_entry(find_plugins(FILES));
		expect(entry).toContain(`import p0 from "./plugins/links/plugin.ts";`);
		expect(entry).toContain(`export default [["links", p0], ["only", {}], ["shout", p2]];`);
	});

	it('exports each component under its name, after the module a plugin brought', () => {
		expect(
			components_module([{ name: 'kbd', file: 'directives/kbd.svelte' }], '@acme/directives')
		).toBe(
			`export * from "@acme/directives";\n` +
				`export { default as kbd } from "virtual://$/directives/kbd.svelte";\n`
		);
	});
});

describe('what a plugin file exports', () => {
	it('names a bundle after its folder', () => {
		expect(as_bundle('shout', { directives: { shout: {} } })).toEqual({
			name: 'shout',
			directives: { shout: {} },
		});
	});

	it('keeps the name a bundle has', () => {
		expect(as_bundle('folder', { name: 'toc', parse: {} }).name).toBe('toc');
	});

	it('calls a function for its plugin', () => {
		expect(as_bundle('made', () => ({ fences: ['x'] }))).toEqual({
			name: 'made',
			fences: ['x'],
		});
	});

	it('takes an object with no key of a bundle as a parse plugin', () => {
		const heading = { parse() {} };
		expect(as_bundle('links', { heading })).toEqual({
			name: 'links',
			parse: { heading },
		});
	});

	it('throws for anything else', () => {
		expect(() => as_bundle('bad', 3)).toThrow('plugins/bad/plugin.js');
	});
});

describe('a compile with them', () => {
	it('imports a file of directives/ for the directive of its name', async () => {
		const files = new Map([
			['App.svx', 'Press :kbd[S].'],
			['directives/kbd.svelte', ''],
		]);
		const { options } = prepare(files);
		const { code } = await compile_markdown_settled('Press :kbd[S].', 'App.svx', options, files);
		expect(code).toContain(`from 'virtual://$/__directives.js'`);
	});

	it('waits for what a plugin deferred', async () => {
		const plugin = as_bundle('late', {
			paragraph: {
				parse(node: any, ctx: any) {
					ctx.defer(node, async (node: any) => {
						await new Promise((r) => setTimeout(r, 5));
						node.attrs.class = 'late';
					});
				},
			},
		});
		const { code } = await compile_markdown_settled('hello', 'App.svx', {
			plugins: [plugin],
		});
		expect(code).toContain('late');
	});
});
