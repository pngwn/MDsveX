---
'mdsvex': minor
---

A document imported with `?text` gives the text a reader sees, by section, without its component. Use it for a search index, an RSS body or `llms.txt`:

```js
const pages = import.meta.glob('./*/+page.svx', { query: '?text', import: 'default', eager: true });
// pages['./intro/+page.svx'].title, .text, and .sections
// each section is { id, heading, depth, text }, with the id of its heading when heading_ids is on
```

It parses the document and runs its plugins, waits for what they defer, and renders nothing, so emoji, references and citation labels are in the text. Code, alt text, link text, directive labels, footnotes and the text of every branch of a Svelte block are read. Frontmatter, comments, `<script>`, `<style>` and `{expressions}` are not. `text: { code_blocks: false }` in the plugin options leaves out fences, math fences and `<pre>`. In dev an edit reloads what imports it only when the text changed. For TypeScript, `mdsvex/globals` types it as `DocumentText`.

`compile_text(source, options)` in `mdsvex/compile` gives the same value without Vite, `parsed_text(parsed)` reads a document compiled in steps, and `text_module` in `mdsvex/host` builds the module. A plugin says what one of its directives reads as with a `text` function beside its handlers.
