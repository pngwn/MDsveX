import {
	AND,
	mixed_kinds,
	numbering,
	prefix_arg,
	PREFIXES,
	ref_parts,
} from '@mdsvex/plugin-numbering';
import type {
	NumberingOptions,
	RefWords,
	Target,
} from '@mdsvex/plugin-numbering';
import { compile, HeadingIdError } from 'mdsvex';
import type { Bundle } from 'mdsvex';
import { load_math } from 'mdsvex/math';
import { describe, expect, test } from 'vitest';

import { HeadingIds, heading_slug } from '../../../packages/parse/src/main';
import { PATHS } from '../../../packages/parse/test/plugin_harness';

const NONE = 0xffffffff;

/** the figure of the kit as a compile sees it, a directive whose component another bundle gives */
const FIGURES: Bundle = {
	name: 'figures',
	module: '@mdsvex/plugin-kit/figures',
	directives: { figure: {} },
};

function run(source: string, options?: NumberingOptions) {
	return compile(source, {
		heading_ids: true,
		plugins: [FIGURES, numbering(options)],
	});
}

/** the targets by id, as `kind number text` */
function targets(source: string, options?: NumberingOptions): string[] {
	const data = run(source, options).data?.numbering ?? {};
	return Object.entries(data).map(
		([key, t]) =>
			`${key.slice(7)} ${(t as Target).number} ${(t as Target).text}`
	);
}

function codes(source: string, options?: NumberingOptions): string[] {
	return (run(source, options).warnings ?? []).map(
		(w) => `${w.code} ${w.message}`
	);
}

const DOC = [
	'# Title',
	'',
	'## Results',
	'',
	':::figure[Sales by month](id=fig:sales)',
	'![chart](./sales.png)',
	':::',
	'',
	':::table[What each plan costs](id=tbl:plans)',
	'| plan | price |',
	'| --- | --- |',
	'| free | 0 |',
	':::',
	'',
	'```math id=eq:energy',
	'E = mc^2',
	'```',
	'',
	'### Detail',
	'',
	'::figure[Costs](id=fig:costs)',
	'',
	'See :ref[fig:sales], :ref[fig:sales, fig:costs], :ref[tbl:plans, eq:energy] and :ref[sec:detail].',
	'',
].join('\n');

describe('targets', () => {
	test('each kind is numbered in document order, its own count', () => {
		expect(targets(DOC)).toEqual([
			'sec:results 1 Section 1',
			'fig:sales 1 Figure 1',
			'tbl:plans 1 Table 1',
			'eq:energy 1 Equation 1',
			'sec:detail 1.1 Section 1.1',
			'fig:costs 2 Figure 2',
		]);
	});

	test('the document exports them for components to read', () => {
		expect(run(DOC).code).toContain(
			'export const plugin_data = {"numbering":{"target:sec:results":{"kind":"sec","number":"1","text":"Section 1"}'
		);
	});

	test('a figure or table without a numbered id is not numbered', () => {
		expect(
			targets(
				':::figure[A]\nx\n:::\n\n:::figure[B](id=chart)\nx\n:::\n\n:::figure[C](id=tbl:wrong)\nx\n:::\n\n:::table[D]\n| a |\n| - |\n:::\n'
			)
		).toEqual([]);
	});

	test('one without a caption is numbered all the same', () => {
		expect(
			targets(':::figure(id=fig:a)\nx\n:::\n\n::table(id=tbl:b)\n')
		).toEqual(['fig:a 1 Figure 1', 'tbl:b 1 Table 1']);
		expect(codes(':::figure(id=fig:a)\nx\n:::\n')).toEqual([]);
	});

	test('a math fence without an eq: id, and any other fence, is not numbered', () => {
		expect(
			targets(
				'```math\na\n```\n\n```math id=x\nb\n```\n\n```js id=eq:c\nc\n```\n'
			)
		).toEqual([]);
	});

	test('sections count from section_depth, deeper ones nest and a skipped level is 0', () => {
		expect(targets('# T\n\n## A\n\n#### Deep\n\n## B\n\n### B1\n')).toEqual([
			'sec:a 1 Section 1',
			'sec:deep 1.0.1 Section 1.0.1',
			'sec:b 2 Section 2',
			'sec:b1 2.1 Section 2.1',
		]);
		expect(targets('# T\n\n## A\n', { section_depth: 1 })).toEqual([
			'sec:t 1 Section 1',
			'sec:a 1.1 Section 1.1',
		]);
	});

	test('a heading with no id is no target', () => {
		const { data } = compile('## A\n\n:ref[sec:a]\n', {
			plugins: [numbering()],
		});
		expect(data).toBeUndefined();
	});

	test('a target id given twice is a HeadingIdError', () => {
		expect(() =>
			run(
				':::figure[A](id=fig:a)\nx\n:::\n\n:::table[B](id=fig:a)\n| a |\n| - |\n:::\n\n:::figure[C](id=fig:a)\nx\n:::\n'
			)
		).toThrow(HeadingIdError);
		expect(() =>
			run(
				'## Install\n\n```math id=install\nx\n```\n\n```math id=eq:a\nx\n```\n\n```math id=eq:a\ny\n```\n'
			)
		).toThrow(HeadingIdError);
	});
});

