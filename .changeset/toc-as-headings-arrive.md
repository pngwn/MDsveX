---
'@mdsvex/plugin-toc': minor
---

The table of contents grows as a document streams. Each heading is added to `plugin_data.toc.headings` as it closes, and the `::toc` component reads the list from the data of the document, so a streaming view shows it filling in as headings arrive instead of after the stream ends. A compiled document lists the same headings as before.

A `toc` component from your own directives module no longer gets `headings` as a prop. It reads them from the context:

```svelte
<script>
	import { getContext } from 'svelte';
	const data = getContext(Symbol.for('mdsvex.plugin_data'));
</script>

{#each data?.current?.toc?.headings ?? [] as heading}
	<a href="#{heading.id}">{heading.text}</a>
{/each}
```

Warnings come in document order.
