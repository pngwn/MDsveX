import { callouts, CalloutsError } from '@mdsvex/plugin-callouts';
import type { CalloutsOptions } from '@mdsvex/plugin-callouts';
import { compile, compile_text } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import {
	expect_parity,
	PATHS,
} from '../../../packages/parse/test/plugin_harness';

function setup(options?: CalloutsOptions) {
	return () => ({
		directive_handlers: [
			{ name: 'callouts', directives: callouts(options).directives! },
		],
	});
}

/** the tree on both builders, whole and fed in chunks, directive names and args printed */
function tree(source: string, options?: CalloutsOptions): unknown {
	return expect_parity(source, setup(options), { attrs: ['name', 'args'] });
}

/** the warning codes of a document, the same on every path */
function warnings(source: string): string[] {
	let first: string[] | undefined;
	for (const [name, run] of PATHS) {
		const found = run(source, setup()()).dispatcher!.warnings ?? [];
		const codes = found.map((warning) => warning.code);
		if (first === undefined) first = codes;
		else expect(codes, name).toEqual(first);
	}
	return first!;
}

function container(name: string, args: Record<string, string>): string {
	return `directive_container name="${name}" args=${JSON.stringify(args)}`;
}

describe('kinds', () => {
	test.each([
		['note', 'Note'],
		['tip', 'Tip'],
		['important', 'Important'],
		['warning', 'Warning'],
		['caution', 'Caution'],
	])('%s gets its kind and its default title', (kind, title) => {
		expect(warnings(`:::${kind}\nBody.\n:::\n`)).toEqual([]);
		expect(tree(`:::${kind}\nBody.\n:::\n`)).toEqual([
			'root',
			[container(kind, { kind, title }), ['paragraph', 'text:Body.']],
		]);
	});

	test('the label is a custom title, the default stays as the name of the kind', () => {
		expect(tree(':::warning[Breaking _change_]\n- one\n:::\n')).toEqual([
			'root',
			[
				container('warning', { kind: 'warning', title: 'Warning' }),
				['directive_label', 'text:Breaking ', ['emphasis', 'text:change']],
				['list', ['list_item', 'text:one']],
			],
		]);
	});

	test('an empty callout is its title alone', () => {
		expect(warnings(':::tip\n:::\n')).toEqual([]);
		expect(tree(':::tip\n:::\n')).toEqual([
			'root',
			container('tip', { kind: 'tip', title: 'Tip' }),
		]);
	});

	test('callouts nest, and hold block quotes and other directives', () => {
		const source = [
			'::::caution',
			'> quoted',
			'',
			':::note[Inner]',
			'held',
			':::',
			'::::',
			'',
		].join('\n');
		expect(tree(source)).toEqual([
			'root',
			[
				container('caution', { kind: 'caution', title: 'Caution' }),
				['block_quote', ['paragraph', 'text:quoted']],
				[
					container('note', { kind: 'note', title: 'Note' }),
					['directive_label', 'text:Inner'],
					['paragraph', 'text:held'],
				],
			],
		]);
	});

	test('a kind and title written as args are the ones of the plugin', () => {
		expect(tree(':::note(kind=tip, title=Mine, open=yes)\n:::\n')).toEqual([
			'root',
			container('note', { kind: 'note', title: 'Note', open: 'yes' }),
		]);
	});

	test('a leaf or an inline callout warns', () => {
		expect(warnings('::note[Hi]\n')).toEqual(['not_container']);
		expect(warnings('A :warning[word] here.\n')).toEqual(['not_container']);
	});
});

describe('options', () => {
	test('titles replace the default of a kind, the others stay English', () => {
		expect(
			tree(':::note\n:::\n\n:::tip\n:::\n', {
				titles: { note: 'Remarque' },
			})
		).toEqual([
			'root',
			container('note', { kind: 'note', title: 'Remarque' }),
			container('tip', { kind: 'tip', title: 'Tip' }),
		]);
	});

	test('a title for no kind throws', () => {
		expect(() => callouts({ titles: { info: 'Info' } as never })).toThrow(
			CalloutsError
		);
		expect(() => callouts({ titles: { info: 'Info' } as never })).toThrow(
			'titles has a key "info" that is no kind of callout, the kinds are note, tip, important, warning, caution'
		);
	});

	test('an empty title throws', () => {
		expect(() => callouts({ titles: { tip: ' ' } })).toThrow(
			'titles.tip must be a string that is not empty'
		);
	});

	test('css false picks the unstyled module', () => {
		expect(callouts().module).toBe('@mdsvex/plugin-callouts/directives');
		expect(callouts({ css: false }).module).toBe(
			'@mdsvex/plugin-callouts/directives/unstyled'
		);
	});
});

describe('compile', () => {
	test('every kind renders the one component, by its directive name', () => {
		const { code } = compile(':::note\nA\n:::\n\n:::warning[Mind]\nB\n:::\n', {
			plugins: [callouts()],
		});
		expect(code).toContain(
			"import { note as Note_MDSVEX_D_G, warning as Warning_MDSVEX_D_G } from '@mdsvex/plugin-callouts/directives';"
		);
		expect(code).toContain('<Note_MDSVEX_D_G kind="note" title="Note">');
		expect(code).toContain(
			'<Warning_MDSVEX_D_G kind="warning" title="Warning">'
		);
	});
});

describe('plain text', () => {
	test('a callout reads as its title and then its body', async () => {
		const { text } = await compile_text(
			':::note\nBody.\n:::\n\n:::warning[Breaking change]\nMore.\n:::\n',
			{ plugins: [callouts()] }
		);
		expect(text).toBe(
			['Note', 'Body.', 'Breaking change', 'More.'].join('\n\n')
		);
	});

	test('a translated title is what the text reads', async () => {
		const { text } = await compile_text(':::caution\nHot.\n:::\n', {
			plugins: [callouts({ titles: { caution: 'Achtung' } })],
		});
		expect(text).toBe('Achtung\n\nHot.');
	});
});
