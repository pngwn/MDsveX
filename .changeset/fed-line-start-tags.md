---
'@mdsvex/parse': patch
---

Streamed output now matches the final output for HTML, components and `{@...}` tags at the start of a line. Feeding these in chunks built a different tree from parsing them whole:

- An element holding a lone backtick before another block, as in the input below, was wrapped in a `<p>` when fed.
- Spaces after a tag that is alone on its line were kept when fed and dropped when parsed whole. They are now kept in both, as they already were after a row of tags.
- `> {@html x}` fed a character at a time was wrapped in a `<p>`.

```md
<b>`</b>
---
```
