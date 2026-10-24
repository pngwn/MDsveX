---
'@mdsvex/plugin-kit': minor
---

`mermaid()` draws each `mermaid` fence as a diagram in the browser. The library is loaded only on a page that has a diagram, and before it loads, without JavaScript, or when a diagram does not parse, the reader sees the code. Install `mermaid` beside the kit, it is an optional peer dependency.

```js
import { mermaid } from '@mdsvex/plugin-kit';

mdsvex({ plugins: [mermaid()] });
```
