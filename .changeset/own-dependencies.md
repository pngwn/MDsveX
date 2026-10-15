---
'mdsvex': minor
---

Given `read` and `resolve` options, `compile_async()` reads the files fences show with `src=` itself, and its result names them in `dependencies` with the module of the document's template, so a host that is not Vite can watch them:

```js
const { dependencies } = await compile_async(source, { filename, read, resolve });
// ['/site/snippets/a.ts', '/site/src/Post.svelte']
```
