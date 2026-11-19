---
'@mdsvex/plugin-embeds': minor
---

New package: `::youtube[Title](id=...)` and `::vimeo[Title](id=...)`, lazy video players named by their title, from `youtube-nocookie.com` and from Vimeo with `dnt=1`.

```js
import { embeds } from '@mdsvex/plugin-embeds';

mdsvex({ plugins: [embeds()] });
```
