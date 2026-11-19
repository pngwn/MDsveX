---
'@mdsvex/parse': patch
'@mdsvex/render': patch
---

The indent of a fenced code block is no longer part of its code. Each line loses up to as many columns of leading whitespace as the opening fence is indented past where its container's content starts, as in CommonMark, so a fence indented as a whole at the top of a document or inside an HTML element, a Svelte block or a directive holds the same code as it does unindented. The rendered code, the highlighter, live code and the source map all read the trimmed code, and the source map points each line of it at its own source line.
