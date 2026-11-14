import { describe, expect, test } from 'vitest';
import { module_script, read_exports } from '../src/host';
import { scan_exports_detail } from '../src/main';

// a stand in for a real stripper, enough for these lines
const strip = (code: string) =>
	code
		.split('\n')
		.filter((line) => !/^\s*export (type|interface)\b/.test(line))
		.join('\n')
		.replace(/: [\w|' ]+ =/g, ' =');

describe('read_exports', () => {
	test('reads javascript without a stripper', () => {
		expect(
			read_exports(
				"export const a = 1;\nexport * from './b.js';\nexport * as directives from './d.js';",
				'js'
			)
		).toEqual({
			names: ['a', 'directives'],
			stars: ['./b.js'],
			namespaces: [{ name: 'directives', specifier: './d.js' }],
			reexports: [],
			imports: [],
		});
	});

	test('strips typescript with the function it is given', () => {
		const calls: string[] = [];
		const code = [
			'export type Level = 1 | 2;',
			'export interface Props {}',
			"export const pre: string = 'x';",
		].join('\n');
		const result = read_exports(code, 'js', (ts) => {
			calls.push(ts);
			return strip(ts);
		});
		expect(calls).toEqual([code]);
		expect(result.names).toEqual(['pre']);
	});

	test('strips only the module script of a svelte file', () => {
		const svelte = [
			'<script lang="ts">export const instance: number = 1;</script>',
			'<script module lang="ts">',
			"export const pre: string = 'x';",
			'</script>',
		].join('\n');
		const calls: string[] = [];
		const result = read_exports(svelte, 'svelte', (ts) => {
			calls.push(ts);
			return strip(ts);
		});
		expect(calls).toEqual([module_script(svelte)]);
		expect(result.names).toEqual(['pre']);
	});

	test('calls no stripper for a svelte file without a module script', () => {
		const result = read_exports('<p>x</p>', 'svelte', () => {
			throw new Error('called');
		});
		expect(result).toEqual({
			names: [],
			stars: [],
			namespaces: [],
			reexports: [],
			imports: [],
		});
	});

	test('reads each named re-export with the name it imports', () => {
		const result = read_exports(
			[
				"import Local from './Local.static.svelte';",
				"import './side.css';",
				"export { default as callout, Badge as 'my-badge' } from './Callout.static.svelte';",
				'export { kbd } from "./kbd.js";',
				'export { Local };',
				"const later = import('./lazy.js');",
			].join('\n'),
			'js'
		);
		expect(result.reexports).toEqual([
			{
				name: 'callout',
				imported: 'default',
				specifier: './Callout.static.svelte',
			},
			{
				name: 'my-badge',
				imported: 'Badge',
				specifier: './Callout.static.svelte',
			},
			{ name: 'kbd', imported: 'kbd', specifier: './kbd.js' },
		]);
		expect(result.imports).toEqual(['./Local.static.svelte', './side.css']);
	});

	test('agrees with the scan of the vite plugin', async () => {
		const code = [
			"export { default as h1 } from './H.svelte';",
			'export type Props = { level: number };',
			"export const a: string = 'x';",
			"export * from './more.js';",
		].join('\n');
		const ts = await import('typescript');
		const transpile = (c: string) =>
			ts.default.transpileModule(c, {
				compilerOptions: { target: ts.default.ScriptTarget.ESNext },
			}).outputText;
		expect(read_exports(code, 'js', transpile)).toEqual(
			await scan_exports_detail(code, 'js')
		);
	});
});
