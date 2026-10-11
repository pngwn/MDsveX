---
'@mdsvex/parse': minor
---

Each parse plugin gets a context of its own for each document. Plugins used to share one object, so two plugins that kept a key of the same name on `ctx` overwrote each other. A plugin can also have a `name`, and a table of bound handlers can be given with one as `{ name, directives }`.
