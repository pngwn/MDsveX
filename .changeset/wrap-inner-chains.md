---
'@mdsvex/parse': patch
---

A node wrapped more than once with `wrap_inner` sends its later children to the innermost wrapper. They used to land beside an empty wrapper when two plugins wrapped the same node or a plugin wrapped its own wrapper, and revoking one wrapper dropped the redirect of the others.
