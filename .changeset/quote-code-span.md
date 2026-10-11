---
'@mdsvex/parse': patch
---

A code span that runs over a line in a block quote no longer keeps the `>` of the next line in its code.

```md
> x `a
> b` c
```

rendered `<code>a &gt; b</code>` and now renders `<code>a b</code>`, as the same span does outside a quote.

A code span in a block quote also ends where its paragraph ends: at a line with no marker, a marked blank line, a nested quote, a heading, a thematic break, a fence, the close of a container directive and a list item in a quoted list. Its backticks are then literal text, as an unclosed `*` or `[` already is. Before, the span ran on over those lines, so `` > `a `` then `` > > b` `` was one code span and no nested quote.

For a plugin, the node's value range still covers the source as written and its text is the code without the markers.
