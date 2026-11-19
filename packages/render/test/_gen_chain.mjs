import { PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { CursorHTMLRenderer } from '../src/html_cursor.ts';
import { mappings_to_v3 } from '../src/sourcemap.ts';
import * as svelte from 'svelte/compiler';
import remapping from '@ampproject/remapping';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = `<script>
  let name = 'world';
  let count = 0;
</script>

# Hello {name}

The count is {count}.

Some _formatted_ text with *bold* and \`code\`.
`;

const outDir = resolve(import.meta.dirname, '../../..');

// Step 1: PFM → HTML + map (HTML → markdown)
const tree = new TreeBuilder(128);
const parser = new PFMParser(tree);
parser.parse(source);
const renderer = new CursorHTMLRenderer({ cache: false });
const { mappings } = renderer.update_mapped(tree.get_buffer(), source);
const html = renderer.html;
const pfmMap = mappings_to_v3(mappings, source, html, 'test.svx');

// Step 2: Svelte compile (produces JS → HTML map)
// Don't pass sourcemap option — compiler doesn't chain, just compile clean
const compiled = svelte.compile(html, {
  filename: 'test.svx',
  generate: 'client',
});

const compilerMap = compiled.js.map;

// Step 3: Chain the two maps: (JS → HTML) + (HTML → markdown) = (JS → markdown)
// @ampproject/remapping takes the outermost map and a loader for inner maps
const chained = remapping(
  { ...compilerMap, version: 3 },
  (file) => {
    // When remapping asks "give me the sourcemap for test.svx", return our PFM map
    if (file === 'test.svx') {
      return { ...pfmMap, version: 3 };
    }
    return null;
  }
);

// Fix up sourcesContent to have the original markdown
chained.sourcesContent = [source];

writeFileSync(`${outDir}/test.svx`, source);
writeFileSync(`${outDir}/test.svx.js`, compiled.js.code + '\n//# sourceMappingURL=test.svx.js.map\n');
writeFileSync(`${outDir}/test.svx.js.map`, JSON.stringify(chained, null, 2));

console.log('source:', source.length, 'bytes');
console.log('js:    ', compiled.js.code.length, 'bytes');
console.log('compiler map:', compilerMap.mappings.length, 'VLQ chars');
console.log('chained map: ', chained.mappings.length, 'VLQ chars');
console.log('sources:', chained.sources);
console.log('files: test.svx, test.svx.js, test.svx.js.map');
