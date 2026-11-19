import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from '@jridgewell/sourcemap-codec';
import { describe, it, expect } from 'vitest';
import { PFMParser, WireEmitter } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { ComponentScope, CursorHTMLRenderer } from '../src/html_cursor';
import type { SmartPunctuation } from '../src/html_cursor';

function parse(source: string) {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	new PFMParser(tree).parse(source);
	return tree.get_buffer();
}

type Setup = (renderer: CursorHTMLRenderer) => void;

/**
 * the html every walk renders, which must agree, a setup adds a scope or a
 * template, which the cached walk does not take
 */
function every_walk(
	source: string,
	smart: SmartPunctuation | undefined,
	setup?: Setup
): string {
	const folded = new CursorHTMLRenderer({ cache: false });
	const mapped = new CursorHTMLRenderer({ cache: false });
	const fused = new CursorHTMLRenderer({ cache: false });
	const traced = new CursorHTMLRenderer({ cache: false });
	for (const renderer of [folded, mapped, fused, traced]) {
		if (smart !== undefined) renderer.smart_punctuation = smart;
		setup?.(renderer);
	}
	folded.update(parse(source), source);
	mapped.update_mapped(parse(source), source);
	fused.update_v3(parse(source), source, source);
	traced.update_trace(parse(source), source);
	const walks = [folded.html, mapped.html, fused.html, traced.html];
	if (!setup) {
		const cached = new CursorHTMLRenderer();
		if (smart !== undefined) cached.smart_punctuation = smart;
		cached.update(parse(source), source);
		walks.push(cached.html);
	}
	for (const html of walks) expect(html).toBe(walks[0]);
	return walks[0];
}

/** the inside of the one paragraph a line renders */
function line(source: string, smart: SmartPunctuation = true): string {
	const html = every_walk(source + '\n', smart);
	expect(html.startsWith('<p>') && html.endsWith('</p>')).toBe(true);
	return html.slice(3, -4);
}

describe('smart punctuation, which way a quote faces', () => {
	const rules: Record<string, [string, string][]> = {
		'a quote after a space opens and any other closes': [
			['"Hello," she said.', '“Hello,” she said.'],
			["'Hello,' she said.", '‘Hello,’ she said.'],
			['she said "hello"', 'she said “hello”'],
			['a "b" c "d" e', 'a “b” c “d” e'],
		],
		'a quote with a space on both sides stays straight': [
			['a " b', 'a &quot; b'],
			["a ' b", "a ' b"],
		],
		'an apostrophe is a closing single quote': [
			["it's the dogs' bowl", 'it’s the dogs’ bowl'],
			["don't, can't, won't", 'don’t, can’t, won’t'],
			["the 1990's and the 90's", 'the 1990’s and the 90’s'],
		],
		'a quote opens after an opening bracket, a dash or a quote that just opened':
			[
				['("quoted")', '(“quoted”)'],
				['["quoted"]', '[“quoted”]'],
				['well-"known"', 'well-“known”'],
				['("\'nested\' quotes")', '(“‘nested’ quotes”)'],
				['"\'nested\' first"', '“‘nested’ first”'],
				['she said "he said \'no\'"', 'she said “he said ‘no’”'],
			],
		'a bracket or dash does not open a quote with a space after it': [
			['a (" b', 'a (” b'],
		],
		'the start and the end of a block are space': [
			['"start', '“start'],
			['end"', 'end”'],
			['"', '&quot;'],
			['end "', 'end &quot;'],
			['"whole"', '“whole”'],
		],
		'quotes are not paired, so a leading apostrophe opens and a measurement closes':
			[
				["'90s rock 'n' roll", '‘90s rock ‘n’ roll'],
				['6\'2" tall', '6’2” tall'],
			],
	};
	for (const [rule, cases] of Object.entries(rules))
		describe(rule, () => {
			for (const [source, html] of cases)
				it(source, () => expect(line(source)).toBe(html));
		});
});

