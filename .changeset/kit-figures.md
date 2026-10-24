---
'@mdsvex/plugin-kit': minor
---

`figures()` renders an image with a title as a figure, with the title as its caption, when the image stands on its own. With `unwrap_images` that is an image on a line of its own. An image beside text, in a heading or in a table cell stays an image, so the page stays valid HTML.

```js
import { figures } from '@mdsvex/plugin-kit';

mdsvex({ unwrap_images: true, plugins: [figures()] });
```
