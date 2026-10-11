---
'mdsvex': minor
---

A markdown image with a relative url is imported, so Vite hashes the file, inlines a small one and fails the build when it is missing. `![A chart](./chart.png)` compiles to:

```svelte
<script>
	import __mdsvex_img_0 from './chart.png';
</script>

<p><img src={__mdsvex_img_0} alt="A chart" /></p>
```

`./chart.png`, `../img/chart.png` and a bare `chart.png` are relative to the document. A url that starts with an alias, `$lib/`, `#lib/`, `@/` or `~/`, is imported as written. A query or fragment stays on the import, so `?url`, `?inline` and `?enhanced` work. A root path such as `/chart.png`, a url with a scheme, a fragment and a url with a Svelte expression are left as they are, and so is an `<img>` typed as HTML. A replaced `img` component gets the imported value as its `src` prop.

This is on by default in the Vite plugin, so a document that relied on `./chart.png` being served from the url of its page now needs `/chart.png`, or the new `import_images: false` option, which leaves every url as written. `compile()` takes `import_images` too, off by default.
