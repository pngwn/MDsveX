---
'@mdsvex/plugin-elements': minor
---

New package: directives over plain HTML elements. `:::details[Summary]`, `:::accordion` (each heading inside it is an item, `(name=...)` keeps one open at a time), `:kbd[Ctrl]`, `:ruby[漢字](rt=かんじ)` and `:badge[new](tone=tip)`. None loads a script, and each works without JavaScript.

```js
import { elements } from '@mdsvex/plugin-elements';

mdsvex({ plugins: [elements()] });
```
