---
'@mdsvex/parse': patch
---

A close tag on its own line for an element that holds a svelte block left open no longer leaves an empty paragraph in the block.

```md
<div>
{#if x}
</div>
```

The `</div>` closes the block and the element, and the branch holds no paragraph.
