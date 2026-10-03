---
'mdsvex': minor
---

`mdsvex/highlight` exports `language_loaders`, which loads each bundled twinkleplop language on its own, so a browser `compile` only fetches the languages it uses. It also re-exports `shiki_notation`, for content written with Shiki's `// [!code ++]` markers:

```js
import { create_highlight, default_annotations, language_loaders, shiki_notation } from 'mdsvex/highlight';

const highlight = create_highlight({
	languages: { svelte: await language_loaders.svelte() },
	annotations: [...default_annotations, shiki_notation()],
});
```
