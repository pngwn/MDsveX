---
'@mdsvex/plugin-kit': minor
---

New package: components most sites want, each written as a directive. `:::details[Summary]`, `:::accordion` (each heading inside it is an item, `(name=...)` keeps one open at a time), `:kbd[Ctrl]`, `:ruby[漢字](rt=かんじ)`, `:badge[new](tone=tip)`, and `::youtube[Title](id=...)` and `::vimeo[Title](id=...)` players named by their title. None loads a script of its own, and each works without JavaScript.

```js
import { kit } from '@mdsvex/plugin-kit';

mdsvex({ plugins: [kit()] });
```
