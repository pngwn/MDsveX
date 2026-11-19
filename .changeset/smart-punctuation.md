---
'mdsvex': minor
'@mdsvex/render': minor
---

A new `smart_punctuation` option turns straight quotes into curly quotes, two hyphens into an en dash, three into an em dash and three dots into an ellipsis. It is off by default, and `compile()` and the Vite plugin both take it.

```js
mdsvex({ smart_punctuation: true });
// or pick the kinds, and give the four quote strings of another language
mdsvex({
	smart_punctuation: { dashes: false, quotes: ['\u00ab', '\u00bb', '\u2039', '\u203a'] }
});
```

Only prose changes. Code, math, urls, attributes, Svelte expressions, image alt text, titles and a character behind a backslash stay as written, and so does `--name` after a space, which is a command line flag. Heading ids are still made from the text as written.
