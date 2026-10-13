---
'@mdsvex/parse': patch
---

The close token of a Svelte block only closes the block it is named for. `{/each}` used to close an `{#if}` block, and the name it was written with was dropped, so a document with mismatched blocks compiled. A close token of another name now closes nothing and stays in the output as written, where Svelte reports it at its position.

```md
{#if ready}
{#each items as item}
{item}
{/if}
{/each}
```

This is now an error from Svelte at `{/if}`. It used to compile, with `{/if}` closing the `each` and `{/each}` closing the `if`.
