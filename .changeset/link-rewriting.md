---
'mdsvex': minor
---

Links between documents can become routes, and root urls can get the base path. `links.routes` names the directory your files are served from, `links.base` is the prefix (`true` for Vite's base, a string, or a function the page imports), and `rewrite` is a function for anything else. `compile()` takes them too.

```js
mdsvex({
	links: { routes: 'src/routes', base: { import: 'resolve', from: '$app/paths' } },
	rewrite: (url) => (url.startsWith('gh:') ? 'https://github.com/' + url.slice(3) : undefined),
});
```

```md
[Install](../setup/+page.svx#install)
```

```svelte
<script>
	import { resolve as __mdsvex_base } from '$app/paths';
</script>

<p><a href={__mdsvex_base('/setup#install')}>Install</a></p>
```
