---
'@mdsvex/parse': patch
---

A leaf or container directive opens inside an html element, as it does at the root and in a block quote.

```md
<div>

:::note[]
a
:::

</div>
```

The div holds a `note` directive with the paragraph `a`. Before, the opening line was text and an inline directive, and the closing `:::` a paragraph. A container left open in the element ends at the element's close tag.
