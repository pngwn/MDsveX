---
'@mdsvex/parse': patch
---

An unclosed HTML tag now shows its text once. Content after it on the same line is no longer repeated, and a tag that spans lines keeps all of its text.

```md
a <b>x
```

renders as `<p>a &lt;b&gt;x</p>` rather than `<p>a &lt;b&gt;xx</p>`.
