---
'@mdsvex/parse': patch
'@mdsvex/render': patch
'mdsvex': patch
---

Parsing, compiling, parse plugins and the vite plugin are faster for documents of every size. The largest gains are in compiles with parse plugins and in the vite plugin, where chaining the Svelte compiler's sourcemap no longer goes through a general purpose remapper.
