import { test, expect } from 'vitest';
import { lines } from '../utils';
import * as shiki from 'shiki';

import { mdsvex } from '../../src';

test('it should not highlight code when false is passed', async () => {
	const output = await mdsvex({ highlight: false }).markup({
		content: `
\`\`\`js
const some_var = whatever;
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(`
		<pre><code class="language-js">const some_var = whatever;
		</code></pre>`)
	);
});

test('it should escape code when false is passed', async () => {
	const output = await mdsvex({ highlight: false }).markup({
		content: `
\`\`\`html
<script>
  function() {
    whatever;
  }
</script>
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(`<pre><code class="language-html">&lt;script&gt;
  function() &#123;
    whatever;
  &#125;
&lt;/script&gt;
</code></pre>`)
	);
});

test('it should highlight code when nothing is passed', async () => {
	const output = await mdsvex().markup({
		content: `
\`\`\`js
const thing = 'string';
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(
			`<pre class="language-js">{@html \`<code class="language-js"><span class="token keyword">const</span> thing <span class="token operator">=</span> <span class="token string">'string'</span><span class="token punctuation">;</span></code>\`}</pre>`
		)
	);
});

test('it should escape when highlighting (kinda)', async () => {
	const output = await mdsvex().markup({
		content: `
\`\`\`js
function() {
	whatever;
}
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(`<pre class="language-js">{@html \`<code class="language-js"><span class="token keyword">function</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token punctuation">&#123;</span>
	whatever<span class="token punctuation">;</span>
<span class="token punctuation">&#125;</span></code>\`}</pre>`)
	);
});

test('it should escape characters with special meaning inside {@html} used by default highlighter', async () => {
	const output = await mdsvex().markup({
		content: `\`\`\`js
const evil = '{ } \` \\t \\r \\n';
\`\`\``,
		filename: 'thing.svx',
	});
	expect(lines(output?.code.trim())).toEqual(
		lines(
			'<pre class="language-js">{@html `' +
				'<code class="language-js"><span class="token keyword">const</span> evil <span class="token operator">=</span> <span class="token string">\'&#123; &#125; &#96; &#92;t &#92;r &#92;n\'</span><span class="token punctuation">;</span></code>`}' +
				'</pre>'
		)
	);
});

test('it should highlight code when nothing is passed, with a non-default language', async () => {
	const output = await mdsvex().markup({
		content: `
\`\`\`ruby
print 'Please type name >'
name = gets.chomp
puts "Hello #{name}."
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(`<pre class="language-ruby">{@html \`<code class="language-ruby">print <span class="token string">'Please type name >'</span>
name <span class="token operator">=</span> gets<span class="token punctuation">.</span>chomp
puts <span class="token string">"Hello <span class="token interpolation"><span class="token delimiter tag">#&#123;</span>name<span class="token delimiter tag">&#125;</span></span>."</span></code>\`}</pre>`)
	);
});

test('it should highlight code when nothing is passed, with a more obscure language', async () => {
	const output = await mdsvex().markup({
		content: `
\`\`\`ebnf
SYNTAX = SYNTAX RULE, (: SYNTAX RULE :).
SYNTAX RULE
  = META IDENTIFIER, '=', DEFINITIONS LIST, '.'. (* '.' instead of ';' *)
DEFINITIONS LIST
  = SINGLE DEFINITION,
    (: '/', SINGLE DEFINITION :).
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(`<pre class="language-ebnf">{@html \`<code class="language-ebnf"><span class="token definition rule keyword">SYNTAX</span> <span class="token operator">=</span> <span class="token rule">SYNTAX RULE</span><span class="token punctuation">,</span> <span class="token punctuation">(:</span> <span class="token rule">SYNTAX RULE</span> <span class="token punctuation">:)</span><span class="token punctuation">.</span>
<span class="token definition rule keyword">SYNTAX RULE</span>
  <span class="token operator">=</span> <span class="token rule">META IDENTIFIER</span><span class="token punctuation">,</span> <span class="token string">'='</span><span class="token punctuation">,</span> <span class="token rule">DEFINITIONS LIST</span><span class="token punctuation">,</span> <span class="token string">'.'</span><span class="token punctuation">.</span> <span class="token comment">(* '.' instead of ';' *)</span>
<span class="token definition rule keyword">DEFINITIONS LIST</span>
  <span class="token operator">=</span> <span class="token rule">SINGLE DEFINITION</span><span class="token punctuation">,</span>
    <span class="token punctuation">(:</span> <span class="token string">'/'</span><span class="token punctuation">,</span> <span class="token rule">SINGLE DEFINITION</span> <span class="token punctuation">:)</span><span class="token punctuation">.</span></code>\`}</pre>`)
	);
});

test('Should be possible to pass a custom highlight function ', async () => {
	function _highlight(code: string, lang: string | undefined | null): string {
		return `<code class="${lang}">${code}</code>`;
	}

	const output = await mdsvex({
		highlight: { highlighter: _highlight },
	}).markup({
		content: `
\`\`\`somecode
i am some code
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(`<code class="somecode">i am some code</code>`)
	);
});

test('Custom highlight functions receive the metastring', async () => {
	function _highlight(
		code: string,
		lang: string | undefined | null,
		meta: string | undefined | null
	): string {
		return `<code class="${lang}-${meta}">${code}</code>`;
	}

	const output = await mdsvex({
		highlight: { highlighter: _highlight },
	}).markup({
		content: `
\`\`\`somecode hello-friends what are you
i am some code
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(
			`<code class="somecode-hello-friends what are you">i am some code</code>`
		)
	);
});

test('Should be possible to pass an async custom highlight function ', async () => {
	async function _highlight(
		code: string,
		lang: string | undefined | null
	): Promise<string> {
		// const shiki = require('shiki');
		const highlighter = await shiki.getHighlighter({
			theme: 'material-theme-palenight',
		});
		return highlighter.codeToHtml(code, lang || undefined);
	}

	const output = await mdsvex({
		highlight: { highlighter: _highlight },
	}).markup({
		content: `
\`\`\`python
import os
key = os.environ["SECRET_KEY"]
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(`<pre class=\"shiki\" style=\"background-color: #292D3E\"><code><span class=\"line\"><span style=\"color: #89DDFF\">import</span><span style=\"color: #A6ACCD\"> os</span></span>
<span class=\"line\"><span style=\"color: #A6ACCD\">key </span><span style=\"color: #89DDFF\">=</span><span style=\"color: #A6ACCD\"> os</span><span style=\"color: #89DDFF\">.</span><span style=\"color: #F07178\">environ</span><span style=\"color: #89DDFF\">[</span><span style=\"color: #89DDFF\">&quot;</span><span style=\"color: #C3E88D\">SECRET_KEY</span><span style=\"color: #89DDFF\">&quot;</span><span style=\"color: #89DDFF\">]</span></span></code></pre>`)
	);
});

test('Should be possible to define a custom alias for a language', async () => {
	const output = await mdsvex({
		highlight: { alias: { beeboo: 'html' } },
	}).markup({
		content: `
\`\`\`beeboo
<h1>Title</h1>
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(
			`<pre class="language-beeboo">{@html \`<code class="language-beeboo"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>h1</span><span class="token punctuation">></span></span>Title<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>h1</span><span class="token punctuation">></span></span></code>\`}</pre>`
		)
	);
});

test('Svelte syntax is highlighted by default', async () => {
	const output = await mdsvex().markup({
		content: `
\`\`\`svelte
{#if condition}
  <Hello />
{/if}
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(
			`<pre class="language-svelte">{@html \`<code class="language-svelte"><span class="token language-javascript"><span class=\"token punctuation">&#123;</span>#<span class="token keyword">if</span> condition<span class="token punctuation">&#125;</span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Hello</span> <span class="token punctuation">/></span></span>
<span class="token language-javascript"><span class="token punctuation">&#123;</span><span class="token operator">/</span><span class="token keyword">if</span><span class="token punctuation">&#125;</span></span></code>\`}</pre>`
		)
	);
});

test('Svelte syntax is highlighted by default: using custom alias', async () => {
	const output = await mdsvex({
		highlight: { alias: { beeboo: 'svelte' } },
	}).markup({
		content: `
\`\`\`beeboo
{#if condition}
  <Hello />
{/if}
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(
			`<pre class="language-beeboo">{@html \`<code class="language-beeboo"><span class="token language-javascript"><span class=\"token punctuation">&#123;</span>#<span class="token keyword">if</span> condition<span class="token punctuation">&#125;</span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Hello</span> <span class="token punctuation">/></span></span>
<span class="token language-javascript"><span class="token punctuation">&#123;</span><span class="token operator">/</span><span class="token keyword">if</span><span class="token punctuation">&#125;</span></span></code>\`}</pre>`
		)
	);
});

test('Svelte syntax is highlighted by default: using sv alias', async () => {
	const output = await mdsvex().markup({
		content: `
\`\`\`sv
{#if condition}
  <Hello />
{/if}
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(
			`<pre class="language-sv">{@html \`<code class="language-sv"><span class="token language-javascript"><span class=\"token punctuation">&#123;</span>#<span class="token keyword">if</span> condition<span class="token punctuation">&#125;</span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Hello</span> <span class="token punctuation">/></span></span>
<span class="token language-javascript"><span class="token punctuation">&#123;</span><span class="token operator">/</span><span class="token keyword">if</span><span class="token punctuation">&#125;</span></span></code>\`}</pre>`
		)
	);
});

test('Should be possible to add additional highlighting grammars', async () => {
	require('prismjs');
	require('prism-svelte');
	const output = await mdsvex({
		highlight: { alias: { beeboo: 'html' } },
	}).markup({
		content: `
\`\`\`svelte
<h1>Title</h1>
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(
			`<pre class="language-svelte">{@html \`<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>h1</span><span class="token punctuation">></span></span>Title<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>h1</span><span class="token punctuation">></span></span></code>\`}</pre>`
		)
	);
});

test('lang definitions should be case insensitive', async () => {
	const output = await mdsvex().markup({
		content: `
\`\`\`Docker
RUN bash -lc "rvm install ruby-2.5.1 && \
              rvm use ruby-ruby-2.5.1 --default"
\`\`\`
    `,
		filename: 'thing.svx',
	});

	expect(lines(output?.code.trim())).toEqual(
		lines(
			`<pre class="language-docker">{@html \`<code class="language-docker"><span class="token keyword">RUN</span> bash <span class="token punctuation">-</span>lc <span class="token string">"rvm install ruby-2.5.1 &amp;&amp;               rvm use ruby-ruby-2.5.1 --default"</span></code>\`}</pre>`
		)
	);
});
