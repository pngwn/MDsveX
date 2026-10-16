---
'@mdsvex/language-core': patch
'@mdsvex/source-map': patch
'@mdsvex/language-server': patch
---

The packages publish JavaScript with type declarations, so they import from Node. Their entries were TypeScript source, which only a bundler that compiles TypeScript could load. Their types come from `mdsvex/compile`, so checking them needs no Vite.

`@mdsvex/language-server` exports `start()`, which starts the server on the connection the process was given. Importing the package starts nothing. The `pfm-language-server` command runs the built server directly.
