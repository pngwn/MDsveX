---
'mdsvex': patch
---

Compiling without parse plugins is faster, because `compile` reuses one shared parser, arena and renderer instead of building new ones on every call.
