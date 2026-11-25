---
'@mdsvex/render': minor
---

The `Node` component renders math in a stream when it gets a `math` prop, which takes what the `math` option of `compile` takes. A `math` fence and inline math are drawn in the markup a compiled page has once they close, and show their LaTeX until then, as does LaTeX the renderer throws on.

```svelte
<script>
	import { load_math } from 'mdsvex/math';

	let math = $state.raw();
	load_math().then((render) => (math = render));
</script>

<Node {buf} idx={block.idx} source="" {math} />
```
