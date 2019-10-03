import { rollup } from 'rollup';
import resolve from 'rollup-plugin-node-resolve';
import svelte from 'rollup-plugin-svelte';
import { join } from 'path';
import container from 'markdown-it-container';

/* eslint-disable-next-line */
import { mdsvex, svexOptions } from '../src/parse';

async function generateBundle(entry, options?: svexOptions) {
  const bundle = await rollup({
    input: entry,
    plugins: [
      svelte({
        extensions: ['.html', '.svelte', '.svexy', '.svx'],
        preprocess: mdsvex(options),
      }),
      resolve(),
    ],
  });
  return await bundle.generate({ format: 'es' });
}

test('it should compile as a valid svelte component with out throwing', async () => {
  const path = join(__dirname, 'fixtures/svexy/basic.svexy');

  try {
    const bundle = await generateBundle(path);
    expect(bundle).toBeTruthy();
  } catch (e) {
    throw new Error(e);
  }
});

test('it should take some options', async () => {
  const path = join(__dirname, 'fixtures/svexy/options.svx');

  expect(
    async () =>
      await generateBundle(path, {
        extension: '.svx',
        parser: md => md.use(container, 'test'),
        markdownOptions: {
          typographer: true,
          linkify: true,
          highlight: () => {},
        },
      })
  ).not.toThrow();
});
