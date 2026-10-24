import { kit } from '@mdsvex/plugin-kit';
import { compile } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import {
	expect_parity,
	PATHS,
} from '../../../packages/parse/test/plugin_harness';

function setup() {
	return {
		directive_handlers: [{ name: 'kit', directives: kit().directives! }],
	};
}

/** the tree on both builders, whole and fed in chunks, directive names and args printed */
function tree(source: string): unknown {
	return expect_parity(source, setup, { attrs: ['name', 'args'] });
}

/** the tree the parser builds with no plugin */
function plain(source: string): unknown {
	return expect_parity(source, () => [], { attrs: ['name', 'args'] });
}

/** the warning codes of a document, the same on every path */
function warnings(source: string): string[] {
	let first: string[] | undefined;
	for (const [name, run] of PATHS) {
		const found = run(source, setup()).dispatcher!.warnings ?? [];
		const codes = found.map((warning) => warning.code);
		if (first === undefined) first = codes;
		else expect(codes, name).toEqual(first);
	}
	return first!;
}

const ACCORDION = 'directive_container name="accordion"';

function item(
	label: unknown[],
	args: Record<string, string> | undefined,
	...body: unknown[]
): unknown {
	return [
		'directive_container name="details"' +
			(args === undefined ? '' : ' args=' + JSON.stringify(args)),
		label.length === 0 ? 'directive_label' : ['directive_label', ...label],
		...body,
	];
}

describe('accordion', () => {
	test('each heading starts an item, its text is the summary', () => {
		const source = [
			':::accordion',
			'',
			'## What *is* it',
			'',
			'A kit.',
			'',
			'### Deeper',
			'',
			'## Why',
			'',
			'- one',
			':::',
			'',
			'after',
			'',
		].join('\n');
		expect(warnings(source)).toEqual([]);
		expect(tree(source)).toEqual([
			'root',
			[
				ACCORDION,
				item(
					['text:What ', ['strong_emphasis', 'text:is'], 'text: it'],
					undefined,
					['paragraph', 'text:A kit.'],
					['heading', 'text:Deeper']
				),
				item(['text:Why'], undefined, ['list', ['list_item', 'text:one']]),
			],
			['paragraph', 'text:after'],
		]);
	});

	test('a name is given to every item, so one is open at a time', () => {
		expect(
			tree(':::accordion[FAQ](name=faq)\n## One\n\n## Two\n:::\n')
		).toEqual([
			'root',
			[
				ACCORDION + ' args={"name":"faq"}',
				['directive_label', 'text:FAQ'],
				item(['text:One'], { name: 'faq' }),
				item(['text:Two'], { name: 'faq' }),
			],
		]);
	});

	test('a details written out is an item of its own', () => {
		const source = [
			'::::accordion(name=faq)',
			'## One',
			'',
			':::details[Two](open=true)',
			'body',
			':::',
			'',
			':::details[Three](name=own)',
			':::',
			'',
			'## Four',
			'::::',
			'',
		].join('\n');
		expect(warnings(source)).toEqual([]);
		expect(tree(source)).toEqual([
			'root',
			[
				ACCORDION + ' args={"name":"faq"}',
				item(['text:One'], { name: 'faq' }),
				item(['text:Two'], { open: 'true', name: 'faq' }, [
					'paragraph',
					'text:body',
				]),
				item(['text:Three'], { name: 'own' }),
				item(['text:Four'], { name: 'faq' }),
			],
		]);
	});

	test('a heading in a block quote or a nested directive starts no item', () => {
		const source =
			':::accordion\n## One\n\n> ## Quoted\n\n::::details[Inner]\n## Inside\n::::\n:::\n';
		const found = tree(source) as unknown[];
		const one = (found[1] as unknown[])[1] as unknown[];
		expect(one[2]).toEqual(['block_quote', ['heading', 'text:Quoted']]);
	});

	test('accordions nest, each splits on its own depth', () => {
		expect(
			tree('::::accordion\n## A\n\n:::accordion\n### B\n:::\n\n## C\n::::\n')
		).toEqual([
			'root',
			[
				ACCORDION,
				item(['text:A'], undefined, [ACCORDION, item(['text:B'], undefined)]),
				item(['text:C'], undefined),
			],
		]);
	});

	test('a container with no items warns and keeps its content', () => {
		for (const source of [
			':::accordion\n:::\n',
			':::accordion\nJust text.\n:::\n',
		]) {
			expect(warnings(source)).toEqual(['no_items']);
			expect(tree(source)).toEqual(plain(source));
		}
	});

	test('content before the first item stays where it was written', () => {
		const source = ':::accordion\nBefore.\n\n## One\n:::\n';
		expect(warnings(source)).toEqual(['content_before_first_item']);
		expect(tree(source)).toEqual([
			'root',
			[ACCORDION, ['paragraph', 'text:Before.'], item(['text:One'], undefined)],
		]);
		expect(warnings(':::accordion[Label]\n## One\n:::\n')).toEqual([]);
	});

	test('an empty heading leaves the summary to the browser', () => {
		expect(warnings(':::accordion\n##\n\nbody\n:::\n')).toEqual([
			'item_without_label',
		]);
	});

	test('an unclosed container closes its last item at the end of input', () => {
		expect(tree(':::accordion\n## One\n\nbody\n\n## Two\n\nmore')).toEqual([
			'root',
			[
				ACCORDION,
				item(['text:One'], undefined, ['paragraph', 'text:body']),
				item(['text:Two'], undefined, ['paragraph', 'text:more']),
			],
		]);
	});

	test('a summary with a delimiter that never closes keeps it as text', () => {
		const source = ':::accordion\n## One *open\n\n## [Two](\n:::\n';
		expect(warnings(source)).toEqual([]);
		expect(tree(source)).toEqual([
			'root',
			[
				ACCORDION,
				item(['text:One *open'], undefined),
				item(['text:[Two]('], undefined),
			],
		]);
	});
});

