---
'@mdsvex/parse': minor
'mdsvex': minor
---

`unwrap_images`, off by default, renders a paragraph that holds only images without its `<p>`. An `img` replacement that renders a block element such as `<figure>` is then no longer inside one.

```js
mdsvex({ components: '#lib/markdown.js', unwrap_images: true });
```

```md
![A chart](/chart.png)
```

```html
<!-- off -->
<p><img src="/chart.png" alt="A chart" /></p>
<!-- on -->
<img src="/chart.png" alt="A chart" />
```

Several images in one paragraph are all unwrapped, and so is an image inside a link, which keeps its link. Any text beside the image keeps the `<p>`. It works the same in block quotes, list items, directives and HTML elements. `compile()` takes the option too, and the parser takes it as a parse option.