describe('smart punctuation, a quote at the edge of a text node', () => {
	const rules: Record<string, [string, string][]> = {
		'markup beside a quote is not its neighbour': [
			['_"word"_', '<em>“word”</em>'],
			['"_word_"', '“<em>word</em>”'],
			['a _"word"_ b', 'a <em>“word”</em> b'],
			['*"word"*', '<strong>“word”</strong>'],
			['"*word*"', '“<strong>word</strong>”'],
			['(_"word"_)', '(<em>“word”</em>)'],
		],
		'the neighbour is the text an inline element holds': [
			["don_'t_", 'don_’t_'],
			["_don_'t", '<em>don</em>’t'],
			['_a_ "b"', '<em>a</em> “b”'],
			['_a_"b"', '<em>a</em>”b”'],
			['"a" _b_', '“a” <em>b</em>'],
			['"_a_ b"', '“<em>a</em> b”'],
			['_"a"_\'s', '<em>“a”</em>’s'],
		],
		'code and an expression read as a word': [
			["`Array`'s length", '<code>Array</code>’s length'],
			['"`code`"', '“<code>code</code>”'],
			['`a` "b"', '<code>a</code> “b”'],
			["{name}'s", '{name}’s'],
			['"{name}"', '“{name}”'],
		],
		'a link is looked into': [
			['"[text](/url)"', '“<a href="/url">text</a>”'],
			['["text"](/url)', '<a href="/url">“text”</a>'],
			["[text](/url)'s", '<a href="/url">text</a>’s'],
		],
		'typed html is looked into and a br is space': [
			['<b>"quoted"</b>\'s', '<b>“quoted”</b>’s'],
			['"<b>quoted</b>"', '“<b>quoted</b>”'],
			['a<br>"b"', 'a<br>“b”'],
		],
		'text split where a delimiter did not match reads on': [
			['a_b "c" a * "d" e', 'a_b “c” a * “d” e'],
			['x_"y"', 'x_”y”'],
		],
		'a quote nests in one that opened in another node': [
			['"_\'a\'_"', '“<em>‘a’</em>”'],
		],
	};
	for (const [rule, cases] of Object.entries(rules))
		describe(rule, () => {
			for (const [source, html] of cases)
				it(source, () => expect(line(source)).toBe(html));
		});

	it('a soft break is space on both sides', () => {
		expect(line('"a\nb" c\n"d"\ne "\nf')).toBe('“a\nb” c\n“d”\ne &quot;\nf');
	});

	it('a hard break is space', () => {
		expect(line('a\\\n"b" c\\\n"d"')).toBe('a<br />\n“b” c<br />\n“d”');
	});

	it('each block starts and ends on its own', () => {
		expect(
			every_walk('# "A" b\n\n"c"\n\n> "d"\n\n- "e"\n- f "g"\n', true)
		).toBe(
			'<h1>“A” b</h1><p>“c”</p><blockquote>\n<p>“d”</p>\n</blockquote>' +
				'<ul>\n<li>“e”</li>\n<li>f “g”</li>\n\n</ul>'
		);
	});

	it('typed html that is a block starts and ends on its own', () => {
		expect(every_walk('<p>one</p><p>"two"</p>\n', true)).toBe(
			'<p>one</p><p>“two”</p>'
		);
		expect(
			every_walk('<table><tr><td>a</td><td>"b"</td></tr></table>\n', true)
		).toBe('<table><tr><td>a</td><td>“b”</td></tr></table>');
		expect(every_walk("- <div>a</div><div>'b'</div>\n", true)).toBe(
			'<ul>\n<li><div>a</div><div>‘b’</div></li>\n\n</ul>'
		);
	});

	it('an inline element and a component are looked into', () => {
		expect(line("x <span>a</span><i>'s</i> <Tip>b</Tip>'s")).toBe(
			'x <span>a</span><i>’s</i> <Tip>b</Tip>’s'
		);
	});

	it('a comment renders nothing, the text reads on past it', () => {
		expect(line('a <!-- c -->"b" x<!-- c -->\'s')).toBe(
			'a <!-- c -->“b” x<!-- c -->’s'
		);
	});

	it('a table cell starts and ends on its own', () => {
		const html = every_walk(
			'| "a" | b\'s |\n|---|---|\n| \'c\' | "d |\n',
			true
		);
		expect(html).toContain('<th>“a”</th>');
		expect(html).toContain('<th>b’s</th>');
		expect(html).toContain('<td>‘c’</td>');
		expect(html).toContain('<td>“d</td>');
	});
});

