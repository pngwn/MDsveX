---
'@mdsvex/render': patch
'mdsvex': patch
---

An element that writes one attribute twice is compiled with both, so Svelte reports the duplicate as it does in a `.svelte` file. An element with content used to be written with only one of them, which hid the mistake.

```md
<div class="a" class="b">x</div>
```

This now fails in Svelte with `attribute_duplicate`. A self closing tag such as `<img alt="a" alt="b" />` already did.
