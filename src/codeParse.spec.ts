import { parse } from './parse';

test('`js exec` fenced blocks should not be rendered', () => {
  const md = `

\`\`\`js exec

some stuff
more stuff

hi
\`\`\`

`;

  const html = parse(md);

  expect(html.body).toBe('');
});

test('`js` fenced blocks should  be rendered', () => {
  const md = `

\`\`\`js

some stuff
more stuff

hi
\`\`\`

`;

  const html = parse(md);

  expect(html.body).not.toBe('');
});

test('the contents of `js exec` should also be returned', () => {
  const md = `

\`\`\`js exec
import Counter from './Counter.html';
\`\`\`
`;

  const html = parse(md);

  expect(html.body).toBe('');
  expect(html.scriptContent[0].trim()).toBe(
    "import Counter from './Counter.html';"
  );
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

  const html = parse(md);

  expect(html.body).toBe('');
  expect(html.scriptContent[2].trim()).toBe(
    "import Counter3 from './Counter3.html';"
  );
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

  const html = parse(md);

  expect(html.body.trim()).toBe('<h1>some title</h1>');
  expect(html.scriptContent[2].trim()).toBe(
    "import Counter3 from './Counter3.html';"
  );
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

  const html = parse(md);

  expect(html.body.trim()).toBe(`<h1>some title</h1>
<p>some text here</p>
<p>and some text here:</p>
<ul>
<li>and</li>
<li>a</li>
<li>list</li>
</ul>`);
  expect(html.scriptContent[2].trim()).toBe(
    "import Counter3 from './Counter3.html';"
  );
});
