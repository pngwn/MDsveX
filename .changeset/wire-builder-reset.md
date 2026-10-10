---
'@mdsvex/parse': patch
---

`WireTreeBuilder.reset()` gives the next document its own strings and clears the plugin state of the last one. Text written after a reset used to go into an array shared by every buffer, and plugins kept reading the text of the document before the reset.
