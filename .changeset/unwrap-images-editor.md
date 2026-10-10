---
'@mdsvex/language-core': minor
'@mdsvex/source-map': patch
---

The editor compiles a document with `unwrap_images` when the Vite plugin has it on, so an image replacement is type-checked where the build renders it. The plugin writes the option to its manifest, and `mdsvex.config.json` takes `unwrap_images: true`.
