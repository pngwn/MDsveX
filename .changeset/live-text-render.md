---
'@mdsvex/parse': patch
'@mdsvex/render': patch
---

Draw text as it arrives in the live renderer. `TreeBuilder` keeps the parser's cursor on the buffer as `buf.cursor`, and `Node.svelte` draws an open text run up to it through the new `buf_live_text`, so a paragraph or a heading fed a character at a time grows a character at a time. An open code span and an open fence at the top level draw their code as it arrives too, through `buf_live_code`. `ComponentRenderer` now follows the node that takes the place of a guess the parser took back, so a component on its own line renders.
