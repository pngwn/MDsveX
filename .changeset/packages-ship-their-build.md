---
'@mdsvex/parse': patch
'@mdsvex/render': patch
'@mdsvex/migrate': patch
'@mdsvex/language-core': patch
'@mdsvex/language-server': patch
'@mdsvex/source-map': patch
---

The packages hold only what they run. Tests, fixtures, build config and intermediate build output are no longer published, which takes `@mdsvex/parse` from 2,337 files to 28.
