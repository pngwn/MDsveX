import { mdsvex } from '../src/parse';


test('if', () => {
  const md = `{#if true}\n\nhi\n\n{/if}`;
  const html = `{#if true}\n<p>hi</p>\n{/if}`;
  expect(mdsvex().markup({ content: md, filename: 'file.svexy' }).code).toBe(html);
});

test('if else', () => {
  const md = `{#if true}\n\na\n\n{:else}\n\nb\n\n{/if}`;
  const html = `{#if true}\n<p>a</p>\n{:else}\n<p>b</p>\n{/if}`;
  expect(mdsvex().markup({ content: md, filename: 'file.svexy' }).code).toBe(html);
});

test('each loop', () => {
  const md = `{#each Array(5).fill(1) as a}\n\n{a}\n\n{/each}`;
  const html = `{#each Array(5).fill(1) as a}\n<p>{a}</p>\n{/each}`;
  expect(mdsvex().markup({ content: md, filename: 'file.svexy' }).code).toBe(html);
});

test('await', () => {
  const md = `{#await new Promise(resolve => setTimeout(resolve, 2000))}\n\na\n\n{:then}\n\nb\n\n{:catch}\n\nc\n\n{/await}`;
  const html = `{#await new Promise(resolve => setTimeout(resolve, 2000))}\n<p>a</p>\n{:then}\n<p>b</p>\n{:catch}\n<p>c</p>\n{/await}`;
  expect(mdsvex().markup({ content: md, filename: 'file.svexy' }).code).toBe(html);
});

