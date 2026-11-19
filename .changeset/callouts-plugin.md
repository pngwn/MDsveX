---
'@mdsvex/plugin-callouts': minor
---

New package: callouts. `:::note`, `:::tip`, `:::important`, `:::warning` and `:::caution`, GitHub's five alerts as container directives, with the bracket text as a custom title. The component renders at build time and ships no JavaScript.

```js
import { callouts } from '@mdsvex/plugin-callouts';

mdsvex({ plugins: [callouts()] });
```

A callout is a `<div role="note">` with its title in a `<p>`, and its kind is never shown by colour alone. `titles` sets the default title of each kind, for a site in another language, and `css: false` leaves the stylesheet out. A `?text` import reads the title.
