---
'@mdsvex/parse': patch
---

An inline element such as `<b>`, `<span>` or `<a>` that starts a line with content after its open tag starts a paragraph, also when it closes on a later line. It used to be read as a block there, so the text after its close tag was cut off into a paragraph of its own.

```md
<b>bold over
two lines</b> and text
```

```html
<p><b>bold over two lines</b> and text</p>
```

An element whose open tag ends its line still holds its lines as before, and so does a component or a block level element that stays open past its line.
