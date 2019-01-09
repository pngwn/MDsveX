import { mdsvex } from './parse';

test('escape curly braces in fenced code blocks', () => {
  const md = `\`\`\`js
function() {
  return true;
}

const obj = { hello: 'hi' };
\`\`\``;

  expect(mdsvex().markup({ content: md, filename: 'file.svexy' }).code)
    .toBe(`<pre><code class=\"language-js\">function() &#123;
  return true;
&#125;

const obj = &#123; hello: 'hi' &#125;;
</code></pre>
`);
});

test('escape curly braces in tabbed code blocks', () => {
  const md = `
    function() {
      return true;
    }

    const obj = { hello: 'hi' };
`;

  expect(mdsvex().markup({ content: md, filename: 'file.svexy' }).code)
    .toBe(`<pre><code>function() &#123;
  return true;
&#125;

const obj = &#123; hello: 'hi' &#125;;
</code></pre>
`);
});

test('escape curly braces in inline code (backticks)', () => {
  const md = `Hello I am a \`{ sentence }\` and that's all`;

  expect(mdsvex().markup({ content: md, filename: 'file.svexy' }).code).toBe(
    `<p>Hello I am a <code>&#123; sentence &#125;</code> and that's all</p>
`
  );
});

test('do not escape curly braces anywhere else: paragraphs', () => {
  const md = `Hello I am a { sentence } and that's all`;

  expect(mdsvex().markup({ content: md, filename: 'file.svexy' }).code).toBe(
    `<p>Hello I am a { sentence } and that's all</p>
`
  );
});

test('do not escape curly braces anywhere else: headings', () => {
  const md = `# { heading }
## { heading }
### { heading }
#### { heading }`;

  expect(mdsvex().markup({ content: md, filename: 'file.svexy' }).code).toBe(
    `<h1>{ heading }</h1>
<h2>{ heading }</h2>
<h3>{ heading }</h3>
<h4>{ heading }</h4>
`
  );
});

test('do not escape curly braces anywhere else: js exec block', () => {
  const md = `# { heading }
\`\`\`js exec
func() {
  return 'yeah';
}
\`\`\`
`;

  expect(mdsvex().markup({ content: md, filename: 'file.svexy' }).code).toBe(
    `<h1>{ heading }</h1>

<script>
func() {
  return 'yeah';
}

</script>`
  );
});
