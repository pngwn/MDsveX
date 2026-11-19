---
'@mdsvex/parse': patch
---

A tag that writes the same attribute twice keeps the first value in `attributes`, as HTML does, and every later one in a new `repeated` list on the node, in source order. The last value used to replace the first, which was then in the tree nowhere.

```md
<img alt=first alt="">
```

```js
{ tag: 'img', attributes: { alt: 'first' }, repeated: [['alt', '']], self_closing: true }
```
