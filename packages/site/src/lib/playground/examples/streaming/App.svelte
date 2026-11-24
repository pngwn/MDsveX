<script>
	import Stream from './Stream.svelte';
	import source from './document.md?raw';
	import { plugins, directive_handlers } from './plugins.js';
	import Counter from './Counter.svelte';
	import Lookup from './Lookup.svelte';
	import Toc from '@mdsvex/plugin-toc/Toc.svelte';

	// a component for a tag, by its name in the document
	const components = { Counter };
	// a component for a directive, by its name: :lookup[term], ::toc[title]
	const directives = { lookup: Lookup, toc: Toc };
</script>

<Stream {source} {plugins} {directive_handlers} {components} {directives} />
