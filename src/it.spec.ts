import { rollup } from 'rollup';
import resolve from 'rollup-plugin-node-resolve';
import svelte from 'rollup-plugin-svelte';
import { preprocess } from './parse';
import { join } from 'path';

async function generateBundle(entry) {
  const bundle = await rollup({
    input: entry,
    plugins: [
      svelte({
        extensions: ['.html', '.svelte', '.svexy'],
        preprocess,
      }),
      resolve(),
    ],
  });
  return await bundle.generate({ format: 'es' });
}

test('it should compile as a valid svelte component with out throwing', async () => {
  const path = join(__dirname, 'fixtures/svexy/basic.svexy');
  const { output } = await generateBundle(path);
  console.log(output[0].code);
  expect(async () => await generateBundle(path)).not.toThrow();
});
