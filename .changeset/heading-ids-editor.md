---
'@mdsvex/language-core': minor
---

The editor compiles a document with `heading_ids` when the Vite plugin has it on, so a heading replacement that takes an `id` prop is type-checked with one. The plugin writes the option to its manifest, and `mdsvex.config.json` takes `heading_ids: true`. A `slug` function can't be written to either, so the editor makes the default ids.
