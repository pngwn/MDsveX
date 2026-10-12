---
'@mdsvex/parse': patch
---

A paragraph that starts at a tag keeps its `<p>` whenever it holds text outside its tags. It lost the wrapper, and left the text bare beside the element, when a link destination or an autolink in it held a `{` or a backtick, and when a `<script>` in a list item ended at the item's indent:

```md
<Badge><ht:`></Badge>`
```

The parser now decides from what it has read, so a document fed in chunks gets the same answer as one parsed whole.
