---
'@mdsvex/parse': minor
'@mdsvex/render': minor
'mdsvex': minor
---

Task lists. A list item that starts with `[ ]`, `[x]` or `[X]`, then a space and some text, is a task item. It renders with a disabled checkbox before its text, and the marker is no longer part of the text. A replaced `li` component gets a boolean `checked` prop instead of the checkbox.

```md
- [ ] to do
- [x] done
```

```html
<li><input type="checkbox" disabled /> to do</li>
<li><input type="checkbox" checked disabled /> done</li>
```

A marker with nothing after it (`- [ ]`) or with no space after it (`- [x]done`) stays text. To start an item with those characters, escape the bracket: `- \[x] text`.
