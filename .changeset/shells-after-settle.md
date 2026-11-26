---
'mdsvex': patch
---

A build no longer fails with `MISSING_EXPORT` when a document has a static directive and a plugin that defers work, such as `link_check` on a link to a `.svx` or `.md` file. The static directive now renders to HTML as it does in any other document.
