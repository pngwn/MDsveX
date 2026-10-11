---
'@mdsvex/parse': patch
---

An element left open in a svelte block no longer stops the block from closing. Its open tag is literal text in a paragraph of the branch, and the next `{:else}` or `{/if}` is the block's own.

```md
{#if x}
<n>
{/if}

after
```

The block ends at `{/if}` and `after` is a paragraph outside it. Before, `{/if}` was read as an expression and the rest of the document stayed inside the block.
