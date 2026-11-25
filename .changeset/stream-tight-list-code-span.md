---
'@mdsvex/parse': patch
---

In a stream, a list item that starts with a code span no longer shows a paragraph around its text while its list is open. The parser holds that paragraph back until the list closes, as it does for every other item, so a tight list no longer draws one item in a `<p>` and then takes it away.
