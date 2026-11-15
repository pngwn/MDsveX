import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { scopes_of, tokenize } from './grammar';

describe('tables', () => {
	test('cell and header column separators', async () => {
		const source = '| name || type |\n| --- || :-: |\n| `a` || b \\| c |';
		expect(await scopes_of(source, '||')).toEqual([
			'markup.table.row.pfm',
			'punctuation.separator.table.header.pfm',
		]);
		expect(await scopes_of(source, '|')).toEqual([
			'markup.table.row.pfm',
			'punctuation.separator.table.cell.pfm',
		]);
		expect(await scopes_of(source, '---')).toEqual([
			'markup.table.row.pfm',
			'punctuation.definition.table.delimiter.pfm',
		]);
		expect(await scopes_of(source, ':-:')).toContain(
			'punctuation.definition.table.delimiter.pfm'
		);
		expect(await scopes_of(source, '\\|')).toEqual([
			'markup.table.row.pfm',
			'constant.character.escape.pfm',
		]);
		expect(await scopes_of(source, 'a')).toContain('markup.raw.inline.pfm');
	});

	test('cells that merge', async () => {
		const source = '| a | > |\n| --- | --- |\n| ^ | b > c |';
		expect(await scopes_of(source, '>')).toContain(
			'keyword.operator.table.merge.pfm'
		);
		expect(await scopes_of(source, '^')).toContain(
			'keyword.operator.table.merge.pfm'
		);
		expect(await scopes_of(source, ' b > c ')).toEqual([
			'markup.table.row.pfm',
		]);
	});

	test('a row in a block quote and in a list item', async () => {
		expect(await scopes_of('> | a | b |', '|')).toEqual([
			'markup.quote.pfm',
			'markup.table.row.pfm',
			'punctuation.separator.table.cell.pfm',
		]);
		expect(await scopes_of('- | a | b |', '|')).toContain(
			'punctuation.separator.table.cell.pfm'
		);
	});

	test('a pipe outside a table is text', async () => {
		expect(await scopes_of('one | two', 'one | two')).toEqual([]);
	});
});

describe('subscript, superscript and strikethrough', () => {
	test('each has its scope', async () => {
		const source = 'H~2~O and x^2^ and ~~gone~~';
		expect(await scopes_of(source, '2')).toEqual(['markup.subscript.pfm']);
		expect(await scopes_of(source, '~')).toEqual([
			'markup.subscript.pfm',
			'punctuation.definition.subscript.begin.pfm',
		]);
		expect(await scopes_of(source, '^')).toEqual([
			'markup.superscript.pfm',
			'punctuation.definition.superscript.begin.pfm',
		]);
		expect(await scopes_of(source, 'gone')).toEqual([
			'markup.strikethrough.pfm',
		]);
	});

	test('a lone or escaped mark is text', async () => {
		expect(await scopes_of('about ~5 and 2^10', 'about ~5 and 2^10')).toEqual(
			[]
		);
		const escaped = await tokenize('a \\^b^ c');
		expect(
			escaped.some((t) => t.scopes.includes('markup.superscript.pfm'))
		).toBe(false);
	});
});

describe('task lists', () => {
	test('a checked and an unchecked item', async () => {
		const source = '- [x] done\n1. [ ] to do';
		expect(await scopes_of(source, 'x')).toEqual([
			'markup.list.pfm',
			'constant.language.task.checked.pfm',
		]);
		const tokens = await tokenize(source);
		expect(
			tokens.filter((t) => t.scopes.length === 2 && t.text === ' ')
		).toMatchObject([
			{
				text: ' ',
				scopes: ['markup.list.pfm', 'constant.language.task.unchecked.pfm'],
			},
		]);
		expect(await scopes_of(source, '[')).toEqual([
			'markup.list.pfm',
			'punctuation.definition.task.begin.pfm',
		]);
	});

	test('a marker with no text after it is not a task', async () => {
		const tokens = await tokenize('- [x]done\n- [ ]');
		expect(tokens.some((t) => t.scopes.some((s) => s.includes('task')))).toBe(
			false
		);
	});

	test('a task in a block quote', async () => {
		expect(await scopes_of('> - [x] done', 'x')).toEqual([
			'markup.quote.pfm',
			'markup.list.pfm',
			'constant.language.task.checked.pfm',
		]);
	});
});

