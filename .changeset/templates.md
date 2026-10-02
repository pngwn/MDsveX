---
'mdsvex': minor
'@mdsvex/render': minor
---

Documents can be wrapped in templates, which were called layouts in mdsvex 0.x. A template is a Svelte component. It gets the frontmatter and any props passed to the document as props, and the document body as `children`:

```ts
// vite.config.ts
mdsvex({
	templates: {
		default: '#lib/templates/Post.svelte',
		docs: './src/lib/templates/Docs.svelte',
		blog: new URL('./src/Blog.svelte', import.meta.url),
	},
});
```

```svelte
<!-- src/lib/templates/Post.svelte -->
<script module>
	export { default as h2 } from './Heading.svelte';
</script>

<script>
	let { title, children } = $props();
</script>

<article>
	<h1>{title}</h1>
	{@render children()}
</article>
```

Specifiers resolve the way an import from the Vite root would, as with `components`. Element-named exports from a template's `<script module>` replace those elements in the documents it wraps, and they take precedence over the `components` modules. To add replacements to a template you can't edit, pass `{ component, components }`, and the `components` module's exports are merged over the template's own.

mdsvex picks a document's template in this order:

1. Frontmatter `template: false` means no template.
2. Frontmatter `template: docs` picks that template. An unknown name is an error that lists the known names.
3. `select_template(id, metadata)`, when given.
4. The `default` template, when there is one.

You can also override the template on an import, with `import Post from './post.svx?template=false'` or `?template=docs`.

The document's `<script>`, `<script module>`, `<style>` and top level `<svelte:head>`, `<svelte:window>`, `<svelte:body>`, `<svelte:document>` and `<svelte:options>` stay outside the template. A frontmatter key named `children` is an error when the document has a template. A document that binds its own props with `let props = $props()` forwards `props` to the template. A document that destructures its props forwards nothing.

`compile()` takes the same options as plain data, with `templates` mapping names to `{ specifier, components }`, plus `default_template` and `select_template(metadata)`. It returns the name of the template it used as `template`. When a template's export names change, the dev server recompiles the documents that used it.
