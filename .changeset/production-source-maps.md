---
'mdsvex': patch
---

`vite build --sourcemap` maps the code of a document back to the lines of its `.svx` file. In dev, code a document renders far from where its markdown wrote it, such as a script after a heading, maps to its line too.
