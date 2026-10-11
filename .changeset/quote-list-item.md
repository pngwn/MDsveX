---
'@mdsvex/parse': patch
---

A list item now ends a paragraph in a block quote, as it does everywhere else.

```md
> x
> - a
```

rendered one paragraph, `x` and `- a` with a line break between them, and now renders a paragraph and a list. The rule is the one a paragraph outside a quote follows: a bullet or `1.` with text after it starts a list, another number or a marker with nothing after it does not. Before, a list in a quote needed a blank `>` line before it.
