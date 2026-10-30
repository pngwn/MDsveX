---
'@mdsvex/parse': patch
'@mdsvex/render': patch
'mdsvex': patch
'@mdsvex/prettier-plugin': patch
---

Documents with a lot of HTML parse about 10% faster, render to HTML about 30% faster and compile about 12% faster. The `attributes` of an HTML node's metadata are now built the first time they are read, so a spread of the metadata, `Object.keys` and `Object.entries` leave them out. Read `meta.attributes` directly instead.
