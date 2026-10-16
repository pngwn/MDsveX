---
'mdsvex': minor
---

`mdsvex/compile` exports the type `PluginDataContext`, what a component gets from `getContext(Symbol.for('mdsvex.plugin_data'))`. It is typed by the `PluginData` keys plugins declare, so a plugin's component reads its own data without writing the shape out:

```svelte
<script>
	import { getContext } from 'svelte';
	/** @type {import('mdsvex/compile').PluginDataContext | undefined} */
	const data = getContext(Symbol.for('mdsvex.plugin_data'));
	const headings = $derived(data?.current?.toc?.headings ?? []);
</script>
```

Import it as a type. A value import of `mdsvex/compile` in a component would put the compiler in the page's bundle.
