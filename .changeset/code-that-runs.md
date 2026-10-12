---
'mdsvex': minor
---

A fence marked `run` is shown as code and is also a module the page imports. The component that replaces `pre` gets the module as a prop and decides what running means.

````md
```svelte run
<script>
	let count = $state(0);
</script>

<button onclick={() => count++}>clicked {count}</button>
```
````

```svelte
<!-- Pre.svelte, exported as pre from a components module or a template -->
<script>
	let { lang, module, children } = $props();
	const Demo = lang === 'svelte' ? module?.default : undefined;
</script>

{#if Demo}<Demo />{/if}
{@render children()}
```

The block is a real module in the Vite graph, so TypeScript and Svelte are compiled, imports resolve as they would in the document, the server renders it, and an error points at its line of the document. `js`, `ts`, `jsx`, `tsx` and `svelte` blocks run. In dev an edit to one block updates that block and leaves the modules of the others alone.

`run=client` hands the component `load`, a function that imports the block when it is asked for, in place of `module`. With `src=` and `run` the page imports the file the fence shows.

`run` is no longer a meta prop, and neither are `module` and `load`. A block that runs in a document with no `pre` replacement, in a language that is no module, or together with live code fails the build at the fence.

`compile()` serves no module, so there a block that runs throws a `RunError` unless `snippets` says how it is imported. With `snippets: true` or a function the result has the code of each block in `snippets`, and `snippets: false` only shows the block.

```js
const { code, snippets } = compile(source, { filename: 'a.md', snippets: true });
```
