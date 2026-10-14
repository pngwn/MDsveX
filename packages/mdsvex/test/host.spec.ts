import { describe, expect, test } from 'vitest';
import {
	MANIFEST_VERSION,
	data_module,
	manifest_json,
	manifest_resolver,
	metadata_module,
	queue_manifest,
} from '../src/host';
import type { MdsvexManifest } from '../src/host';
import { manifest_writer } from '../src/manifest';

function manifest(): MdsvexManifest {
	return {
		version: MANIFEST_VERSION,
		root: '/app',
		extensions: ['.svx'],
		component_mode: 'markdown',
		frontmatter_parse: false,
		directive_plugins: false,
		select_template: false,
		templates: {
			default: {
				id: 'mdsvex:template/default',
				file: '/app/Layout.svelte',
				components: ['h1'],
				extra: {
					id: 'mdsvex:template/default',
					file: '/app/extra.js',
					names: ['h1', 'p'],
				},
				directives: [
					{
						id: 'mdsvex:template-directives/default',
						file: '/app/directives.js',
						names: ['note'],
					},
				],
			},
		},
		components: [
			{ id: 'mdsvex:components', file: '/app/md.js', names: ['img'] },
		],
		directives: [],
		documents: {},
		plugins: [
			{
				name: 'steps',
				directives: {
					id: 'mdsvex:plugin/0',
					file: '/app/steps.js',
					names: ['steps'],
				},
				components: null,
			},
		],
	};
}

describe('manifest_resolver', () => {
	const resolve = manifest_resolver(manifest());

	test('gives the extra module of a template the names it exports', () => {
		expect(resolve('mdsvex:template/default', 'p')).toBe('/app/extra.js');
		expect(resolve('mdsvex:template/default', 'h1')).toBe('/app/extra.js');
		expect(resolve('mdsvex:template/default', 'default')).toBe(
			'/app/Layout.svelte'
		);
		expect(resolve('mdsvex:template/default', 'em')).toBe('/app/Layout.svelte');
	});

	test('finds directives, components and plugin modules', () => {
		expect(resolve('mdsvex:template-directives/default', 'note')).toBe(
			'/app/directives.js'
		);
		expect(resolve('mdsvex:components', 'img')).toBe('/app/md.js');
		expect(resolve('mdsvex:plugin/0', 'steps')).toBe('/app/steps.js');
		expect(resolve('mdsvex:plugin/1', 'steps')).toBeUndefined();
	});
});

describe('queue_manifest', () => {
	test('writes once for many changes and not again when nothing changed', async () => {
		const writes: string[] = [];
		let current = manifest();
		const queue = queue_manifest(() => current, {
			async write(root, json) {
				writes.push(`${root} ${json}`);
			},
			failed() {},
		});
		queue.schedule();
		await queue.flush();
		queue.set_root('/app');
		queue.schedule();
		queue.schedule();
		await queue.flush();
		await queue.flush();
		expect(writes).toEqual([`/app ${manifest_json(current)}`]);
		current = { ...current, extensions: ['.md'] };
		await queue.flush();
		expect(writes).toHaveLength(2);
	});

	test('reports the first failure and writes again after it', async () => {
		const failures: unknown[] = [];
		let fail = true;
		let n = 0;
		let wrote = 0;
		const queue = queue_manifest(
			() => ({ ...manifest(), documents: { [String(n++)]: null } }),
			{
				async write() {
					if (fail) throw new Error('read only');
					wrote++;
				},
				failed(e) {
					failures.push((e as Error).message);
				},
			}
		);
		queue.set_root('/app');
		await queue.flush();
		await queue.flush();
		expect(failures).toEqual(['read only']);
		fail = false;
		await queue.flush();
		expect(wrote).toBe(1);
		expect(failures).toHaveLength(1);
	});

	test('the plugin warns with the file it could not write', async () => {
		const warnings: string[] = [];
		const writer = manifest_writer(manifest, (m) => warnings.push(m));
		writer.set_root('/dev/null/not-a-dir');
		await writer.flush();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(
			/^could not write .*not-a-dir.*manifest\.json for editor tooling: /
		);
	});
});

describe('query modules', () => {
	test('build the modules of ?metadata and ?data', () => {
		expect(metadata_module('---\ntitle: a\n---\n\n# x\n', undefined)).toBe(
			'export const metadata = {"title":"a"};\nexport default metadata;\n'
		);
		expect(data_module(undefined, undefined)).toBe(
			'export const metadata = undefined;\nexport const plugin_data = undefined;\nexport default { metadata, plugin_data };\n'
		);
	});
});
