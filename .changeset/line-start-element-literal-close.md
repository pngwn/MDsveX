---
'@mdsvex/parse': patch
---

An element at the start of a line whose close tag is not a real close tag now keeps its text in one paragraph. This is the case when the close tag is escaped, sits in a code span, a `<script>`, an expression, a comment or an attribute, or is malformed like `</b foo>`. The open tag is then literal text, so the line is a paragraph with a `<p>`, as it already was when the element came after other text.

Before, the text after the open tag was left outside any paragraph, and streamed output could differ from the final output.

```md
<b>\</b>
```

This renders `<p>&lt;b&gt;&lt;/b&gt;</p>`. It used to render `<p>&lt;b&gt;</p>&lt;/b&gt;`.

An element like `<b>\</b> x </b>`, which closes at a later close tag and has no text after it, no longer gets a `<p>`.
