---
'@mdsvex/render': patch
'@mdsvex/source-map': patch
'mdsvex': patch
---

The vite plugin builds its sourcemap straight from numeric mapping records the renderer writes, without creating a mapping object per node, which also makes mapped rendering faster.
