import { parse, preprocess } from './parse';

test('it should transform markdown into html', () => {
  const md = `# Hello World

I am a paragraph.
  `;

  const html = `<h1>Hello World</h1>
<p>I am a paragraph.</p>
`;

  expect(parse(md).body).toBe(html);
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

  expect(parse(md).body).toBe(html);
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

  expect(parse(md).body).toBe(html);
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

  expect(parse(md).body).toBe(html);
});

test('it should leave svelte components intact: #3', () => {
  const md = `<Counter />`;

  const html = `<Counter />`;

  expect(parse(md).body).toBe(html);
});

test('it should leave svelte components with attributes intact', () => {
  const md = `<Counter prop="myprop" />`;

  const html = `<Counter prop="myprop" />`;

  expect(parse(md).body).toBe(html);
});

test('it should leave svelte components with attributes intact avec curly braces', () => {
  const md = `<Counter prop="{0}" />`;

  const html = `<Counter prop="{0}" />`;

  expect(parse(md).body).toBe(html);
});

test('it should leave svelte components with attributes intact avec curly braces sans quotes', () => {
  const md = `<Counter prop={0} />`;

  const html = `<Counter prop={0} />`;

  expect(parse(md).body).toBe(html);
});

test('inline components should also be fine and treated like inline html elements', () => {
  const md = `This is my <Counter prop={0} />`;

  const html = `<p>This is my <Counter prop={0} /></p>
`;

  expect(parse(md).body).toBe(html);
});

test('inline components should also be fine and treated like inline html elements even when wrapped with inline markdown', () => {
  const md = `This is my _<Counter prop={0} />_ and it is exciting`;

  const html = `<p>This is my <em><Counter prop={0} /></em> and it is exciting</p>
`;

  expect(parse(md).body).toBe(html);
});

test('svelte components with strange names should be left intact', () => {
  const md = `<CounterCounterManyCaps prop={0} />`;

  const html = `<CounterCounterManyCaps prop={0} />`;

  expect(parse(md).body).toBe(html);
});

test('it should leave svelte:* components intact: #1', () => {
  const md = `<svelte:head></svelte:head>`;

  const html = `<svelte:head></svelte:head>`;

  expect(parse(md).body).toBe(html);
});

test('it should leave svelte:* components intact: #2', () => {
  const md = `<svelte:meta />`;

  const html = `<svelte:meta />`;

  expect(parse(md).body).toBe(html);
});

test('it should leave svelte:* components intact: #3', () => {
  const md = `<p>hi</p>
  <svelte:meta />`;

  const html = `<p>hi</p>
  <svelte:meta />`;

  expect(parse(md).body).toBe(html);
});

test('it should leave svelte:* components intact: #4', () => {
  const md = `hi

  <svelte:meta />`;

  const html = `<p>hi</p>
  <svelte:meta />`;

  expect(parse(md).body).toBe(html);
});

test('it should leave svelte:* components with attributes intact', () => {
  const md = `<svelte:meta namespace="svg" />`;

  const html = `<svelte:meta namespace="svg" />`;

  expect(parse(md).body).toBe(html);
});

test('block svelte:* components should be allowed children: #1', () => {
  const md = `<svelte:head><title>My Title</title></svelte:head>`;

  const html = `<svelte:head><title>My Title</title></svelte:head>`;

  expect(parse(md).body).toBe(html);
});

test('block svelte:* components should be allowed children: #2', () => {
  const md = `
<svelte:head>
  <title>My Title</title>
  <link rel="stylesheet" type="text/css" href="theme.css" />
  <style>
    h1 {color:red;}
    p {color:blue;}
  </style>
</svelte:head>`;

  const html = `<svelte:head>
  <title>My Title</title>
  <link rel="stylesheet" type="text/css" href="theme.css" />
  <style>
    h1 {color:red;}
    p {color:blue;}
  </style>
</svelte:head>`;

  expect(parse(md).body).toBe(html);
});

describe('preprocess', () => {
  test('it should process some svexy files and return a valid svelte component', () => {
    const md = `<svelte:meta />

# Hello world

I like cheese

\`\`\`js exec
import Something from './Somewhere.html';
\`\`\`

<Something prop={thingy} />
`;

    const html = `<svelte:meta />
<h1>Hello world</h1>
<p>I like cheese</p>
<Something prop={thingy} />

<script>
import Something from './Somewhere.html';
</script>
`;
    expect(
      preprocess.markup({ content: md, filename: 'thing.svexy' }).code
    ).toBe(html);
  });
});