describe('math', () => {
	test('inline math', async () => {
		const source = 'Euler $`e^{i\\pi}`$ ok';
		expect(await scopes_of(source, '$')).toEqual([
			'markup.math.inline.pfm',
			'punctuation.definition.math.begin.pfm',
		]);
		expect(await scopes_of(source, 'e^{i\\pi}')).toEqual([
			'markup.math.inline.pfm',
			'meta.embedded.math.pfm',
			'markup.raw.inline.pfm',
		]);
	});

	test('a price and a code span after a dollar are not math', async () => {
		const tokens = await tokenize('costs $5 and $`x` here');
		expect(
			tokens.some((t) => t.scopes.includes('markup.math.inline.pfm'))
		).toBe(false);
		expect(tokens.some((t) => t.scopes.includes('markup.raw.inline.pfm'))).toBe(
			true
		);
	});

	test('a math fence', async () => {
		const source = '```math\n\\frac{a}{b}\n```';
		expect(await scopes_of(source, 'math')).toEqual([
			'markup.fenced_code.block.pfm',
			'fenced_code.block.language.pfm',
		]);
		expect(await scopes_of(source, '\\frac{a}{b}')).toEqual([
			'markup.fenced_code.block.pfm',
			'meta.embedded.block.latex',
		]);
	});
});

describe('directives', () => {
	test('the inline form', async () => {
		const source = 'An :abbr[HTML](title=HyperText) here';
		expect(await scopes_of(source, 'abbr')).toEqual([
			'meta.directive.pfm',
			'entity.name.tag.directive.pfm',
		]);
		expect(await scopes_of(source, 'title')).toEqual([
			'meta.directive.pfm',
			'meta.directive.args.pfm',
			'entity.other.attribute-name.pfm',
		]);
	});

	test('a leaf and a container with brackets', async () => {
		expect(await scopes_of('::youtube[A talk](id=abc)', 'youtube')).toContain(
			'entity.name.tag.directive.pfm'
		);
		expect(await scopes_of(':::Callout[Heads *up*](kind=warn)', 'up')).toEqual([
			'meta.directive.pfm',
			'meta.directive.label.pfm',
			'markup.bold.pfm',
		]);
	});

	test('a leaf and a container without brackets', async () => {
		expect(await scopes_of('::toc', 'toc')).toEqual([
			'meta.directive.pfm',
			'entity.name.tag.directive.pfm',
		]);
		expect(await scopes_of(':::steps(level=3)', 'level')).toContain(
			'entity.other.attribute-name.pfm'
		);
		expect(await scopes_of('> :::note', 'note')).toContain(
			'entity.name.tag.directive.pfm'
		);
	});

	test('the line that closes a container', async () => {
		expect(await scopes_of(':::note\nbody\n:::', ':::')).toEqual([
			'meta.directive.pfm',
			'punctuation.definition.directive.pfm',
		]);
		const tokens = await tokenize(':::note\nbody\n:::');
		expect(tokens[tokens.length - 1]).toMatchObject({
			text: ':::',
			scopes: ['punctuation.definition.directive.end.pfm'],
		});
	});

	test('a word after the name, a shortcode and a scope operator are text', async () => {
		for (const source of ['::toc is here', 'a :tada: b', 'std::vector']) {
			const tokens = await tokenize(source);
			expect(tokens.some((t) => t.scopes.includes('meta.directive.pfm'))).toBe(
				false
			);
		}
	});
});

