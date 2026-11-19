---
'@mdsvex/parse': patch
---

A fence that is left open in a block quote or a list item ends where the quote or the item ends, as a fence left open in a document ends with the document. In a block quote it used to turn into a paragraph.

````md
> ```
> code
after the quote
````
