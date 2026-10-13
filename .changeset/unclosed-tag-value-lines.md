---
'@mdsvex/parse': patch
---

A tag that is left as text keeps all of its lines. When an attribute value ran over a line and a list or a block quote opened later in the document, the tag was cut at the end of its first line and the rest of it was lost.

```md
<d>^<s c="
q">

- a
```

The paragraph now holds `q">` again.