describe('smart punctuation, dashes and ellipses', () => {
	const rules: Record<string, [string, string][]> = {
		'two hyphens are an en dash, three an em dash and three dots an ellipsis': [
			['a -- b', 'a – b'],
			['a--b', 'a–b'],
			['1--2', '1–2'],
			['a --- b', 'a — b'],
			['a---b', 'a—b'],
			['wait...', 'wait…'],
			['... and then', '… and then'],
			['a ... b', 'a … b'],
		],
		'a run of any other length stays as written': [
			['a - b', 'a - b'],
			['a ---- b', 'a ---- b'],
			['a ----- b', 'a ----- b'],
			['a.. b', 'a.. b'],
			['a.... b', 'a.... b'],
			['a . . . b', 'a . . . b'],
		],
		'two hyphens after a space and before a letter are a flag': [
			['run it with --name', 'run it with --name'],
			['--watch reruns it', '--watch reruns it'],
			['a --b-- c', 'a --b– c'],
			['use --no-color or --x', 'use --no-color or --x'],
		],
		'two hyphens anywhere else are a dash': [
			['a --1', 'a –1'],
			['a ---name', 'a —name'],
			['(--name)', '(–name)'],
		],
		'every kind in one text': [
			['"a"--\'b\'...', '“a”–‘b’…'],
			['"Wait..." -- he said --- \'no\'', '“Wait…” – he said — ‘no’'],
		],
	};
	for (const [rule, cases] of Object.entries(rules))
		describe(rule, () => {
			for (const [source, html] of cases)
				it(source, () => expect(line(source)).toBe(html));
		});

	it('a flag at the start of a line is a flag', () => {
		expect(line('use\n--name here')).toBe('use\n--name here');
	});

	it('a dash beside an inline element', () => {
		expect(line('_a_--_b_')).toBe('<em>a</em>–<em>b</em>');
		expect(line('`a` --b')).toBe('<code>a</code> --b');
	});

	it('the other escapes of text still apply', () => {
		expect(line('a & b -- c < d > e "f" &amp; &quot;g&quot; &#39;h&#39;')).toBe(
			'a &amp; b – c &lt; d &gt; e “f” &amp; &quot;g&quot; &#39;h&#39;'
		);
	});
});