describe('fence meta', () => {
	test('src and run', async () => {
		const source = '```svelte src=./Counter.svelte#L5-L20 run=client\n```';
		expect(await scopes_of(source, 'svelte')).toEqual([
			'markup.fenced_code.block.pfm',
			'fenced_code.block.language.pfm',
		]);
		expect(await scopes_of(source, 'src')).toEqual([
			'markup.fenced_code.block.pfm',
			'keyword.control.import.pfm',
		]);
		expect(await scopes_of(source, './Counter.svelte#L5-L20')).toEqual([
			'markup.fenced_code.block.pfm',
			'markup.underline.link.pfm',
		]);
		expect(await scopes_of(source, 'run')).toEqual([
			'markup.fenced_code.block.pfm',
			'keyword.control.run.pfm',
		]);
		expect(await scopes_of(source, 'client')).toEqual([
			'markup.fenced_code.block.pfm',
			'constant.language.run.pfm',
		]);
	});

	test('a fence with no language takes its meta', async () => {
		const source = '```src=#lib/math.ts title="math.ts"\n```';
		expect(await scopes_of(source, 'src')).toContain(
			'keyword.control.import.pfm'
		);
		expect(await scopes_of(source, '#lib/math.ts')).toContain(
			'markup.underline.link.pfm'
		);
		expect(await scopes_of(source, 'title')).toContain(
			'entity.other.attribute-name.pfm'
		);
	});

	test('titles, ranges, words, flags and props', async () => {
		const source =
			'```ts [math.ts] {1,3-4} /total/ :line-numbers=10 twoslash playground height=300\n```';
		expect(await scopes_of(source, '[math.ts]')).toContain(
			'string.other.title.pfm'
		);
		expect(await scopes_of(source, '{1,3-4}')).toContain(
			'constant.numeric.line-range.pfm'
		);
		expect(await scopes_of(source, '/total/')).toContain(
			'string.regexp.word.pfm'
		);
		expect(await scopes_of(source, ':line-numbers=10')).toContain(
			'keyword.other.line-numbers.pfm'
		);
		expect(await scopes_of(source, 'twoslash')).toContain(
			'keyword.control.flag.pfm'
		);
		expect(await scopes_of(source, 'playground')).toContain(
			'entity.other.attribute-name.pfm'
		);
		expect(await scopes_of(source, '300')).toContain(
			'string.quoted.fence-meta.pfm'
		);
	});

	test('the code of a fence with meta is embedded', async () => {
		const source = '```ts title="a.ts" run\nlet x = 1;\n```\nafter';
		expect(await scopes_of(source, 'let x = 1;')).toEqual([
			'markup.fenced_code.block.pfm',
			'meta.embedded.block.typescript',
		]);
		expect(await scopes_of(source, 'after')).toEqual([]);
	});

	test('an editor with no grammar for the language still reads the fence', async () => {
		const source = '```ts title="a.ts" run\nlet x = 1;\n```\nafter';
		expect(await scopes_of(source, 'let x = 1;', false)).toEqual([
			'markup.fenced_code.block.pfm',
		]);
		expect(await scopes_of(source, 'run', false)).toContain(
			'keyword.control.run.pfm'
		);
		expect(await scopes_of(source, 'after', false)).toEqual([]);
	});

	test('a longer fence holds a shorter one, and a line with text does not close it', async () => {
		const source = '````md\n```js\nlet x;\n```\n````\nafter';
		const tokens = await tokenize(source);
		expect(tokens.find((t) => t.text === 'let x;')?.scopes).toContain(
			'markup.fenced_code.block.pfm'
		);
		expect(tokens[tokens.length - 1]).toMatchObject({
			text: 'after',
			scopes: [],
		});
		expect(await scopes_of('```\na\n``` b\nc\n```\nafter', 'c')).toEqual([
			'markup.fenced_code.block.pfm',
		]);
	});

	test('a fence in a block quote', async () => {
		const source = '> ```js\n> let x;\n> ```\n\nafter';
		expect(await scopes_of(source, 'js')).toContain(
			'fenced_code.block.language.pfm'
		);
		expect(await scopes_of(source, 'after')).toEqual([]);
	});
});

