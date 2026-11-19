---
'mdsvex': minor
---

A document imported with `?data` gives its frontmatter and what its plugins left, without its component. Use it for a list that shows something a plugin worked out, such as a reading time:

```js
const posts = import.meta.glob('./*/+page.svx', { query: '?data', eager: true });
// posts['./intro/+page.svx'].metadata.title
// posts['./intro/+page.svx'].plugin_data.reading_time.minutes
```

The module exports `metadata` and `plugin_data` as the compiled document does, each `undefined` when the document has none, and both in one object as its default export. It parses the document and runs its plugins, and renders nothing.

Unlike `?metadata`, which reads the frontmatter alone, a `?data` import depends on the whole document: in dev an edit of the body that changes what a plugin left updates whatever imported it. For TypeScript, `mdsvex/globals` types direct `?data` imports.
