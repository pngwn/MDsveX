---
'mdsvex': minor
'@mdsvex/source-map': minor
'@mdsvex/language-core': minor
'@mdsvex/language-server': minor
'@mdsvex/typescript-plugin': minor
---

The editor now knows your templates, replacement components and directives. The Vite plugin writes what it resolved to `node_modules/.mdsvex/manifest.json` and the editor reads it, falling back to an `mdsvex.config.json` like the playground's:

```json
{ "templates": { "docs": "#lib/templates/Docs.svelte" }, "components": "#lib/markdown.ts" }
```

Hovering a replaced element or directive shows its component. Directive args and the frontmatter of a templated document are type-checked against the component's props, and `metadata` is typed by the same YAML parser `compile()` uses. Compile errors such as an unknown template show on their line, and `.svx` files are supported alongside `.pfm`.
