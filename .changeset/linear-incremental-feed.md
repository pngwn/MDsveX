---
'@mdsvex/parse': patch
---

Incremental parsing with `feed()` now takes time proportional to the input size, so streaming small chunks into a large document is no longer slower than parsing it in one go. A 3.8MB document fed in 64 character chunks parses in about 0.35s instead of 27s.
