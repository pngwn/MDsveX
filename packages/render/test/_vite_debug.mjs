import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { CursorHTMLRenderer } from '../src/html_cursor.ts';
import { mappings_to_v3 } from '../src/sourcemap.ts';
import * as svelte from 'svelte/compiler';
import remapping from '@ampproject/remapping';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

const FILE = '/src/routes/+page.svx';

const md = `<script>
  let name = 'world';
</script>

# Hello {name}

Some _formatted_ text.
`;

// Step 1: mdsvex vite plugin transform
const tree = new TreeBuilder(128);
const parser = new PFMParser(tree);
parser.parse(md);
const renderer = new CursorHTMLRenderer({ cache: false });
const { mappings } = renderer.updateMapped(tree.get_buffer(), md);
const html = renderer.html;
const mdsvexMap = mappings_to_v3(mappings, md, html, FILE);

console.log('=== Step 1: mdsvex transform ===');
console.log('map.sources:', mdsvexMap.sources);
console.log('map.file:', mdsvexMap.file);
console.log('map.sourcesContent present:', !!mdsvexMap.sourcesContent?.[0]);
console.log('map.mappings length:', mdsvexMap.mappings.length);

// Step 2: svelte.preprocess (vite-plugin-svelte preprocess stage)
// In Vite, this gets the code from step 1's output
const preprocessed = await svelte.preprocess(html, [/* no preprocessors */], { filename: FILE });
console.log('\n=== Step 2: svelte.preprocess ===');
console.log('map present:', !!preprocessed.map);
// If no preprocessors change the code, map may be null/identity

// Step 3: svelte.compile
const compiled = svelte.compile(preprocessed.code, {
  filename: FILE,
  generate: 'client',
});
const svelteMap = compiled.js.map;

console.log('\n=== Step 3: svelte.compile ===');
console.log('map.sources:', svelteMap.sources);
console.log('map.file:', svelteMap.file);
console.log('map.mappings length:', svelteMap.mappings.length);

// Step 4: What Vite's getCombinedSourcemap does
// It chains: [compile_map, preprocess_map, mdsvex_map]
// Since preprocess_map is null/identity, it's effectively [compile_map, mdsvex_map]
console.log('\n=== Step 4: Chain (simulating getCombinedSourcemap) ===');

const chained = remapping([svelteMap, mdsvexMap], () => null);
console.log('chained.sources:', chained.sources);
console.log('chained.file:', chained.file);
console.log('chained.sourcesContent?.[0]?.slice(0,50):', chained.sourcesContent?.[0]?.slice(0, 50));
console.log('chained.mappings length:', chained.mappings.length);

// Step 5: verify trace
console.log('\n=== Trace verification ===');
const t = new TraceMap(chained);
const jsLines = compiled.js.code.split('\n');
const mdLines = md.split('\n');

// Find the 'let name' line in JS
for (let line = 0; line < jsLines.length; line++) {
  const idx = jsLines[line].indexOf('name');
  if (idx !== -1 && jsLines[line].includes("'world'")) {
    const orig = originalPositionFor(t, { line: line + 1, column: idx });
    console.log(`js ${line+1}:${idx} "${jsLines[line].trim()}" → ${orig.source}:${orig.line}:${orig.column}`);
    if (orig.line) {
      console.log(`  source content: "${mdLines[orig.line-1]?.trim()}"`);
    }
  }
}

// What the browser sees:
console.log('\n=== What browser devtools see ===');
console.log('Source URL in map:', chained.sources?.[0]);
console.log('Can browser fetch this?', chained.sources?.[0]?.startsWith('/') ? 'Absolute path — Vite resolves via /@fs/ or relative' : 'Relative path');
console.log('sourcesContent included:', !!chained.sourcesContent?.[0]);
if (chained.sourcesContent?.[0]) {
  const content = chained.sourcesContent[0];
  console.log('sourcesContent is:', content.includes('<script>') && content.includes('# Hello') ? 'ORIGINAL MARKDOWN ✓' : content.includes('<h1>') ? 'INTERMEDIATE HTML ✗' : 'UNKNOWN');
}
