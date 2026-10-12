---
'@mdsvex/migrate': minor
---

`migrate_config` moves the `smartypants` option of mdsvex 0.x to `smart_punctuation`. Smart punctuation was on by default in 0.x and is off by default now, so a config that never set it gains `smart_punctuation: true`, and `smartypants: false` is removed.

`migrate` takes the old option as `smartypants` and rewrites the dashes and backtick quotes of a document, so that it renders what it did. With the 0.x default two hyphens were an em dash, which now takes three.

```js
migrate('a -- b', { smartypants: true }); // 'a --- b'
```
