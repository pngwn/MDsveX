---
'@mdsvex/parse': patch
---

A comment with text after it on its line is in the paragraph of that text, in every container, as it already was in a table cell. At the top of a document and in the other containers the comment used to be a block of its own, with the text in a paragraph after it.

```md
<!-- note --> some text
```

```html
<p><!-- note --> some text</p>
```

A comment alone on its line is still a block with no paragraph, and the line after it starts a block of its own.
