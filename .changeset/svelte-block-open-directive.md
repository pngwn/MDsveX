---
'@mdsvex/parse': patch
---

A container directive left open in a `{#if}` style block no longer stops the block from closing. The directive ends at the `{:else}` or `{/if}` of the block it was opened in, as it ends with the document, and what follows the block is outside both.

```md
{#if x}
:::note
a
{/if}

after
```

`after` is a paragraph of the document. It used to be inside the directive with the `{/if}` read as an expression.
