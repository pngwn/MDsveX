---
'mdsvex': minor
'@mdsvex/source-map': minor
'@mdsvex/language-core': minor
---

The editor reads live expressions in code as references, so type errors, hover, rename and the unused check work on them. It highlights code as the Vite plugin does unless the plugin renders code plain, and `mdsvex.config.json` takes `highlight: false`. A half-typed live expression is an error on that fence rather than on the whole document.
