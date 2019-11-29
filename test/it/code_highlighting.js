import { mdsvex } from '../../src/';

export default function(test) {
	test('it should not highlight code when false is passed', async t => {
		const output = await mdsvex({ highlight: false }).markup({
			content: `
\`\`\`js
const some_var = whatever;
\`\`\`
    `,
			filename: 'thing.svexy',
		});

		t.equal(
			`<pre><code class="language-js">const some_var = whatever;
</code></pre>`,
			output.code
		);
	});

	test('it should not escape code when false is passed', async t => {
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
			filename: 'thing.svexy',
		});

		t.equal(
			`<pre><code class="language-html">&lt;script&gt;
  function() &#123;
    whatever;
  &#125;
&lt;/script&gt;
</code></pre>`,
			output.code
		);
	});

	test('it should highlight code when nothing is passed', async t => {
		const output = await mdsvex().markup({
			content: `
\`\`\`js
const thing = 'string';
\`\`\`
    `,
			filename: 'thing.svexy',
		});

		t.equal(
			`<pre><code class="language-html">&lt;script&gt;
  function() &#123;
    whatever;
  &#125;
&lt;/script&gt;
</code></pre>`,
			output.code
		);
	});
}
