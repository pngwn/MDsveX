import type { ParsePlugin } from '@mdsvex/parse';
import { describe, expect, test } from 'vitest';

import { PATHS, run_batch } from '../../parse/test/plugin_harness';
import {
	CompilerSession,
	compile_inputs,
	compile_text,
	parsed_text,
} from '../src/compile';
import type { Bundle, DocumentText } from '../src/compile';
import { document_text } from '../src/document_text';
import { make_heading_ids } from '../src/heading_ids';

/** every construct the text reads or leaves out */
const FIXTURE = `---
title: Front matter
---

<script>
	import Note from './Note.svelte';
	let count = 1;
</script>

<style>
	p { color: red; }
</style>

Before the first heading, AT&amp;T &copy; caf&#233; &bogus; \\*not em\\*.[^one]

# The *main* title {count}

A [link with *emphasis*](/to "t") and ![an image](./a.png) and \`code\` and $\`x^2\`$ inline.
A second line,\\
after a hard break, then an {expression} left out.

<!-- a comment -->

## Lists and quotes

- tight one
- tight <b>two</b> and <kbd>K</kbd>

1. loose first

   loose second

> a quote
> over two lines

| head a | head b |
| ------ | ------ |
| cell 1 | cell *2* |

## Code

\`\`\`js
const a = 1;
	indented
\`\`\`

\`\`\`math
e = mc^2
\`\`\`

<pre>pre <b>held</b>
  lines</pre>

## Directives

:abbr[HTML](title="HyperText") reads its label.

::embed[A leaf label](src=x)

:::note[Note label]
Inside the note.

### Nested heading

Under it.
:::

## Svelte

{#if count}
The if branch.
{:else}
The else branch.
{/if}

Inline {#if count}yes{:else}no{/if} block.

{@html '<b>raw</b>'}

<div>A div with <span>inline</span> text</div>
<div>Another div</div>

<Note kind="x">Component text</Note>

<svelte:head><title>Hidden</title></svelte:head>

---

[ref]: /defined

[^one]: The *footnote* body.

[^unused]: Never referenced.
`;

const EXPECTED: DocumentText = {
	title: 'The main title',
	text: [
		'Before the first heading, AT&T © café &bogus; *not em*.',
		'The main title',
		'A link with emphasis and an image and code and x^2 inline. A second line,\nafter a hard break, then an left out.',
		'Lists and quotes',
		'tight one',
		'tight two and K',
		'loose first',
		'loose second',
		'a quote over two lines',
		'head a head b',
		'cell 1 cell 2',
		'Code',
		'const a = 1;\n\tindented',
		'e = mc^2',
		'pre held\n  lines',
		'Directives',
		'HTML reads its label.',
		'A leaf label',
		'Note label',
		'Inside the note.',
		'Nested heading',
		'Under it.',
		'Svelte',
		'The if branch.',
		'The else branch.',
		'Inline yes no block.',
		'A div with inline text',
		'Another div',
		'Component text',
		'The footnote body.',
	].join('\n\n'),
	sections: [
		{
			heading: '',
			depth: 0,
			text: 'Before the first heading, AT&T © café &bogus; *not em*.',
		},
		{
			id: 'the-main-title',
			heading: 'The main title',
			depth: 1,
			text: 'A link with emphasis and an image and code and x^2 inline. A second line,\nafter a hard break, then an left out.',
		},
		{
			id: 'lists-and-quotes',
			heading: 'Lists and quotes',
			depth: 2,
			text: [
				'tight one',
				'tight two and K',
				'loose first',
				'loose second',
				'a quote over two lines',
				'head a head b',
				'cell 1 cell 2',
			].join('\n\n'),
		},
		{
			id: 'code',
			heading: 'Code',
			depth: 2,
			text: ['const a = 1;\n\tindented', 'e = mc^2', 'pre held\n  lines'].join(
				'\n\n'
			),
		},
		{
			id: 'directives',
			heading: 'Directives',
			depth: 2,
			text: [
				'HTML reads its label.',
				'A leaf label',
				'Note label',
				'Inside the note.',
			].join('\n\n'),
		},
		{
			id: 'nested-heading',
			heading: 'Nested heading',
			depth: 3,
			text: 'Under it.',
		},
		{
			id: 'svelte',
			heading: 'Svelte',
			depth: 2,
			text: [
				'The if branch.',
				'The else branch.',
				'Inline yes no block.',
				'A div with inline text',
				'Another div',
				'Component text',
				'The footnote body.',
			].join('\n\n'),
		},
	],
};

