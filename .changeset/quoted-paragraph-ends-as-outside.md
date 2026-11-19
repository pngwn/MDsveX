---
'@mdsvex/parse': patch
---

A paragraph in a block quote ends at the same lines as a paragraph outside one. A directive, a block level HTML tag and a Svelte block now end it, and so does a fence under the paragraph of a list item.

```md
> text
> ::toc
```

The directive is no longer text of the paragraph. A line of only a tag or a comment in a container directive inside a block quote also loses its paragraph, as it does outside a quote.
