---
'@mdsvex/render': patch
'mdsvex': patch
---

Character references like `&lt;`, `&copy;` and `&#123;` in text, link and image attributes render as written instead of being escaped a second time. A bare `&`, a backslash escaped `\&` and any `&` inside code are still escaped.

```md
a &lt; b &copy;
```
