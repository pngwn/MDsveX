---
'@mdsvex/parse': patch
'@mdsvex/render': patch
---

A reused parser, tree builder or renderer now resets by clearing only what the last document touched, which makes compiling many small documents faster.
