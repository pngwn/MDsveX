---
'@mdsvex/parse': patch
'mdsvex': patch
---

Parsing small documents is faster because their node storage is carved from a shared slab and sized so it no longer needs to grow.