describe('fence languages', () => {
	test.each([
		['ruby', 'ruby'],
		['mts', 'typescript'],
		['jsx', 'javascriptreact'],
		['c++', 'cpp'],
		['c#', 'csharp'],
		['Dockerfile', 'dockerfile'],
		['md', 'markdown'],
		['svx', 'pfm'],
	])('a %s fence embeds %s', async (name, language) => {
		const source = `\`\`\`${name} title="a"\nbody\n\`\`\``;
		expect(await scopes_of(source, name)).toContain(
			'fenced_code.block.language.pfm'
		);
		expect(await scopes_of(source, 'body')).toContain(
			`meta.embedded.block.${language}`
		);
	});

	test('a fence of a new language in a block quote closes', async () => {
		const source = '> ```ruby\n> puts 1\n> ```\n\nafter';
		expect(await scopes_of(source, 'after')).toEqual([]);
	});

	test('a language that is only the start of a name is not embedded', async () => {
		const source = '```rubyx\nbody\n```';
		expect(await scopes_of(source, 'rubyx')).toContain(
			'fenced_code.block.language.pfm'
		);
		expect(await scopes_of(source, 'body')).toEqual([
			'markup.fenced_code.block.pfm',
		]);
	});

	test('the extension maps every embedded block to its language', async () => {
		const grammar = readFileSync(
			new URL('../syntaxes/pfm.tmLanguage.json', import.meta.url),
			'utf8'
		);
		const pkg = JSON.parse(
			readFileSync(new URL('../package.json', import.meta.url), 'utf8')
		);
		const embedded = pkg.contributes.grammars[0].embeddedLanguages;
		const scopes = grammar.match(/meta\.embedded\.block\.[\w-]+/g) ?? [];
		expect(scopes.length).toBeGreaterThan(50);
		for (const scope of scopes) expect(embedded).toHaveProperty([scope]);
	});
});

describe('links', () => {
	test('a definition and a reference to it', async () => {
		const source =
			'[svelte]: https://svelte.dev "Svelte"\n\nSee [the site][svelte] and ![logo][].';
		expect(await scopes_of(source, 'https://svelte.dev')).toEqual([
			'meta.link.reference.def.pfm',
			'markup.underline.link.pfm',
		]);
		expect(await scopes_of(source, '"Svelte"')).toContain(
			'string.other.link.description.title.pfm'
		);
		expect(await scopes_of(source, 'the site')).toEqual([
			'meta.link.reference.pfm',
			'string.other.link.title.pfm',
		]);
		expect(await scopes_of(source, '!')).toEqual([
			'meta.link.reference.pfm',
			'punctuation.definition.image.pfm',
		]);
	});

	test('a footnote reference and its definition', async () => {
		const source = 'Text[^note] here.\n\n[^note]: A *note*.';
		expect(await scopes_of(source, 'note')).toEqual([
			'meta.footnote.reference.pfm',
			'entity.name.footnote.pfm',
		]);
		const tokens = await tokenize(source);
		expect(tokens.find((t) => t.text === ']:')?.scopes).toEqual([
			'meta.footnote.definition.pfm',
			'punctuation.definition.footnote.end.pfm',
		]);
		expect(
			tokens.find(
				(t) => t.text === 'note' && t.scopes.includes('markup.bold.pfm')
			)
		).toBeDefined();
	});

	test('a footnote definition with its text on the next line', async () => {
		const tokens = await tokenize('[^note]:\n    A *note*.');
		expect(tokens.find((t) => t.text === ']:')?.scopes).toEqual([
			'meta.footnote.definition.pfm',
			'punctuation.definition.footnote.end.pfm',
		]);
		expect(
			tokens.some((t) => t.scopes.includes('meta.footnote.reference.pfm'))
		).toBe(false);
	});

	test('an escaped footnote reference is text', async () => {
		const tokens = await tokenize('the class \\[^abc] here');
		expect(
			tokens.some((t) => t.scopes.includes('meta.footnote.reference.pfm'))
		).toBe(false);
	});

	test('a footnote definition line is not a link definition', async () => {
		const tokens = await tokenize('[^1]: a note');
		expect(
			tokens.some((t) => t.scopes.includes('meta.link.reference.def.pfm'))
		).toBe(false);
	});
});

