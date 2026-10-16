---
'mdsvex': patch
---

A `?data` import compared after an edit gives its plugins `ctx.resolve` as its load does, so a plugin that resolves no longer reloads every page that imports it on each edit.
