---
'@mdsvex/render': patch
'mdsvex': patch
---

The vite plugin builds its markdown sourcemap after svelte compiles, and only for the html lines the svelte map points at, instead of encoding the whole map up front.
