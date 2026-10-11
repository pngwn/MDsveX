---
'@mdsvex/parse': patch
---

An unclosed `*`, `_`, `~`, `^` or `[` inside an html element, a svelte block or a container directive now becomes literal text when its paragraph ends, as it does outside one. Before, it stayed open until a later list item or the end of the document.

A streamed parse and a whole parse could split that text into different nodes. With a list after the paragraph whose first line closes the element, a whole parse gave `x `, `~`, `z `, `**w` and a streamed one `x `, `~`, `z `, `*`, `*w`:

```md
<div>
x ~z **w
- a</div>
```

Both now give the second, which is also what the same paragraph gives outside the element. The rendered output does not change.

For a plugin, the delimiter is now revoked before its container closes. A bound handler's writes to `ctx.state` for it are undone before the close callback of the directive reads the state, so a count kept there no longer includes it. An html tag that never closes is still revoked after the container.
