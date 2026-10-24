---
'@mdsvex/plugin-kit': minor
---

`code_blocks()` renders each code block with a copy button, with the title of the fence above it and its caption below. The button is named after the title, the result is announced to screen readers, and `nocopy` in the fence meta leaves the button out.

```js
import { code_blocks } from '@mdsvex/plugin-kit';

mdsvex({ plugins: [code_blocks()] });
```
