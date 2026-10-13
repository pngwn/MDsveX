---
'@mdsvex/parse': patch
---

`node.text_content` is the text a reader sees. A soft or hard line break reads as a space, where the lines of a paragraph used to be joined with nothing between them, and the text of a comment is left out. A comment read on its own still gives its text.

```md
one
two\
three

## A <!-- hidden --> b
```

The paragraph reads `one two three` and the heading `A  b`, where they read `onetwothree` and `A  hidden  b`.
