---
'@mdsvex/render': patch
---

Converting mappings to a v3 sourcemap is faster, because line starts are found with indexOf, spans are insertion sorted and segments are written into a reused byte buffer that is decoded once into a flat string.
