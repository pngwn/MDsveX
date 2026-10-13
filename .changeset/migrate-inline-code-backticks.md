---
'@mdsvex/migrate': patch
---

Inline code that holds backticks is written as a span mdsvex reads. Code with two backticks in a row used to be wrapped in three, which is plain text in mdsvex.

```js
migrate('```a``b```'); // '`a``b`'
```

A span of one backtick holds any run but one, and a span of two holds any run but two. Code that has a run of each is written as a `<code>` element.
