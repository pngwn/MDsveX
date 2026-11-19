---
'@mdsvex/parse': patch
---

A fed parse keeps the paragraph of a line that starts with a tag and goes on with text when the feed stops inside that text more than 1024 characters into an element that is still open. The window trim moved past the start of the text the paragraph had yet to read, so it read the kept open tag line of the element instead, found no text and dropped the paragraph. The feed now reads that text before the trim drops it.
