---
'@mdsvex/parse': patch
'@mdsvex/render': patch
'mdsvex': patch
---

Compiling small documents without parse plugins is faster because `compile` now reuses one shared parser, arena and renderer that keep no document between calls.