describe('breaks and escapes', () => {
	test('a backslash at the end of a line', async () => {
		expect(await scopes_of('one\\\ntwo', '\\')).toEqual([
			'constant.character.escape.hard-break.pfm',
		]);
	});

	test('escaped marks', async () => {
		for (const escape of ['\\^', '\\:', '\\<', '\\$', '\\{'])
			expect(await scopes_of(`a ${escape}b`, escape)).toEqual([
				'constant.character.escape.pfm',
			]);
	});
});

describe('what the grammar already read', () => {
	test('frontmatter, a heading and inline marks', async () => {
		const source =
			'---\ntitle: x\n---\n\n## A _title_\n\nSome *strong* and `code` and {value}.';
		expect(await scopes_of(source, '---')).toEqual([
			'meta.frontmatter.pfm',
			'punctuation.definition.frontmatter.begin.pfm',
		]);
		expect(await scopes_of(source, '##')).toEqual([
			'markup.heading.pfm',
			'punctuation.definition.heading.pfm',
		]);
		expect(await scopes_of(source, 'title')).toEqual([
			'markup.heading.pfm',
			'entity.name.section.pfm',
			'markup.italic.pfm',
		]);
		expect(await scopes_of(source, 'strong')).toEqual(['markup.bold.pfm']);
		expect(await scopes_of(source, 'code')).toContain('markup.raw.inline.pfm');
		expect(await scopes_of(source, 'value')).toContain(
			'meta.svelte.expression.pfm'
		);
	});

	test('a component, a svelte block and a script', async () => {
		const source =
			'<Chart data={items} />\n\n{#if a}\ntext\n{/if}\n\n<script>\n\tlet a = 1;\n</script>';
		expect(await scopes_of(source, 'Chart')).toContain(
			'meta.tag.component.pfm'
		);
		expect(await scopes_of(source, 'if')).toContain('keyword.control.svelte');
		expect(await scopes_of(source, '\tlet a = 1;')).toEqual([
			'meta.script.pfm',
			'source.ts',
		]);
	});

	test('a fence of the document language is read as a document', async () => {
		const source = '```svx\n## A *title*\n```';
		expect(await scopes_of(source, 'title')).toEqual([
			'markup.fenced_code.block.pfm',
			'meta.embedded.block.pfm',
			'markup.heading.pfm',
			'entity.name.section.pfm',
			'markup.bold.pfm',
		]);
	});
});

/** the scopes of every token whose text is text */
async function all_scopes(source: string, text: string): Promise<string[][]> {
	return (await tokenize(source))
		.filter((token) => token.text === text)
		.map((token) => token.scopes);
}

