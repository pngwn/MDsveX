---
'@mdsvex/parse': patch
---

Parsing markdown is much faster, up to about 3x, and incremental (streaming) parsing is faster as well. Parsing many documents in a row reuses one parser instead of creating a new one for each document.
