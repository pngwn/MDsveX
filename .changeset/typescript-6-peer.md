---
'@mdsvex/language-core': patch
'@mdsvex/language-server': patch
---

The language packages accept TypeScript 6 as well as 5, so they install beside SvelteKit 3, whose optional TypeScript peer is `^6.0.0`, without a peer override.