describe('smart punctuation, the option', () => {
	const SOURCE = '"a" -- \'b\' --- c...';

	it('unset and false leave the text as written', () => {
		const plain = "&quot;a&quot; -- 'b' --- c...";
		expect(line(SOURCE, false)).toBe(plain);
		expect(every_walk(SOURCE + '\n', undefined)).toBe('<p>' + plain + '</p>');
	});

	it('true and an empty object turn every kind on', () => {
		expect(line(SOURCE, true)).toBe('“a” – ‘b’ — c…');
		expect(line(SOURCE, {})).toBe('“a” – ‘b’ — c…');
	});

	it('each kind turns off alone', () => {
		expect(line(SOURCE, { quotes: false })).toBe("&quot;a&quot; – 'b' — c…");
		expect(line(SOURCE, { dashes: false })).toBe('“a” -- ‘b’ --- c…');
		expect(line(SOURCE, { ellipses: false })).toBe('“a” – ‘b’ — c...');
		expect(
			line(SOURCE, { quotes: false, dashes: false, ellipses: false })
		).toBe("&quot;a&quot; -- 'b' --- c...");
	});

	it('four strings replace the quotes', () => {
		const french: SmartPunctuation = {
			quotes: ['«\u00a0', '\u00a0»', '“', '”'],
		};
		expect(line('"a \'b\' c"', french)).toBe('«\u00a0a “b” c\u00a0»');
		const german: SmartPunctuation = { quotes: ['„', '“', '‚', '‘'] };
		expect(line('"a \'b\' c"', german)).toBe('„a ‚b‘ c“');
	});

	it('an apostrophe stays an apostrophe whatever the closing single quote is', () => {
		const german: SmartPunctuation = { quotes: ['„', '“', '‚', '‘'] };
		expect(line("it's 'so' and the dogs' bowl", german)).toBe(
			'it’s ‚so‘ and the dogs‘ bowl'
		);
		expect(line("`Array`'s and {name}'s", german)).toBe(
			'<code>Array</code>’s and {name}’s'
		);
	});

	it('a quote string is text, a reference in it stays', () => {
		expect(line('"a"', { quotes: ['&laquo;&nbsp;', '<{', '‘', '’'] })).toBe(
			'&laquo;&nbsp;a&lt;&#123;'
		);
	});

	it('anything but four strings throws', () => {
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.smart_punctuation = {
			quotes: ['a', 'b'] as unknown as [string, string, string, string],
		};
		expect(() => renderer.update(parse('"a"\n'), '"a"\n')).toThrow(TypeError);
	});

	it('the option lasts until it is cleared and release clears it', () => {
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.smart_punctuation = true;
		renderer.update(parse('"a"\n'), '"a"\n');
		expect(renderer.html).toBe('<p>“a”</p>');
		renderer.update(parse('"b"\n'), '"b"\n');
		expect(renderer.html).toBe('<p>“b”</p>');
		renderer.release();
		renderer.update(parse('"c"\n'), '"c"\n');
		expect(renderer.html).toBe('<p>&quot;c&quot;</p>');
	});

	it('a render with the option leaves none for the next renderer', () => {
		const smart = new CursorHTMLRenderer({ cache: false });
		smart.smart_punctuation = true;
		smart.update(parse('"a" `b`\n'), '"a" `b`\n');
		const plain = new CursorHTMLRenderer({ cache: false });
		plain.update(parse('"a" -- `b`\n'), '"a" -- `b`\n');
		expect(plain.html).toBe('<p>&quot;a&quot; -- <code>b</code></p>');
	});
});

