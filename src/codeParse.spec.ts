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
