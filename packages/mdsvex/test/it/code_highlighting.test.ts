import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import { lines } from '../utils';
import * as shiki from 'shiki';

import { mdsvex } from '../../src';

const highlight = suite('code-highlighting');

highlight('it should not highlight code when false is passed', async () => {
	const output = await mdsvex({ highlight: false }).markup({
		content: `
\`\`\`js
const some_var = whatever;
\`\`\`
    `,
		filename: 'thing.svx',
	});

	assert.equal(
		lines(`
<pre><code class="language-js">const some_var = whatever;
</code></pre>`),
		output && lines(output.code)
	);
});

highlight('it should escape code when false is passed', async () => {
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

	assert.equal(
		lines(`<pre><code class="language-html">&lt;script&gt;
  function() &#123;
    whatever;
  &#125;
&lt;/script&gt;
</code></pre>`),
		output && lines(output.code)
	);
});

highlight('it should highlight code when nothing is passed', async () => {
	const output = await mdsvex().markup({
		content: `
\`\`\`js
const thing = 'string';
\`\`\`
    `,
		filename: 'thing.svx',
	});

	assert.equal(
		lines(
			`<pre class="language-js">{@html \`<code class="language-js"><span class="token keyword">const</span> thing <span class="token operator">=</span> <span class="token string">'string'</span><span class="token punctuation">;</span></code>\`}</pre>`
		),
		output && lines(output.code)
	);
});

highlight('it should escape when highlighting (kinda)', async () => {
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

	assert.equal(
		lines(`<pre class="language-js">{@html \`<code class="language-js"><span class="token keyword">function</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token punctuation">&#123;</span>
	whatever<span class="token punctuation">;</span>
<span class="token punctuation">&#125;</span></code>\`}</pre>`),
		output && lines(output.code)
	);
});

highlight(
	'it should escape characters with special meaning inside {@html} used by default highlighter',
	async () => {
		const output = await mdsvex().markup({
			content: `\`\`\`js
const evil = '{ } \` \\t \\r \\n';
\`\`\``,
			filename: 'thing.svx',
		});
		assert.equal(
			lines(
				'<pre class="language-js">{@html `' +
					'<code class="language-js"><span class="token keyword">const</span> evil <span class="token operator">=</span> <span class="token string">\'&#123; &#125; &#96; &#92;t &#92;r &#92;n\'</span><span class="token punctuation">;</span></code>`}' +
					'</pre>'
			),
			output && lines(output.code)
		);
	}
);

highlight(
	'it should highlight code when nothing is passed, with a non-default language',
	async () => {
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

		assert.equal(
			lines(`<pre class="language-ruby">{@html \`<code class="language-ruby">print <span class="token string">'Please type name >'</span>
name <span class="token operator">=</span> gets<span class="token punctuation">.</span>chomp
puts <span class="token string">"Hello <span class="token interpolation"><span class="token delimiter tag">#&#123;</span>name<span class="token delimiter tag">&#125;</span></span>."</span></code>\`}</pre>`),
			output && lines(output.code)
		);
	}
);

highlight(
	'it should highlight code when nothing is passed, with a more obscure language',
	async () => {
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

		assert.equal(
			lines(`<pre class="language-ebnf">{@html \`<code class="language-ebnf"><span class="token definition rule keyword">SYNTAX</span> <span class="token operator">=</span> <span class="token rule">SYNTAX RULE</span><span class="token punctuation">,</span> <span class="token punctuation">(:</span> <span class="token rule">SYNTAX RULE</span> <span class="token punctuation">:)</span><span class="token punctuation">.</span>
<span class="token definition rule keyword">SYNTAX RULE</span>
  <span class="token operator">=</span> <span class="token rule">META IDENTIFIER</span><span class="token punctuation">,</span> <span class="token string">'='</span><span class="token punctuation">,</span> <span class="token rule">DEFINITIONS LIST</span><span class="token punctuation">,</span> <span class="token string">'.'</span><span class="token punctuation">.</span> <span class="token comment">(* '.' instead of ';' *)</span>
<span class="token definition rule keyword">DEFINITIONS LIST</span>
  <span class="token operator">=</span> <span class="token rule">SINGLE DEFINITION</span><span class="token punctuation">,</span>
    <span class="token punctuation">(:</span> <span class="token string">'/'</span><span class="token punctuation">,</span> <span class="token rule">SINGLE DEFINITION</span> <span class="token punctuation">:)</span><span class="token punctuation">.</span></code>\`}</pre>`),
			output && lines(output.code)
		);
	}
);

highlight(
	'Should be possible to pass a custom highlight function ',
	async () => {
		function _highlight(code: string, lang: string | undefined): string {
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

		assert.equal(
			lines(`<code class="somecode">i am some code</code>`),
			output && lines(output.code)
		);
	}
);

highlight(
	'Should be possible to pass an async custom highlight function ',
	async () => {
		async function _highlight(
			code: string,
			lang: string | undefined
		): Promise<string> {
			// const shiki = require('shiki');
			const highlighter = await shiki.getHighlighter({
				theme: 'material-theme-palenight',
			});
			return highlighter.codeToHtml(code, lang);
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

		assert.equal(
			lines(`<pre class=\"shiki\" style=\"background-color: #292D3E\"><code><span class=\"line\"><span style=\"color: #89DDFF\">import</span><span style=\"color: #A6ACCD\"> os</span></span>
<span class=\"line\"><span style=\"color: #A6ACCD\">key </span><span style=\"color: #89DDFF\">=</span><span style=\"color: #A6ACCD\"> os</span><span style=\"color: #89DDFF\">.</span><span style=\"color: #F07178\">environ</span><span style=\"color: #89DDFF\">[</span><span style=\"color: #89DDFF\">&quot;</span><span style=\"color: #C3E88D\">SECRET_KEY</span><span style=\"color: #89DDFF\">&quot;</span><span style=\"color: #89DDFF\">]</span></span></code></pre>`),
			output && lines(output.code)
		);
	}
);

highlight(
	'Should be possible to define a custom alias for a language',
	async () => {
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

		assert.equal(
			lines(
				`<pre class="language-beeboo">{@html \`<code class="language-beeboo"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>h1</span><span class="token punctuation">></span></span>Title<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>h1</span><span class="token punctuation">></span></span></code>\`}</pre>`
			),
			output && lines(output.code)
		);
	}
);

highlight(
	'Should be possible to add additional highlighting grammars',
	async () => {
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

		assert.equal(
			lines(
				`<pre class="language-svelte">{@html \`<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>h1</span><span class="token punctuation">></span></span>Title<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>h1</span><span class="token punctuation">></span></span></code>\`}</pre>`
			),
			output && lines(output.code)
		);
	}
);

highlight.run();
