---
'mdsvex': minor
---

A template can be a document. Its content is markdown, and it reads its props and renders `children` as a component does.

```js
mdsvex({
	templates: { note: '#lib/templates/Note.svx' }
});
```

```svx
<script>
	let { title, children } = $props();
</script>

# {title}

{@render children()}
```

A document used as a template is never wrapped in a template itself.