describe('smart punctuation, what is never touched', () => {
	it('code spans and fences', () => {
		expect(
			every_walk('`"a" -- b...` "c"\n\n```\n"a" -- b...\n```\n', true)
		).toBe(
			'<p><code>&quot;a&quot; -- b...</code> “c”</p>' +
				'<pre><code>&quot;a&quot; -- b...</code></pre>'
		);
	});

	it('math', () => {
		expect(every_walk('```math\na -- "b" ...\n```\n', true)).toBe(
			'<pre><code class="language-math">a -- &quot;b&quot; ...</code></pre>'
		);
		expect(every_walk('"a" $`b -- "c" ...`$ "d"\n', true)).toBe(
			'<p>“a” <code>b -- &quot;c&quot; ...</code> “d”</p>'
		);
	});

	it('a string in a svelte expression (#83), the tree has no text there', () => {
		expect(line('{"a--b"} and {fn(\'it...\')} "c"')).toBe(
			'{"a--b"} and {fn(\'it...\')} “c”'
		);
		expect(every_walk('{#if a === "x--y"}\n\n"b"\n\n{/if}\n', true)).toBe(
			'{#if a === "x--y"}\n<p>“b”</p>{/if}'
		);
		expect(line('{@html "<b>--</b>"} "c"')).toBe('{@html "<b>--</b>"} “c”');
	});

	it('an attribute value (#459), the tree has no text there', () => {
		expect(line('x <Box --css-var="a--b" title="it\'s...">"c"</Box>')).toBe(
			'x <Box --css-var="a--b" title="it\'s...">“c”</Box>'
		);
		expect(line('x <span style="--gap: 1px">a--b</span>')).toBe(
			'x <span style="--gap: 1px">a–b</span>'
		);
		expect(every_walk('<Box --css-var="a--b">\n\n"c"\n\n</Box>\n', true)).toBe(
			'<Box --css-var="a--b"><p>“c”</p></Box>'
		);
	});

	it('the text of an autolink (#424), a check on its link', () => {
		expect(line('<https://example.com/a--b...c> "d"')).toBe(
			'<a href="https://example.com/a--b...c">https://example.com/a--b...c</a> “d”'
		);
	});

	it('the text of any other link is prose', () => {
		expect(line('[a--b](https://example.com/a--b)')).toBe(
			'<a href="https://example.com/a--b">a–b</a>'
		);
	});

	it('urls', () => {
		expect(line('[a](/x--y "t") ![b](/i--j...k)')).toBe(
			'<a href="/x--y" title="t">a</a> <img src="/i--j...k" alt="b" />'
		);
	});

	it('alt and title', () => {
		expect(
			line('![it\'s "a" -- b...](/i "it\'s -- c...") [d](/l \'"e" -- f\')')
		).toBe(
			'<img src="/i" alt="it\'s &quot;a&quot; -- b..." title="it\'s -- c..." /> ' +
				'<a href="/l" title="&quot;e&quot; -- f">d</a>'
		);
	});

	it('typed html that holds code', () => {
		for (const tag of ['code', 'kbd', 'samp', 'var', 'tt'])
			expect(line(`x <${tag}>"a" -- b...</${tag}> "c"`)).toBe(
				`x <${tag}>&quot;a&quot; -- b...</${tag}> “c”`
			);
	});

	it('typed html that holds text as written', () => {
		for (const tag of ['pre', 'textarea'])
			expect(line(`x <${tag}>"a" -- b...</${tag}> "c"`)).toBe(
				`x <${tag}>"a" -- b...</${tag}> “c”`
			);
	});

	it('typed html that holds code, at any depth and as a block', () => {
		expect(line('x <code>a <b>"b" _--_</b></code> "c"')).toBe(
			'x <code>a <b>&quot;b&quot; <em>--</em></b></code> “c”'
		);
		expect(every_walk('<pre>\n"a" -- b...\n</pre>\n\n"c"\n', true)).toBe(
			'<pre>\n"a" -- b...\n</pre><p>“c”</p>'
		);
	});

	it('any other typed html holds prose', () => {
		expect(line('x <span>"a" -- b...</span>')).toBe('x <span>“a” – b…</span>');
	});

	it('a script and a style', () => {
		const source =
			'<script>\n\tlet a = "x--y...";\n</script>\n\n<style>\n\tp::before { content: "--"; }\n</style>\n\n"b"\n';
		expect(every_walk(source, true)).toBe(
			'<script>\n\tlet a = "x--y...";\n</script>' +
				'<style>\n\tp::before { content: "--"; }\n</style><p>“b”</p>'
		);
	});

	it('a character the author escaped', () => {
		expect(line('\\"a\\" \\\'b\\\' c\\-- d\\... "e"')).toBe(
			"&quot;a&quot; 'b' c-- d... “e”"
		);
	});

	it('an escape anywhere in a run of hyphens or dots keeps the whole run', () => {
		expect(line('a\\---b c--\\-d e-\\-f')).toBe('a---b c---d e--f');
		expect(line('a\\...b c...\\.d e..\\.f')).toBe('a...b c....d e...f');
	});

	it('an escaped backslash escapes nothing after it', () => {
		expect(line('a\\\\"b" c\\\\--d')).toBe('a\\”b” c\\–d');
	});

	it('a character reference', () => {
		expect(line('&quot;a&quot; &#39;b&#39; &ndash; &hellip; "c"')).toBe(
			'&quot;a&quot; &#39;b&#39; &ndash; &hellip; “c”'
		);
	});

	it('a nul character stays, reads as space and ends nothing', () => {
		const nul = String.fromCharCode(0);
		expect(line(`a${nul} "b" c${nul}"d" -- e${nul}...`)).toBe(
			`a${nul} “b” c${nul}“d” – e${nul}…`
		);
	});

	it('a typed curly quote, dash or ellipsis', () => {
		expect(line('“a” ‘b’ – — … "c"')).toBe('“a” ‘b’ – — … “c”');
	});

	it('frontmatter, a thematic break, a comment and a table delimiter row', () => {
		expect(
			every_walk(
				'---\ntitle: "a--b"\n---\n\n"a"\n\n---\n\n<!-- "b" -- c... -->\n\n| a |\n|---|\n| b |\n',
				true
			)
		).toBe(
			'<p>“a”</p><hr /><!-- "b" -- c... --><table>\n<thead>\n<tr>\n<th>a</th>\n</tr>\n</thead>\n' +
				'<tbody>\n<tr>\n<td>b</td>\n</tr>\n</tbody>\n</table>'
		);
	});

	it('a string a plugin stored on a text node', () => {
		const source = '"a" x "b"\n';
		const tree = new TreeBuilder(128);
		new PFMParser(tree).parse(source);
		const buf = tree.get_buffer();
		// the paragraph is node 1 and its text node 2
		buf.own_strings()[2] = '"stored" -- ...';
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.smart_punctuation = true;
		renderer.update(buf, source);
		expect(renderer.html).toBe('<p>&quot;stored&quot; -- ...</p>');
	});
});

