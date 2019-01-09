import { mdsvex } from './parse';

test('`js exec` fenced blocks should not be rendered', () => {
  const md = `

\`\`\`js exec

some stuff
more stuff

hi
\`\`\`

`;

  const html = mdsvex().markup({ content: md, filename: 'file.svexy' });

  expect(html.code).toBe(`
<script>

some stuff
more stuff

hi

</script>`);
});

test('`js` fenced blocks should  be rendered', () => {
  const md = `

\`\`\`js

some stuff
more stuff

hi
\`\`\`

`;

  const html = mdsvex().markup({ content: md, filename: 'file.svexy' });

  expect(html.code).not.toBe('');
});

test('the contents of `js exec` should also be returned', () => {
  const md = `

\`\`\`js exec
import Counter from './Counter.html';
\`\`\`
`;

  const html = mdsvex().markup({ content: md, filename: 'file.svexy' });

  expect(html.code).toBe(`
<script>
import Counter from './Counter.html';

</script>`);
  // expect(html.code.trim()).toBe("import Counter from './Counter.html';");
});

test('the contents of `js exec` should also be returned even if there are several', () => {
  const md = `

\`\`\`js exec
import Counter from './Counter.html';
\`\`\`
\`\`\`js exec
import Counter2 from './Counter2.html';
\`\`\`
\`\`\`js exec
import Counter3 from './Counter3.html';
\`\`\`
`;

  const html = mdsvex().markup({ content: md, filename: 'file.svexy' });

  expect(html.code).toBe(`
<script>
import Counter from './Counter.html';
import Counter2 from './Counter2.html';
import Counter3 from './Counter3.html';

</script>`);
  //expect(html.code.trim()).toBe("import Counter3 from './Counter3.html';");
});

test('`js exec` blocks and markdown should be parsed correctly: #1', () => {
  const md = `# some title

\`\`\`js exec
import Counter from './Counter.html';
\`\`\`
\`\`\`js exec
import Counter2 from './Counter2.html';
\`\`\`
\`\`\`js exec
import Counter3 from './Counter3.html';
\`\`\`
`;

  const html = mdsvex().markup({ content: md, filename: 'file.svexy' });

  expect(html.code.trim()).toBe(`<h1>some title</h1>

<script>
import Counter from './Counter.html';
import Counter2 from './Counter2.html';
import Counter3 from './Counter3.html';

</script>`);
});

test('`js exec` blocks and markdown should be parsed correctly: #2', () => {
  const md = `# some title

\`\`\`js exec
import Counter from './Counter.html';
\`\`\`

some text here

\`\`\`js exec
import Counter2 from './Counter2.html';
\`\`\`

and some text here:
  - and
  - a
  - list

\`\`\`js exec
import Counter3 from './Counter3.html';
\`\`\`
`;

  const html = mdsvex().markup({ content: md, filename: 'file.svexy' });

  expect(html.code.trim()).toBe(`<h1>some title</h1>
<p>some text here</p>
<p>and some text here:</p>
<ul>
<li>and</li>
<li>a</li>
<li>list</li>
</ul>

<script>
import Counter from './Counter.html';
import Counter2 from './Counter2.html';
import Counter3 from './Counter3.html';

</script>`);
  //expect(html.code.trim()).toBe("import Counter3 from './Counter3.html';");
});
