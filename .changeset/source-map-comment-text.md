---
'mdsvex': patch
---

Vite no longer logs `Failed to load source map` for mdsvex when it loads the package through its own transform, as vitest does for a package that is not external. A line inside mdsvex read as the source map comment of the file it is in.