describe('details, kbd, ruby and badges', () => {
	test('need no handler, the tree is the one the parser builds', () => {
		for (const source of [
			':::details[More](open=true)\nHidden.\n:::\n',
			'Press :kbd[Ctrl]+:kbd[C] for :badge[new](tone=tip).\n',
		]) {
			expect(warnings(source)).toEqual([]);
			expect(tree(source)).toEqual(plain(source));
		}
	});

	test('ruby without a reading warns', () => {
		expect(warnings('A :ruby[漢字](rt=かんじ).\n')).toEqual([]);
		expect(warnings('A :ruby[漢字] and :ruby[字](rt=).\n')).toEqual([
			'ruby_without_rt',
			'ruby_without_rt',
		]);
	});

	test('a ruby whose bracket never closes is text and does not warn', () => {
		expect(warnings('A :ruby[漢字\n')).toEqual([]);
	});
});

describe('embeds', () => {
	test('the label is the title of the frame', () => {
		expect(tree('::youtube[A *talk*](id=dQw4w9WgXcQ, start=30)\n')).toEqual([
			'root',
			[
				'directive_leaf name="youtube" args={"id":"dQw4w9WgXcQ","start":"30","title":"A talk"}',
				['directive_label', 'text:A ', ['strong_emphasis', 'text:talk']],
			],
		]);
	});

	test('a title written as an arg is kept', () => {
		expect(tree('::vimeo[Label](id=76979871, title=Mine)\n')).toEqual([
			'root',
			[
				'directive_leaf name="vimeo" args={"id":"76979871","title":"Mine"}',
				['directive_label', 'text:Label'],
			],
		]);
	});

	test('a missing or malformed id and a missing title warn', () => {
		expect(warnings('::youtube[A talk](id=dQw4w9WgXcQ)\n')).toEqual([]);
		expect(warnings('::youtube[A talk]\n')).toEqual(['embed_id']);
		expect(warnings('::youtube[A talk](id=short)\n')).toEqual(['embed_id']);
		expect(warnings('::vimeo[A talk](id=abc)\n')).toEqual(['embed_id']);
		expect(warnings('::vimeo(id=76979871)\n')).toEqual(['embed_without_title']);
	});
});

describe('compile', () => {
	const IMPORT = "from '@mdsvex/plugin-kit/directives';";

	test('imports only the components a document uses', () => {
		const { code } = compile('Press :kbd[Ctrl].\n', { plugins: [kit()] });
		expect(code).toBe(
			[
				'<script>',
				"import { kbd as Kbd_MDSVEX_D_G } from '@mdsvex/plugin-kit/directives';",
				'</script><p>Press <Kbd_MDSVEX_D_G>Ctrl</Kbd_MDSVEX_D_G>.</p>',
			].join('\n')
		);
	});

	test('css false imports the components without the stylesheet', () => {
		expect(
			compile('Press :kbd[Ctrl].\n', { plugins: [kit({ css: false })] }).code
		).toContain("from '@mdsvex/plugin-kit/directives/unstyled';");
	});

	test('an accordion renders a details for each heading', () => {
		const { code } = compile(
			':::accordion[FAQ](name=faq)\n## One\n\nBody.\n\n## Two\n:::\n',
			{ plugins: [kit()], heading_ids: true }
		);
		expect(code).toBe(
			[
				'<script>',
				'import { accordion as Accordion_MDSVEX_D_G, details as Details_MDSVEX_D_G } ' +
					IMPORT,
				'</script><Accordion_MDSVEX_D_G name="faq">{#snippet label()}FAQ{/snippet}',
				'<Details_MDSVEX_D_G name="faq">{#snippet label()}One{/snippet}',
				'<p>Body.</p>',
				'</Details_MDSVEX_D_G><Details_MDSVEX_D_G name="faq">{#snippet label()}Two{/snippet}</Details_MDSVEX_D_G>',
				'</Accordion_MDSVEX_D_G>',
			].join('\n')
		);
	});

	test('the title of an embed is the text a reader sees, an expression leaves none', () => {
		const { code } = compile('::youtube[A {b} talk](id=dQw4w9WgXcQ)\n', {
			plugins: [kit()],
		});
		expect(code).toContain(
			'id="dQw4w9WgXcQ" title="A talk">{#snippet label()}A {b} talk{/snippet}'
		);
		expect(
			compile('::youtube[A \\{b\\} talk](id=dQw4w9WgXcQ)\n', {
				plugins: [kit()],
			}).code
		).toContain('title={"A {b} talk"}');
	});

	test('ruby passes its reading', () => {
		expect(
			compile(':ruby[漢字](rt=かんじ)\n', { plugins: [kit()] }).code
		).toContain('<Ruby_MDSVEX_D_G rt="かんじ">漢字</Ruby_MDSVEX_D_G>');
	});

	test('warnings come back with the plugin and the line', () => {
		const { warnings: found } = compile(
			':::accordion\n:::\n\nA :ruby[x].\n\n::youtube[](id=no)\n',
			{ plugins: [kit()] }
		);
		expect(
			found?.map((warning) => [
				warning.code,
				warning.plugin,
				warning.start.line,
			])
		).toEqual([
			['no_items', 'kit', 1],
			['ruby_without_rt', 'kit', 4],
			['embed_id', 'kit', 6],
			['embed_without_title', 'kit', 6],
		]);
	});

	test('a document without the directives imports nothing', () => {
		expect(compile('## Plain\n', { plugins: [kit()] }).code).toBe(
			'<h2>Plain</h2>'
		);
	});
});
