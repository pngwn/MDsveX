---
'mdsvex': minor
---

`compile()` takes `strict_directives: false` to render a directive with no component as its children instead of throwing, which suits previews and editors.

```ts
compile(':::note[x]\nbody\n:::', { strict_directives: false }); // <p>body</p>
```
