---
'@mdsvex/render': minor
---

Footnotes work in a stream drawn with the `Node` component. `ComponentRenderer` numbers them on every `update` and has the result as `footnotes`. Pass it to every `Node`:

```svelte
{#each blocks as block (block.idx)}
	{#key block.v}
		<Node {buf} idx={block.idx} source="" footnotes={renderer.footnotes} />
	{/key}
{/each}
```

A reference is then a numbered link, a definition is no longer drawn where it was written, and the notes are collected in a `<section class="footnotes">` that one more entry at the end of `blocks` draws. The markup, ids and links are those of a compiled page. Without the prop `Node` draws footnotes as before.
