---
'mdsvex': minor
---

A plugin can claim the fence languages it renders itself with `fences` on its bundle. The highlighter never sees a claimed fence, twinkleplop or a highlighter function, so it renders as plain code, as with `highlight: false`, still through a replaced `pre`, and there is no `unknown_language` warning for it:

```js
{
	name: 'diagram',
	fences: ['mermaid'],
	parse: { code_fence: { parse(node) {} } },
}
```

A language has one owner. Two plugins that claim the same language throw a `FenceOwnerError` with `language` and both plugin names as `plugins` when the config loads. A claim only applies to fences, a code span with a `#!` hint is highlighted as before. The editor manifest lists the languages each plugin claims.
