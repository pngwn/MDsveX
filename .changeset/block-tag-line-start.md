---
'@mdsvex/parse': patch
---

A block level element such as `<div>` that starts a line is a block of its own, and what follows its close tag is read as the start of a line. Text there starts a paragraph, where it used to sit bare beside the element.

```md
<div>one</div> two
```

```html
<div>one</div>
<p>two</p>
```

A block level element later in a line no longer takes the `<p>` off its paragraph: `<Badge /> <div>a</div> text` keeps the paragraph, and `<Badge /> <div>a</div>` still has none because it holds only tags.
