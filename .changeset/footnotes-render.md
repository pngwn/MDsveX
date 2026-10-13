---
'@mdsvex/render': minor
---

The renderer writes footnotes. A `footnote_reference` renders as its number in a `<sup>`, linked to its definition, and the definitions a reference reaches are written in number order in one `<section class="footnotes" role="doc-endnotes">` after the content of the document. A definition renders nothing where it was written.

`CursorHTMLRenderer` takes the numbering as `footnotes`, the result of `footnote_index`, with an optional `label` and `back_label` for the accessible names. Without it the renderer numbers every label at its first reference and links it whether or not it has a definition, which suits a document that is still arriving. In the cached render the section is one more block after the last, with the `idx` `FOOTNOTES_BLOCK`.

`Node.svelte` shows a reference as its label in a `<sup>` and a definition where it was written, behind the same label.
