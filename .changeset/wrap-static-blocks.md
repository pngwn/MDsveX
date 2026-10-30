---
'@mdsvex/render': minor
'mdsvex': minor
---

A new `wrap_static` option wraps each run of two or more top level blocks that hold no Svelte in a `<div style="display: contents">`. Hydration then steps over the whole run as one node instead of visiting every block, which cuts the first hydration of a long, mostly static page by up to a quarter. It is off by default, because child and sibling selectors such as `.prose > p` or `h2 + p` no longer match across a wrapper.

```js
mdsvex({ wrap_static: true });
```

```html
<!-- before -->
<h2>Install</h2><p>Run the command.</p><Demo /><p>Done.</p><p>Next steps.</p>
<!-- after -->
<div style="display: contents"><h2>Install</h2><p>Run the command.</p></div><Demo /><div style="display: contents"><p>Done.</p><p>Next steps.</p></div>
```