describe('the markup', () => {
	test('a table is the plugin directive with its id and caption', () => {
		expect(
			run(':::table[Plans](id=tbl:p)\n| a |\n| - |\n:::\n').code
		).toContain(
			'<Table_MDSVEX_D_G id="tbl:p">{#snippet label()}Plans{/snippet}'
		);
	});

	test('a reference hands its component its ids, the words of their kinds and its prefix', () => {
		expect(
			run(':ref[fig:a, fig:b, other](prefix="Bar chart")\n').code
		).toContain(
			'<Ref_MDSVEX_D_G prefix="Bar chart" ids="[&quot;fig:a&quot;,&quot;fig:b&quot;,&quot;other&quot;]" prefixes={"{\\"fig\\":[\\"Figure\\",\\"Figures\\"]}"} and="and">'
		);
	});

	test('an equation is wrapped in an element with its id and tagged with its number', () => {
		expect(
			run('```math id=eq:a\nE = mc^2\n```\n\n```math id=eq:b\nx\n```\n').code
		).toBe(
			'<script>\n' +
				"import { setContext as set_context_MDSVEX } from 'svelte';\n" +
				"set_context_MDSVEX(Symbol.for('mdsvex.plugin_data'), { current: plugin_data });\n" +
				'</script><script module>\n' +
				'export const plugin_data = {"numbering":{"target:eq:a":{"kind":"eq","number":"1","text":"Equation 1"},"target:eq:b":{"kind":"eq","number":"2","text":"Equation 2"}}};\n' +
				'</script><div id="eq:a" class="equation"><pre><code class="language-math">E = mc^2\\tag&#123;1&#125;</code></pre></div>' +
				'<div id="eq:b" class="equation"><pre><code class="language-math">x\\tag&#123;2&#125;</code></pre></div>'
		);
	});

	test('the math renderer shows the number beside the equation', async () => {
		const { code } = compile('```math id=eq:a\nE = mc^2\n```\n', {
			plugins: [numbering()],
			math: await load_math(),
		});
		expect(code).toContain(
			'<div id="eq:a" class="equation"><div class="math math-display"'
		);
		expect(code).toContain('<mtext class="tml-tag">(1)</mtext>');
	});

	test('number_sections puts the number in front of each heading, the id is made from the text', () => {
		expect(
			run('# Title\n\n## Install\n\n### With npm\n', { number_sections: true })
				.code
		).toContain(
			'<h1 id="title">Title</h1><h2 id="install"><span class="section-number">1</span> Install</h2><h3 id="with-npm"><span class="section-number">1.1</span> With npm</h3>'
		);
	});
});

describe('warnings', () => {
	test('a reference to no target, to no kind, or with no id', () => {
		expect(
			codes(
				'## A\n\n:ref[fig:nope] :ref[sec:a] :ref[thing] :ref[ ]\n\n:::figure[F](id=fig:f)\nx\n:::\n\n:ref[fig:f]\n'
			)
		).toEqual([
			'no_id :ref names no id, write :ref[fig:id]',
			'unknown_target fig:nope names no numbered figure of this document',
			'unknown_kind thing names no kind of target, an id starts with fig:, tbl:, eq:, sec:',
		]);
	});

	test('a reference as a leaf or a container', () => {
		expect(
			(run('::ref[fig:a]\n\n:::ref\nx\n:::\n').warnings ?? []).map(
				(w) => w.code
			)
		).toEqual(['not_inline', 'not_inline']);
	});

	test('a reference that mixes kinds', () => {
		expect(
			codes(
				':ref[fig:a, tbl:b](prefix=Item)\n\n::figure[A](id=fig:a)\n\n::table[B](id=tbl:b)\n'
			)
		).toEqual([
			'mixed_kinds :ref[fig:a, tbl:b] names targets of several kinds, each reads with its own word and a prefix is ignored, write one :ref for each kind',
		]);
	});

	test('a reference before its target is fine', () => {
		expect(
			codes(':ref[fig:later]\n\n:::figure[Later](id=fig:later)\nx\n:::\n')
		).toEqual([]);
	});
});