describe('inline marks', () => {
	test('an unclosed mark ends with its paragraph', async () => {
		for (const mark of ['_', '*', '~~']) {
			expect(await scopes_of(`a ${mark}open\n\nafter`, 'after')).toEqual([]);
			expect(await scopes_of(`a ${mark}open\n# after`, 'after')).toEqual([
				'markup.heading.pfm',
				'entity.name.section.pfm',
			]);
		}
	});

	test('a mark runs on over the lines of its paragraph', async () => {
		expect(await scopes_of('*one\ntwo*', 'two')).toEqual(['markup.bold.pfm']);
		expect(await scopes_of('~~one\ntwo~~', 'two')).toEqual([
			'markup.strikethrough.pfm',
		]);
	});

	test('a mark opens after punctuation', async () => {
		const source = '(*a*) [_b_] "*c*" x|*d*|y';
		for (const [text, scope] of [
			['a', 'markup.bold.pfm'],
			['b', 'markup.italic.pfm'],
			['c', 'markup.bold.pfm'],
			['d', 'markup.bold.pfm'],
		])
			expect(await scopes_of(source, text)).toContain(scope);
		expect(
			(await tokenize('a*b*c')).some((t) =>
				t.scopes.includes('markup.bold.pfm')
			)
		).toBe(false);
	});

	test('a doubled star is a strong in a strong, never an empty one', async () => {
		expect(await scopes_of('**`code` text** after', ' text')).toEqual([
			'markup.bold.pfm',
			'markup.bold.pfm',
		]);
		expect(await scopes_of('**`code` text** after', ' after')).toEqual([]);
	});

	test('a mark in a block quote runs on over the quoted lines', async () => {
		const source = '> a *b\n> c* d\n\nafter';
		expect(await scopes_of(source, 'c')).toEqual([
			'markup.quote.pfm',
			'markup.bold.pfm',
		]);
		expect(await scopes_of(source, '> ')).toContain(
			'punctuation.definition.quote.begin.pfm'
		);
		expect(await scopes_of(source, ' d')).toEqual(['markup.quote.pfm']);
		expect(await scopes_of('> a *b\n\nafter', 'after')).toEqual([]);
	});

	test('the closing run of a code span is as long as the opening one', async () => {
		const tokens = await tokenize('`a`` b');
		expect(tokens.some((t) => t.scopes.includes('markup.raw.inline.pfm'))).toBe(
			false
		);
		expect(await scopes_of('```` ```ts ```` x', ' ```ts ')).toContain(
			'markup.raw.inline.pfm'
		);
	});

	test('a superscript steps over a code span, a footnote opens none', async () => {
		const footnotes = 'escaped, \\[^like this], or in code, `[^abc]`.';
		expect(await scopes_of(footnotes, '[^abc]')).toContain(
			'markup.raw.inline.pfm'
		);
		expect(
			(await tokenize(footnotes)).some((t) =>
				t.scopes.includes('markup.superscript.pfm')
			)
		).toBe(false);
		expect(await scopes_of('x^`a`^ y', '`a`')).toContain(
			'markup.superscript.pfm'
		);
		expect(await scopes_of('::leaf[^two^ three]', 'two')).toContain(
			'markup.superscript.pfm'
		);
	});
});

describe('blocks after container markers', () => {
	test('a heading in a block quote, a list item and at any indent', async () => {
		for (const source of [
			'> ## Title',
			'- ## Title',
			'1. > ## Title',
			'    ## Title',
		])
			expect(await scopes_of(source, 'Title')).toEqual([
				'markup.heading.pfm',
				'entity.name.section.pfm',
			]);
		expect(await all_scopes('> ## Title', ' ')).toEqual([
			[],
			['markup.heading.pfm'],
		]);
		expect(await scopes_of('> ## Title', '>')).toEqual([
			'punctuation.definition.quote.begin.pfm',
		]);
		expect(
			(await tokenize('#hashtag')).some((t) =>
				t.scopes.includes('markup.heading.pfm')
			)
		).toBe(false);
	});

	test('a fence on the line of a list marker', async () => {
		const source = '- ```js\n  let x;\n  ```\n- after';
		expect(await scopes_of(source, 'js')).toContain(
			'fenced_code.block.language.pfm'
		);
		expect(await scopes_of(source, '  let x;')).toEqual([
			'markup.fenced_code.block.pfm',
			'meta.embedded.block.javascript',
		]);
		expect(await scopes_of(source, 'after')).toEqual([]);
	});

	test('a comment and a svelte block in a block quote', async () => {
		expect(await scopes_of('> <!-- note -->', ' note ')).toEqual([
			'markup.quote.pfm',
			'comment.block.html',
		]);
		expect(await scopes_of('> {#if a}', 'if')).toContain(
			'keyword.control.svelte'
		);
	});
});

