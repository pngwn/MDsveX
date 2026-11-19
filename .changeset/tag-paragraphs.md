---
'@mdsvex/parse': minor
---

Paragraphs around HTML, components and Svelte tags follow one rule:

- A paragraph of only tags, components, `{@...}` tags and whitespace gets no `<p>`, and keeps its spaces and line breaks.
- Any text outside the tags wraps the whole paragraph in a `<p>`, so `<X /> hello` renders `<p><X /> hello</p>` instead of splitting it.
- A paragraph holding a block level element such as `<div>` or `<p>` is never wrapped.

An element that opens and closes on the same line holds inline content, so `<div><p>hi</p></div>` no longer gets an extra `<p>` inside it. One that stays open past its line holds blocks as before, and an element like `<p>`, `<span>` or `<button>` never wraps its content in `<p>`.

A `{#if}` style block opener at the start of a line now ends the paragraph before it.

```md
<Chart />
<Legend />

<Badge>new</Badge> in this release
```