describe('what a reference reads as', () => {
	const data: Record<string, Target> = {
		'fig:a': { kind: 'fig', number: '1', text: 'Figure 1' },
		'fig:b': { kind: 'fig', number: '2', text: 'Figure 2' },
		'fig:c': { kind: 'fig', number: '3', text: 'Figure 3' },
		'tbl:t': { kind: 'tbl', number: '1', text: 'Table 1' },
		'sec:install': { kind: 'sec', number: '1.2', text: 'Section 1.2' },
	};
	const read = (ids: string[], words: Partial<RefWords> = {}) =>
		ref_parts(ids, { prefixes: PREFIXES, and: AND, ...words }, (id) => data[id])
			.map((p) => (p.href ? `[${p.text}](${p.href})` : p.text))
			.join('');

	test('one target is one link, word and number', () => {
		expect(read(['fig:a'])).toBe('[Figure 1](#fig:a)');
		expect(read(['sec:install'])).toBe('[Section 1.2](#install)');
	});

	test('several of a kind share the plural word, each number a link', () => {
		expect(read(['fig:a', 'fig:b'])).toBe(
			'Figures [1](#fig:a) and [2](#fig:b)'
		);
		expect(read(['fig:a', 'fig:b', 'fig:c'])).toBe(
			'Figures [1](#fig:a), [2](#fig:b) and [3](#fig:c)'
		);
	});

	test('a prefix is the word as written, false leaves it out', () => {
		expect(read(['fig:a'], { prefix: 'Chart' })).toBe('[Chart 1](#fig:a)');
		expect(read(['fig:a'], { prefix: 'Bar chart' })).toBe(
			'[Bar chart 1](#fig:a)'
		);
		expect(read(['fig:a', 'fig:b'], { prefix: 'Charts' })).toBe(
			'Charts [1](#fig:a) and [2](#fig:b)'
		);
		expect(read(['fig:a'], { prefix: false })).toBe('[1](#fig:a)');
		expect(read(['fig:a', 'fig:b'], { prefix: false })).toBe(
			'[1](#fig:a) and [2](#fig:b)'
		);
		expect(read(['fig:later'], { prefix: false })).toBe('?');
	});

	test('only the literal false turns the word off', () => {
		expect(prefix_arg('false')).toBe(false);
		for (const value of ['False', 'no', '0', 'none'])
			expect(prefix_arg(value)).toBe(value);
		expect(prefix_arg(undefined)).toBeUndefined();
	});

	test('kinds apart read each with its own word, a written prefix is ignored', () => {
		const mixed =
			'[Figure 1](#fig:a), [Table 1](#tbl:t) and [Figure 2](#fig:b)';
		expect(read(['fig:a', 'tbl:t', 'fig:b'])).toBe(mixed);
		expect(read(['fig:a', 'tbl:t', 'fig:b'], { prefix: 'Item' })).toBe(mixed);
		expect(read(['fig:a', 'tbl:t'], { prefix: false })).toBe(
			'[1](#fig:a) and [1](#tbl:t)'
		);
		expect(mixed_kinds(['fig:a', 'tbl:t'])).toBe(true);
		expect(mixed_kinds(['fig:a', 'other', 'fig:b'])).toBe(false);
	});

	test('a target not known yet is ?, an id of no kind reads as written', () => {
		expect(read(['fig:later'])).toBe('Figure ?');
		expect(read(['fig:a', 'fig:later'])).toBe('Figures [1](#fig:a) and ?');
		expect(read(['thing'])).toBe('thing');
	});

	test('the prefixes and and options', () => {
		expect(
			read(['fig:a', 'fig:b'], {
				prefixes: { ...PREFIXES, fig: ['Fig.', 'Figs.'] },
				and: '&',
			})
		).toBe('Figs. [1](#fig:a) & [2](#fig:b)');
		expect(
			run(':ref[fig:a]\n', { prefixes: { fig: ['Abb.', 'Abb.'] }, and: 'und' })
				.code
		).toContain('prefixes={"{\\"fig\\":[\\"Abb.\\",\\"Abb.\\"]}"} and="und"');
		expect(
			targets(':::figure[A](id=fig:a)\nx\n:::\n', {
				prefixes: { fig: ['Abb.', 'Abb.'] },
			})
		).toEqual(['fig:a 1 Abb. 1']);
	});
});

