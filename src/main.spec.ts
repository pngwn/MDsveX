import { parse } from './main';

test('it should transform markdown into html', () => {
  const md = `# Hello World

I am a paragraph.
  `;

  const html = `<h1>Hello World</h1>
<p>I am a paragraph.</p>
`;

  expect(parse(md)).toBe(html);
});

test('it should leave html intact', () => {
  const md = `
# Hello World

I am a paragraph.

<p>I am also a paragraph</p>
  `;

  const html = `<h1>Hello World</h1>
<p>I am a paragraph.</p>
<p>I am also a paragraph</p>
`;

  expect(parse(md)).toBe(html);
});

test('it should leave svelte components intact: #1', () => {
  const md = `
# Hello World

I am a paragraph.

<p>I am also a paragraph</p>
<Counter count="{0}"/>
  `;

  const html = `<h1>Hello World</h1>
<p>I am a paragraph.</p>
<p>I am also a paragraph</p>
<Counter count="{0}"/>
`;

  expect(parse(md)).toBe(html);
});

test('it should leave svelte components intact: #2', () => {
  const md = `
# Hello World

I am a paragraph.

<Counter count="{0}"/>
<p id="hello">I am also a paragraph</p>

  `;

  const html = `<h1>Hello World</h1>
<p>I am a paragraph.</p>
<Counter count="{0}"/>
<p id="hello">I am also a paragraph</p>
`;

  expect(parse(md)).toBe(html);
});

test('it should leave svelte:* components intact: #1', () => {
  const md = `<svelte:head></svelte:head>`;

  const html = `<svelte:head></svelte:head>`;

  expect(parse(md)).toBe(html);
});
