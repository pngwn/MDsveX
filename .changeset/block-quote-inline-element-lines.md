---
'@mdsvex/parse': patch
---

An inline HTML element in a block quote can span lines, as it does outside a quote. It ends where the paragraph ends.

```markdown
> some <b>bold
> text</b>
```

This is one `<b>` element, where the two tags were literal text.