describe('options', () => {
	test('an option of the wrong shape throws when the plugin is made', () => {
		for (const [options, message] of [
			[null, 'the options must be an object'],
			[{ prefixes: 'x' }, 'prefixes must be an object of words by kind'],
			[{ and: 1 }, 'and must be a string, got 1'],
			[
				{ prefixes: { fig: 'Figure' } },
				"prefixes.fig must be the word for one and for several, such as ['Figure', 'Figures']",
			],
			[
				{ prefixes: { lst: ['Listing', 'Listings'] } },
				'prefixes has no kind "lst", the kinds are fig, tbl, eq, sec',
			],
			[
				{ number_sections: 'yes' },
				'number_sections must be true or false, got "yes"',
			],
			[
				{ section_depth: 0 },
				'section_depth must be a heading depth from 1 to 6, got 0',
			],
			[
				{ section_depth: 2.5 },
				'section_depth must be a heading depth from 1 to 6, got 2.5',
			],
		] as const) {
			expect(() => numbering(options as any), message).toThrow(
				new TypeError('[@mdsvex/plugin-numbering] ' + message)
			);
		}
	});
});

describe('every parser path', () => {
	/** the data, warnings and the args of each reference, the same whole, fed and over the wire */
	async function parsed(source: string, options?: NumberingOptions) {
		let first: unknown;
		for (const [name, path] of PATHS) {
			const bundle = numbering(options);
			const { dispatcher, nodes } = path(source, {
				plugins: [{ name: bundle.name, ...bundle.parse! }],
				directive_handlers: [
					{ name: bundle.name, directives: bundle.directives! },
				],
				headings: new HeadingIds(heading_slug, () => false),
			});
			await dispatcher!.finish(nodes);
			const refs: unknown[] = [];
			let wrappers = 0;
			const walk = (at: number) => {
				for (
					let c = nodes.first_child_at(at);
					c !== NONE;
					c = nodes.next_at(c)
				) {
					const meta = nodes.metadata_at(c) as
						| {
								name?: string;
								args?: Record<string, string>;
								attributes?: { class?: string };
						  }
						| undefined;
					if (meta?.name === 'ref') refs.push(meta.args?.ids ?? null);
					if (meta?.attributes?.class === 'equation') wrappers++;
					walk(c);
				}
			};
			walk(0);
			const found = {
				data: dispatcher!.data(),
				codes: (dispatcher!.warnings ?? []).map((w) => w.code),
				refs,
				wrappers,
			};
			if (first === undefined) first = found;
			else expect(found, name).toEqual(first);
		}
		return first as {
			data: any;
			codes: string[];
			refs: unknown[];
			wrappers: number;
		};
	}

	test('whole, fed and over the wire give the same numbers and references', async () => {
		const found = await parsed(DOC + '\n:ref[fig:nope]\n');
		expect(Object.keys(found.data.numbering)).toEqual([
			'target:sec:results',
			'target:fig:sales',
			'target:tbl:plans',
			'target:eq:energy',
			'target:sec:detail',
			'target:fig:costs',
		]);
		expect(found.data.numbering['target:fig:costs'].number).toBe('2');
		expect(found.refs).toHaveLength(5);
		expect(found.wrappers).toBe(1);
		expect(found.codes).toEqual(['mixed_kinds', 'unknown_target']);
	});

	test('a reference that never closes is no reference', async () => {
		const found = await parsed(
			':ref[fig:a\n\n:::figure[A](id=fig:a)\nx\n:::\n'
		);
		expect(found.refs).toEqual([]);
		expect(found.codes).toEqual([]);
	});

	test('a reference inside a construct that is revoked is kept', async () => {
		for (const source of [
			'*open :ref[fig:a] and more\n\n:::figure[A](id=fig:a)\nx\n:::\n',
			'[open :ref[fig:a] and more\n\n:::figure[A](id=fig:a)\nx\n:::\n',
			'- :ref[fig:a]\n- :ref[fig:nope]\n\n:::figure[A](id=fig:a)\nx\n:::\n',
		]) {
			const found = await parsed(source);
			expect(found.refs.length, source).toBeGreaterThan(0);
			expect(found.data.numbering['target:fig:a'].number, source).toBe('1');
		}
	});

	test('a figure inside a list, a quote and another directive is numbered in order', async () => {
		const found = await parsed(
			'- :::figure[A](id=fig:a)\n  x\n  :::\n\n> ::figure[B](id=fig:b)\n\n:::note\n::figure[C](id=fig:c)\n:::\n'
		);
		expect(
			Object.entries(found.data.numbering).map(
				([k, v]: [string, any]) => k + ' ' + v.number
			)
		).toEqual(['target:fig:a 1', 'target:fig:b 2', 'target:fig:c 3']);
	});
});
