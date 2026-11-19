---
'@mdsvex/language-core': patch
'@mdsvex/language-server': patch
---

`typescript` is a peer dependency. The declarations import its types, and the server, through `svelte2tsx`, loads it when it starts, but neither package asked for it.
