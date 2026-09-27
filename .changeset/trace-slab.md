---
'@mdsvex/render': patch
'mdsvex': patch
---

The vite plugin keeps each document's sourcemap records in shared slabs instead of copying them into two new arrays per transform, and checks file extensions without allocating.