describe('the text of a document', () => {
	test('reads every construct as the docs say', async () => {
		const text = await compile_text(FIXTURE, {
			heading_ids: true,
			strict_directives: true,
		});
		expect(text).toEqual(EXPECTED);
		expect(JSON.parse(JSON.stringify(text))).toEqual(text);
	});

	test('code_blocks false leaves out fences, math fences and pre, not code spans', async () => {
		const { text, sections } = await compile_text(FIXTURE, {
			code_blocks: false,
		});
		expect(text).not.toContain('const a');
		expect(text).not.toContain('mc^2');
		expect(text).not.toContain('pre held');
		expect(text).toContain('and code and x^2 inline');
		expect(sections.find((s) => s.heading === 'Code')).toEqual({
			heading: 'Code',
			depth: 2,
			text: '',
		});
	});

	test('a section has an id only when its heading has one', async () => {
		const plain = await compile_text('# A\n\n## B\n\ntext\n');
		expect(plain.sections).toEqual([
			{ heading: 'A', depth: 1, text: '' },
			{ heading: 'B', depth: 2, text: 'text' },
		]);
		const typed = await compile_text('<h2 id="own">Typed</h2>\n\n## Made\n', {
			heading_ids: true,
		});
		// an element heading is a block of text, not a section
		expect(typed.sections).toEqual([
			{ heading: '', depth: 0, text: 'Typed' },
			{ id: 'made', heading: 'Made', depth: 2, text: '' },
		]);
	});

	test('the title is the first # heading outside any container', async () => {
		expect((await compile_text('> # Quoted\n\n## Two\n\n# One\n')).title).toBe(
			'One'
		);
		expect('title' in (await compile_text('## Only two\n'))).toBe(false);
		expect('title' in (await compile_text('# {expr}\n\n# Real\n'))).toBe(true);
		expect((await compile_text('# {expr}\n\n# Real\n')).title).toBe('Real');
	});

	test('a block inside a heading or a label is a word of it', async () => {
		const { sections } = await compile_text(
			'# A <div>b</div> c\n\n:::note[x <p>y</p> z]\nin\n:::\n'
		);
		expect(sections).toEqual([
			{ heading: 'A b c', depth: 1, text: 'x y z\n\nin' },
		]);
	});

	test('an empty document has no text and no sections', async () => {
		expect(await compile_text('')).toEqual({ text: '', sections: [] });
		expect(await compile_text('---\ntitle: x\n---\n')).toEqual({
			text: '',
			sections: [],
		});
	});

	test('newlines are normalized and nothing ends in a space', async () => {
		const text = await compile_text('# A  \r\n\r\nline one  \r\nline two \r\n');
		expect(text.text).toBe('A\n\nline one line two');
		expect(text.text).not.toMatch(/ \n| $/m);
	});

	test('a code_blocks that is no boolean throws', async () => {
		await expect(
			compile_text('a', { code_blocks: 'no' as never })
		).rejects.toThrow('code_blocks must be true or false');
	});
});

/** a plugin that writes text and an element with text into the document */
const smile: ParsePlugin = {
	name: 'smile',
	sequential: true,
	text(run) {
		const text = run.text;
		const at = text.indexOf(':smile:');
		if (at !== -1) run.replace(at, at + 7, 'text', '\u{1F604} &amp;');
		const wave = text.indexOf(':wave:');
		if (wave !== -1)
			run
				.replace(wave, wave + 6, 'html', {
					tag: 'span',
					attributes: { role: 'img' },
				})
				.append('text', '\u{1F44B}');
	},
};

/** labels each cite once the document is whole, as the citations plugin does */
function cites(deferred: boolean): Bundle {
	const label = (args: Readonly<Record<string, string>>) =>
		args.labels === undefined ? undefined : '[' + args.labels + ']';
	return {
		name: 'cites',
		module: './cites.js',
		directives: {
			cite: { text: label },
			refs: {
				text: (args) =>
					args.list === undefined
						? undefined
						: args.list.split('|').join('\n\n'),
			},
			aside: { text: (_args, label) => 'Aside: ' + label },
		},
		parse: {
			async document(root) {
				const nodes: (typeof root)[] = [];
				const find = (node: typeof root) => {
					for (let c = node.first_child; c !== null; c = c.next) {
						if (c.type.startsWith('directive_')) nodes.push(c);
						find(c);
					}
				};
				find(root);
				// as a bibliography read from a file
				if (deferred) await new Promise((done) => setTimeout(done, 1));
				let n = 0;
				for (const node of nodes) {
					if (node.attrs.name === 'cite')
						node.attrs.args = { ...node.attrs.args, labels: String(++n) };
					if (node.attrs.name === 'refs')
						node.attrs.args = { list: 'First entry|Second entry' };
				}
			},
		},
	};
}

