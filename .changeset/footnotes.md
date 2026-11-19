---
'mdsvex': minor
---

Footnotes. A reference is a label in brackets after a caret, and a definition is the same at the start of a line with a colon and its text:

```md
A claim[^1], and a second one[^smith].

[^1]: The source, with a [link](https://example.com).
[^smith]: Smith, 2020.
```

A reference renders as a number, by first reference, that links to its note. The notes are collected at the end of the document, wherever they were written, each with a link back to every reference to it:

```html
<p>A claim<sup><a href="#fn-1" id="fnref-1" role="doc-noteref">1</a></sup>, and ...</p>

<section class="footnotes" role="doc-endnotes" aria-label="Footnotes">
	<ol>
		<li id="fn-1"><p>The source, with a <a href="https://example.com">link</a>. <a href="#fnref-1" role="doc-backlink" aria-label="Back to reference 1">...</a></p></li>
		...
	</ol>
</section>
```

- A reference with no definition fails the build with a `FootnoteError`, which has the `line` and `column` of the reference. So does a label defined twice. `[^abc]` in prose is a reference: escape the bracket, `\[^abc]`, or put it in code.
- A definition nothing refers to is not rendered, and the compile warns with `footnote_unused`.
- A definition holds one paragraph and may be written anywhere, in a block quote or a list item too.
- The new `footnotes` option names the section and the back links, `{ label: 'Notes', back_label: 'Back to note {n}' }`. `strict: false` makes the two errors warnings, for a preview.
- With `heading_ids`, a heading whose slug would be the id of a footnote gets a suffix.
