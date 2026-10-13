---
'@mdsvex/parse': patch
---

A Svelte expression and an attribute value that run over lines in a block quote or a list item no longer hold the quote markers and the indent of those lines. They were passed to Svelte as part of the expression or the value.

```md
> The total is {price +
> tax} today.
```

The expression is now `price +` and `tax` on two lines. It used to hold the `>` of the second line.

An expression or an attribute value also stays inside its container. When one of its lines leaves the block quote or the list item, the opening brace or the tag is literal text, where it used to run on into the text after the container.