describe('smart punctuation, replacements and templates', () => {
	it('text inside a replaced element is prose', () => {
		const html = every_walk('"a" _"b"_ `"c"`\n', true, (renderer) => {
			renderer.scope = new ComponentScope(
				[{ specifier: './c.svelte', names: ['em', 'code'] }],
				'G'
			);
		});
		expect(html).toContain(
			'<p>“a” <Em_MDSVEX_G>“b”</Em_MDSVEX_G> ' +
				'<Code_MDSVEX_G>&quot;c&quot;</Code_MDSVEX_G></p>'
		);
	});

	it('a wrapped document', () => {
		const html = every_walk('"a" -- b\n', true, (renderer) => {
			renderer.template = { specifier: './t.svelte', metadata: false };
		});
		expect(html).toContain('<p>“a” – b</p>');
	});
});

describe('smart punctuation, a tree with no source', () => {
	it('a tree built from the wire shows the text as written', () => {
		const source = '"a" -- it\'s... `b`\n';
		const wire = new WireEmitter();
		wire.set_source(source);
		new PFMParser(wire).parse(source);
		const builder = new WireTreeBuilder();
		builder.apply(wire.flush());
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.smart_punctuation = true;
		renderer.update(builder.get_buffer(), '');
		expect(renderer.html).toBe(
			"<p>&quot;a&quot; -- it's... <code>b</code></p>"
		);
	});
});

describe('smart punctuation, the incremental render', () => {
	it('a document fed in pieces ends as the whole document does', () => {
		const source =
			'# "A" -- b\n\n"Hello," she _"said"_... it\'s `x`\'s --flag\n\n- \'a\'\n- b --- c\n\n> "d\n> e"\n';
		const whole = every_walk(source, true);
		for (const size of [1, 3, 7]) {
			const tree = new TreeBuilder(128);
			const parser = new PFMParser(tree);
			const renderer = new CursorHTMLRenderer();
			renderer.smart_punctuation = true;
			parser.init();
			let fed = '';
			for (let i = 0; i < source.length; i += size) {
				const chunk = source.slice(i, i + size);
				fed += chunk;
				parser.feed(chunk);
				renderer.update(tree.get_buffer(), fed);
			}
			parser.finish();
			renderer.update(tree.get_buffer(), fed);
			expect(renderer.html).toBe(whole);
		}
	});
});

const FIXTURES = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../parse/test/fixtures'
);

function fixture_files(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...fixture_files(path));
		else if (/\.(md|svx)$/.test(entry.name)) files.push(path);
	}
	return files;
}

describe('smart punctuation, the rest of the text', () => {
	// these quotes write what the source has, so only the apostrophe differs
	const same: SmartPunctuation = {
		quotes: ['&quot;', '&quot;', "'", "'"],
		dashes: false,
		ellipses: false,
	};

	it('every parser fixture renders as it does without the option', () => {
		const files = fixture_files(FIXTURES);
		expect(files.length).toBeGreaterThan(100);
		for (const file of files) {
			const source = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
			const plain = new CursorHTMLRenderer({ cache: false });
			plain.update(parse(source), source);
			const smart = every_walk(source, same);
			expect(smart.replace(/’/g, "'"), file).toBe(
				plain.html.replace(/’/g, "'")
			);
		}
	});

	it('a document with nothing to replace is the same string', () => {
		const source = '# a\n\nb _c_ `d` & <e> {f} [g](h)\n\n- i\n- j\n';
		const plain = new CursorHTMLRenderer({ cache: false });
		plain.update(parse(source), source);
		expect(every_walk(source, true)).toBe(plain.html);
	});
});

