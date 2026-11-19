---
'@mdsvex/parse': patch
---

An HTML element or a component that runs over lines opens inside a container directive, as it does everywhere else. Its tags used to be text in paragraphs.

```md
:::note
<div>
a
</div>
:::
```

The directive holds a `div` that holds the paragraph `a`. An element left open in a directive ends at the closing `:::` and its open tag is text, so it can not take the lines after the directive.
