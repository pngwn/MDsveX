---
'@mdsvex/parse': minor
'mdsvex': minor
---

A footnote definition holds more than one block. After a blank line, a block indented by four spaces belongs to the definition, as a block indented to a list item belongs to the item, and the first line that is not blank and not indented ends it. The line of the label may start any block.

```md
A claim[^1].

[^1]: The source.

    A second paragraph, and a list:

    - one
    - two

Not part of the note.
```

Inside a block quote the four spaces count from the marker, and inside a list item from the content of the item. The link back to the reference goes at the end of the last paragraph of the note, or after its last block when that is not a paragraph.
