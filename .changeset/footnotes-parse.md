---
'@mdsvex/parse': minor
---

Footnotes. `[^label]` is a footnote reference and `[^label]: text` at the start of a line is a footnote definition.

```md
A claim[^1], and a second one[^smith].

[^1]: The source, with a [link](https://example.com).
[^smith]: Smith, 2020.
```

There are two new node kinds, both with the label as the `label` attribute:

- `footnote_reference`, a leaf in inline content. It is one by its syntax alone, whether or not a definition exists, so it may come before its definition and the parser never turns it back into text. A label is any characters but whitespace, brackets and `^`.
- `footnote_definition`, a block that holds one paragraph. It ends a paragraph, as a heading does, and may sit in any container.

`[^abc]` in prose is now a reference. Escape the bracket, `\[^abc]`, or put it in code. A line `[^a]: b` used to be plain text.

`footnote_index(buf)` from `@mdsvex/parse/buf-utils` numbers the footnotes of a finished tree by first reference and lists what is wrong: a reference with no definition, a label defined twice, a definition nothing refers to. Nothing throws in a parse. Parse plugins get handlers for both kinds.
