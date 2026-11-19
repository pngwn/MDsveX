---
'@mdsvex/parse': patch
---

Link, image or inline directive text in a block quote closes at a `]` that starts a line.

```markdown
> [a
> ](u)
```

This is a link, where the brackets were literal text.
