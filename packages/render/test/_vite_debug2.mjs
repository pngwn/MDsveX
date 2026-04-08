import remapping from '@ampproject/remapping';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

// Simulate the mismatch: svelte uses basename, mdsvex uses full path
const svelteMap = {
  version: 3,
  sources: ['+page.svx'],  // basename — what svelte.compile produces
  mappings: 'AAAA',
  names: [],
};

const mdsvexMap = {
  version: 3,
  sources: ['/src/routes/+page.svx'],  // full path — what we produce
  sourcesContent: ['# Hello World\n'],
  mappings: 'AAAA',
  names: [],
};

// Try chaining with loader (how Vite does it internally)
console.log('=== Loader-based chaining ===');
const chained1 = remapping(svelteMap, (file) => {
  console.log('  loader asked for:', JSON.stringify(file));
  if (file === '+page.svx') return mdsvexMap;
  return null;
});
console.log('result sources:', chained1.sources);
console.log('result sourcesContent:', chained1.sourcesContent);

// Try array-based chaining
console.log('\n=== Array-based chaining ===');
const chained2 = remapping([svelteMap, mdsvexMap], () => null);
console.log('result sources:', chained2.sources);
console.log('result sourcesContent:', chained2.sourcesContent);
