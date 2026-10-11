---
'@mdsvex/parse': patch
---

An element left open inside another html element no longer leaves an empty paragraph behind when the outer element closes.

```md
<div>
<n>
</div>
```

rendered `<div><n><p></p></n></div>` and now renders `<div><n></n></div>`. With text before the close tag, `<p>x</p><p></p>` is now `<p>x</p>`.
