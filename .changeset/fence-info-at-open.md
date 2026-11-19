---
'@mdsvex/parse': minor
'mdsvex': minor
---

A code fence has its info string in its open handlers, as `node.info`, and `fence_meta` reads it the way a compile does. A plugin no longer waits for the close of a fence to learn its language or title, and no longer splits the info string itself:

```js
import { fence_meta } from 'mdsvex/compile';

const plugin = {
	code_fence: {
		parse(node) {
			const { lang, title, src, props } = fence_meta(node.info);
			// 'ts', 'app.ts', undefined, [['wrap', true]] for ```ts [app.ts] wrap
		},
	},
};
```

- `node.info` is the whole info string, `''` for a fence with none. `node.lang` is the same string under its older name, and now gives `''` where it gave `undefined` for a fence without one.
- `fence_meta(info)` gives `lang`, `meta`, `title`, `caption`, `src`, `props` (the `key=value` pairs and bare flags no highlighting convention claims) and `parts` (every part as written).
- The open handlers of a fence run once the line of its opening fence is complete, before any of its code.
