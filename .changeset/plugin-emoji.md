---
'@mdsvex/plugin-emoji': minor
---

New package: emoji shortcodes. `:tada:` becomes the emoji, from the table of shortcodes GitHub uses, which is built into the package.

```js
import { emoji } from '@mdsvex/plugin-emoji';

mdsvex({ plugins: [emoji()] });
```

```md
We shipped it :tada: and nobody was paged :+1:
```

- A shortcode is replaced in prose only, never in code, math, a url, an attribute or an expression.
- A name the table does not have stays as written. So does one that touches a letter or a digit, which keeps `10:30:00` and `1:100:1` as they are, one that is escaped, and an inline directive such as `:tada[text]`.
- `extend` adds shortcodes, replaces them or takes them out, and `table` replaces the whole table.
- `label: true` wraps each emoji in `<span role="img" aria-label="party popper">`, emoji typed as characters included. A function gives the label, for a page that is not in English.
- `attrs` puts a `<span>` with your attributes around each emoji.