const CITED =
	'# Cited\n\nSee :cite[smith] and :cite[jones] :smile: :wave:.\n\n::refs\n\n:::aside[Label]\nheld\n:::\n';

describe('plugin output in the text', () => {
	test('text a plugin writes and the text of nodes it makes are read', async () => {
		const { text } = await compile_text('Hi :smile: and :wave: there\n', {
			parse_plugins: [smile],
		});
		// what a plugin wrote is characters, a reference in it stays as written
		expect(text).toBe('Hi \u{1F604} &amp; and \u{1F44B} there');
	});

	test.each([false, true])(
		'a directive reads as its text hook says, deferred %s',
		async (deferred) => {
			const plugins = [cites(deferred)];
			const { text } = await compile_text(CITED, {
				plugins,
				parse_plugins: [smile],
				strict_directives: false,
			});
			expect(text).toBe(
				[
					'Cited',
					'See [1] and [2] \u{1F604} &amp; \u{1F44B}.',
					'First entry',
					'Second entry',
					'Aside: Label',
					'held',
				].join('\n\n')
			);
		}
	);

	test('a hook that returns undefined reads the label', async () => {
		const { text } = await compile_text(':cite[smith]\n', {
			plugins: [
				{
					name: 'c',
					module: './c.js',
					directives: { cite: { text: () => undefined } },
				},
			],
		});
		expect(text).toBe('smith');
	});

	test('a hook that is no function throws', async () => {
		await expect(
			compile_text(':cite[smith]\n', {
				plugins: [
					{
						name: 'c',
						module: './c.js',
						directives: { cite: { text: 'x' as never } },
					},
				],
			})
		).rejects.toThrow('the text of the directive cite must be a function');
	});

	test('parsed_text reads a settled document that can still render', async () => {
		const session = new CompilerSession();
		const plugins = [cites(true)];
		const inputs = compile_inputs({ plugins });
		const parsed = session.parse(CITED, inputs);
		expect(() => parsed_text(parsed, { plugins })).toThrow(
			'wait for settle(parsed) before its text'
		);
		await session.settle(parsed);
		expect(parsed_text(parsed, { plugins }).text).toContain('See [1] and [2]');
		const { code } = session.render(parsed, inputs);
		expect(code).toContain('labels="1"');
		expect(() => parsed_text(parsed)).toThrow(
			'the document rendered or was dropped'
		);
	});
});

const DOCS = [
	FIXTURE,
	'# A\n\n## A\n\npara with &amp; and &#x1F600; and \\& and caf&eacute;\n',
	'- a\n  - nested *b*\n\n    more\n- c\n',
	'> # q\n>\n> ```\n> code in quote\n>   kept\n> ```\n',
	'1. x\n\n   ```py\n   def f():\n       pass\n   ```\n',
	'Text <span>in <em>line</em></span> and <Foo>comp</Foo>.\n\n<Foo>\n\nblock comp\n\n</Foo>\n',
	'{#each items as item}\n- {item}\n{/each}\n\n{#await p}\nwait\n{:then v}\ndone\n{/await}\n',
	'Hi :smile: and :wave: there, see [^a].\n\n[^a]: note :smile:\n',
	'| a | b |\n|:-|-:|\n| `x` | ![i](j.png) |\n',
	'line\\\nbreak and trailing   \nspace\n',
];

describe('every parse path reads the same text', () => {
	test.each(DOCS.map((doc, i) => [i, doc]))('document %i', (_i, doc) => {
		let first: DocumentText | undefined;
		for (const [name, run] of PATHS) {
			const out = run(doc as string, {
				plugins: [smile],
				headings: make_heading_ids(),
			});
			const text = document_text(out.nodes, out.source ?? '');
			if (first === undefined) first = text;
			else expect(text, `${name} against ${PATHS[0][0]}`).toEqual(first);
		}
		expect(first!.text.length).toBeGreaterThan(0);
	});

	test('the harness agrees with a compile', async () => {
		const out = run_batch(FIXTURE, { headings: make_heading_ids() });
		expect(document_text(out.nodes, out.source!)).toEqual(EXPECTED);
	});
});
