---
'@mdsvex/language-core': minor
'@mdsvex/source-map': minor
---

The editor compiles `math` fences as the Vite plugin does, so a `math` replacement is type-checked with the props the build gives it. It reads the option from the manifest the plugin writes, and `mdsvex.config.json` takes `math`. With Temml, LaTeX that can't be rendered is reported at its place in the fence and the rest of the document keeps working. With KaTeX or a renderer function the LaTeX isn't checked.
