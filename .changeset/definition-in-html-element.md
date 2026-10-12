---
'@mdsvex/parse': patch
---

A link reference definition inside an HTML element is read as a definition, as it is at the top of a document.

```md
<div>

[docs]: /docs

See the [guide][docs].

</div>
```
