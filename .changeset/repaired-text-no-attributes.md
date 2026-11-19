---
'@mdsvex/parse': patch
---

A tag or an inline directive that is never closed becomes text without the attributes of the node it started as. The text node kept the `tag` and `attributes` of the tag, or the `name` of the directive, in a paragraph, a heading, a list item and a table cell, and a parse plugin read them through `attrs` on what was only text. It now keeps nothing, which also drops anything a plugin wrote on the node before the parser gave up on it.
