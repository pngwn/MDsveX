import { elements } from '@mdsvex/plugin-elements';
import { compile } from 'mdsvex';
import { describe, expect, test } from 'vitest';

import {
	expect_parity,
	PATHS,
} from '../../../packages/parse/test/plugin_harness';

function setup() {
	return {
		directive_handlers: [
			{ name: 'elements', directives: elements().directives! },
		],
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
			'A plugin.',
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
					['paragraph', 'text:A plugin.'],
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

describe('mark, ins and abbr', () => {
	test('need no handler and keep the inline markup in their brackets', () => {
		const source =
			'A :mark[_key_ `term`] and :ins[new :kbd[Ctrl]](datetime=2026-10-28, cite=https://example.com/a), ' +
			':abbr[HTML](title="HyperText Markup Language").\n';
		expect(warnings(source)).toEqual([]);
		expect(tree(source)).toEqual(plain(source));
		expect(tree(source)).toEqual([
			'root',
			[
				'paragraph',
				'text:A ',
				[
					'directive_inline name="mark"',
					['emphasis', 'text:key'],
					'text: ',
					'code_span',
				],
				'text: and ',
				[
					'directive_inline name="ins" args=' +
						JSON.stringify({
							datetime: '2026-10-28',
							cite: 'https://example.com/a',
						}),
					'text:new ',
					['directive_inline name="kbd"', 'text:Ctrl'],
				],
				'text:, ',
				[
					'directive_inline name="abbr" args=' +
						JSON.stringify({ title: 'HyperText Markup Language' }),
					'text:HTML',
				],
				'text:.',
			],
		]);
	});

	test('an abbr without a title warns', () => {
		expect(warnings('An :abbr[HTML](title=Markup).\n')).toEqual([]);
		expect(warnings('An :abbr[HTML] and :abbr[CSS](lang=en).\n')).toEqual([
			'abbr_without_title',
			'abbr_without_title',
		]);
	});

	test('an abbr whose bracket never closes is text and does not warn', () => {
		expect(warnings('An :abbr[HTML\n')).toEqual([]);
	});
});

describe('compile', () => {
	const IMPORT = "from '@mdsvex/plugin-elements/directives';";

	test('imports only the components a document uses', () => {
		const { code } = compile('Press :kbd[Ctrl].\n', { plugins: [elements()] });
		expect(code).toBe(
			[
				'<script>',
				"import { kbd as Kbd_MDSVEX_D_G } from '@mdsvex/plugin-elements/directives';",
				'</script><p>Press <Kbd_MDSVEX_D_G>Ctrl</Kbd_MDSVEX_D_G>.</p>',
			].join('\n')
		);
	});

	test('css false imports the components without the stylesheet', () => {
		expect(
			compile('Press :kbd[Ctrl].\n', { plugins: [elements({ css: false })] })
				.code
		).toContain("from '@mdsvex/plugin-elements/directives/unstyled';");
	});

	test('an accordion renders a details for each heading', () => {
		const { code } = compile(
			':::accordion[FAQ](name=faq)\n## One\n\nBody.\n\n## Two\n:::\n',
			{ plugins: [elements()], heading_ids: true }
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

	test('ruby passes its reading', () => {
		expect(
			compile(':ruby[漢字](rt=かんじ)\n', { plugins: [elements()] }).code
		).toContain('<Ruby_MDSVEX_D_G rt="かんじ">漢字</Ruby_MDSVEX_D_G>');
	});

	test('mark, ins and abbr pass their args', () => {
		const { code } = compile(
			':mark[hot] :ins[added](datetime=2026-10-28, cite=https://example.com/a) :abbr[HTML](title="HyperText Markup Language")\n',
			{ plugins: [elements()] }
		);
		expect(code).toBe(
			[
				'<script>',
				'import { mark as Mark_MDSVEX_D_G, ins as Ins_MDSVEX_D_G, abbr as Abbr_MDSVEX_D_G } ' +
					IMPORT,
				'</script><p><Mark_MDSVEX_D_G>hot</Mark_MDSVEX_D_G> ' +
					'<Ins_MDSVEX_D_G datetime="2026-10-28" cite="https://example.com/a">added</Ins_MDSVEX_D_G> ' +
					'<Abbr_MDSVEX_D_G title="HyperText Markup Language">HTML</Abbr_MDSVEX_D_G></p>',
			].join('\n')
		);
	});

	test('warnings come back with the plugin and the line', () => {
		const { warnings: found } = compile(
			':::accordion\n:::\n\nA :ruby[x].\n\nAn :abbr[x].\n',
			{
				plugins: [elements()],
			}
		);
		expect(
			found?.map((warning) => [
				warning.code,
				warning.plugin,
				warning.start.line,
			])
		).toEqual([
			['no_items', 'elements', 1],
			['ruby_without_rt', 'elements', 4],
			['abbr_without_title', 'elements', 6],
		]);
	});

	test('a document without the directives imports nothing', () => {
		expect(compile('## Plain\n', { plugins: [elements()] }).code).toBe(
			'<h2>Plain</h2>'
		);
	});
});