describe('the scopes around a construct', () => {
	test('every svelte block is a block', async () => {
		for (const [source, text] of [
			['{#if a}', 'if'],
			['{:else}', 'else'],
			['{/if}', 'if'],
		])
			expect(await scopes_of(source, text)).toEqual([
				'meta.svelte.block.pfm',
				'keyword.control.svelte',
			]);
	});

	test('the arguments of a directive on its own line are in the directive', async () => {
		expect(await scopes_of('::toc(depth=2)', 'depth')).toEqual([
			'meta.directive.pfm',
			'meta.directive.args.pfm',
			'entity.other.attribute-name.pfm',
		]);
	});

	test('a container with a label opens with any run of colons', async () => {
		const source = '::::figure[The *penguin*](id=fig:penguin)';
		expect(await scopes_of(source, '::::')).toEqual([
			'meta.directive.pfm',
			'punctuation.definition.directive.pfm',
		]);
		expect(await scopes_of(source, 'penguin')).toEqual([
			'meta.directive.pfm',
			'meta.directive.label.pfm',
			'markup.bold.pfm',
		]);
		expect(await scopes_of(source, 'fig:penguin')).toContain(
			'string.unquoted.directive-arg.pfm'
		);
	});

	test('arguments the parser takes, and parentheses it leaves as text', async () => {
		const quoted = ':d[x](a="]", b=")") after';
		expect(await scopes_of(quoted, '")"')).toContain(
			'string.unquoted.directive-arg.pfm'
		);
		expect(await scopes_of(quoted, ' after')).toEqual([]);
		for (const args of [
			'(positional)',
			'(a=1,)',
			'(a=b c=d)',
			'(a=)',
			'(a="x)',
		])
			expect(await scopes_of(`:d[x]${args} q`, `${args} q`)).toEqual([]);
	});

	test('a tag that never closes ends with its paragraph', async () => {
		expect(await scopes_of('a <span class\n\nafter', 'after')).toEqual([]);
		expect(await scopes_of('<span\nclass="a">', 'class')).toContain(
			'meta.tag.html.pfm'
		);
	});

	test('a svelte element is a tag, any other scheme an autolink', async () => {
		expect(await scopes_of('<svelte:head>', 'svelte:head')).toEqual([
			'meta.tag.html.pfm',
			'entity.name.tag.html',
		]);
		expect(await scopes_of('<mailto:a@b.c>', 'mailto:a@b.c')).toEqual([
			'meta.link.autolink.pfm',
			'markup.underline.link.pfm',
		]);
	});
});

describe('link text', () => {
	test('holds inline marks, images and escaped brackets', async () => {
		expect(await scopes_of('[a *b*](u)', 'b')).toEqual([
			'meta.link.inline.pfm',
			'string.other.link.title.pfm',
			'markup.bold.pfm',
		]);
		const badge = '[![npm](badge.svg)](https://npm.im/x)';
		expect(await scopes_of(badge, 'badge.svg')).toContain(
			'markup.underline.link.image.pfm'
		);
		expect(await scopes_of(badge, 'https://npm.im/x')).toEqual([
			'meta.link.inline.pfm',
			'markup.underline.link.pfm',
		]);
		expect(await scopes_of('[a \\[b](u)', 'u')).toContain(
			'markup.underline.link.pfm'
		);
		expect(await scopes_of('[a *b*][ref]', 'b')).toContain('markup.bold.pfm');
	});
});

describe('imports', () => {
	test('an import over lines runs to its closing brace', async () => {
		const source =
			'import {\n  a, // the {a}\n  b /* } */\n} from "x";\n\n# Hi';
		for (const text of ['a', 'b', '/* } */'])
			expect(await scopes_of(source, text)).toContain('meta.import.pfm');
		expect((await all_scopes(source, '}'))[0]).toContain('meta.import.pfm');
		expect(await scopes_of(source, 'Hi')).toContain('markup.heading.pfm');
	});

	test('an import that never closes its brace ends at a blank line', async () => {
		expect(await scopes_of('import {\n  a,\n\n# Hi', 'Hi')).toContain(
			'markup.heading.pfm'
		);
	});

	test('a line of prose that starts with the word is no import', async () => {
		expect(await scopes_of('import. Timing it', 'import. Timing it')).toEqual(
			[]
		);
		expect(await scopes_of('import A from "./A"', 'import')).toEqual([
			'meta.import.pfm',
			'keyword.control.import.pfm',
		]);
	});
});
