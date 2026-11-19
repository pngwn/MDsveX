---
'mdsvex': patch
'@mdsvex/language-core': minor
---

The editor compiles a document with `import_images` when the Vite plugin has it on, which is the default, so a replaced `img` gets the type of the import as its `src` where it used to get a string. The plugin writes the option to its manifest, and `mdsvex.config.json` takes `import_images`, on unless it is `false`. A manifest without the field means off.
