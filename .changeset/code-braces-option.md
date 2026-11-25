---
'@mdsvex/render': minor
---

`CursorHTMLRenderer` has a `code_braces` option. Set it to `false` when the output is HTML that Svelte never compiles, and the braces in plain fences and code spans stay as written instead of becoming `&#123;` and `&#125;`:

```ts
const renderer = new CursorHTMLRenderer({ cache: false });
renderer.code_braces = false;
renderer.update(nodes, source);
```

Rendering a code-heavy document is faster with it off. The default is unchanged, and a highlighter still escapes its own output.
