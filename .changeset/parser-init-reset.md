---
'@mdsvex/parse': patch
---

A reused parser, as the compiler session and the vite plugin use, no longer carries heading and emphasis state from one document into the next. Before, a document ending in an unfinished heading such as `` # ` `` could make later documents drop text after their first line.
