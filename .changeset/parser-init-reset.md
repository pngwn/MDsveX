---
'@mdsvex/parse': patch
---

Compiling several documents with one compiler session, as the vite plugin does, no longer lets a document that ends in an unfinished heading such as `` # ` `` make later documents lose the text after their first line.