describe('smart punctuation, one answer in every walk', () => {
	const PIECES = [
		'"',
		"'",
		'-',
		'--',
		'.',
		'...',
		' ',
		' ',
		'a',
		'b1',
		'\n',
		'_',
		'*',
		'(',
		')',
		'\\',
		'`',
		'[',
		'](/u)',
		'<b>',
		'</b>',
		'{x}',
		'&',
		'<',
		'~',
	];

	function random_line(next: () => number): string {
		let out = '';
		const length = 4 + Math.floor(next() * 28);
		for (let i = 0; i < length; i++)
			out += PIECES[Math.floor(next() * PIECES.length)];
		return out;
	}

	// the fold walk renders a run of text nodes as one slice, the mapped walks one node at a time
	it('random text renders the same folded, mapped, traced and cached', () => {
		let seed = 0x5eed;
		const next = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
			return seed / 0x100000000;
		};
		const french: SmartPunctuation = {
			quotes: ['«\u00a0', '\u00a0»', '‹', '›'],
		};
		for (let i = 0; i < 1500; i++) {
			const source = 'x ' + random_line(next) + '\n';
			every_walk(source, i % 3 === 0 ? french : true);
		}
	});
});

describe('smart punctuation, source maps', () => {
	function mapped(source: string) {
		const renderer = new CursorHTMLRenderer({ cache: false });
		renderer.smart_punctuation = true;
		const { mappings } = renderer.update_mapped(parse(source), source);
		const content = mappings.filter((m) => m.data.role === 'content');
		const html = renderer.html;
		const map = renderer.update_v3(parse(source), source, source);
		expect(renderer.html).toBe(html);
		const trace = new CursorHTMLRenderer({ cache: false });
		trace.smart_punctuation = true;
		trace.update_trace(parse(source), source);
		expect(trace.html).toBe(html);
		return { html, content, segments: decode(map.mappings)[0] };
	}

	it('a quote is one character for one, so its text maps character by character', () => {
		const source = 'say "a" it\'s\n';
		const { html, content, segments } = mapped(source);
		expect(html).toBe('<p>say “a” it’s</p>');
		expect(content).toHaveLength(1);
		expect(content[0].sourceOffsets).toEqual([0]);
		expect(content[0].generatedOffsets).toEqual([3]);
		expect(content[0].lengths).toEqual([12]);
		expect(content[0].generatedLengths).toBeUndefined();
		for (const at of [html.indexOf('“'), html.indexOf('”'), html.indexOf('’')])
			expect(segments).toContainEqual([at, 0, 0, at - 3]);
		expect(source[html.indexOf('”') - 3]).toBe('"');
		expect(source[html.indexOf('’') - 3]).toBe("'");
	});

	it('a dash or an ellipsis shortens the text, which then maps as one range from its start', () => {
		const source = 'x -- y... z\n';
		const { html, content, segments } = mapped(source);
		expect(html).toBe('<p>x – y… z</p>');
		expect(content).toHaveLength(1);
		expect(content[0].sourceOffsets).toEqual([0]);
		expect(content[0].lengths).toEqual([11]);
		expect(content[0].generatedOffsets).toEqual([3]);
		expect(content[0].generatedLengths).toEqual([8]);
		expect(segments).toContainEqual([3, 0, 0, 0]);
		expect(segments.some((s) => s[0] > 3 && s[0] < 11)).toBe(false);
	});

	it('the text after a substitution maps from its own node', () => {
		const source = 'a -- b _c_ "d"\n';
		const { html, content } = mapped(source);
		expect(html).toBe('<p>a – b <em>c</em> “d”</p>');
		const last = content[content.length - 1];
		const at = html.indexOf(' “d”');
		expect(last.generatedOffsets).toEqual([at]);
		expect(last.sourceOffsets).toEqual([source.indexOf(' "d"')]);
		expect(last.lengths).toEqual([4]);
		expect(last.generatedLengths).toBeUndefined();
	});
});
