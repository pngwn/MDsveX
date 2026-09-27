---
'@mdsvex/render': patch
'mdsvex': patch
---

Rendering html without source maps is faster because runs of fixed markup now reach the output as one precomputed string, while mapped rendering keeps its previous path.
