---
'@mdsvex/render': minor
---

The `Node` component renders math in a stream when it gets a `math` prop, which takes what the `math` option of `compile` takes. A `math` fence and inline math are drawn in the markup a compiled page has. A fence is rendered while it is still being written: LaTeX that can not be read yet keeps the last render on the page, so an equation grows as it arrives. A closed fence the renderer throws on shows its LaTeX.

```svelte
<script>
	import { load_math } from 'mdsvex/math';

	let math = $state.raw();
	load_math().then((render) => (math = render));
</script>

<Node {buf} idx={block.idx} source="" {math} />
```
