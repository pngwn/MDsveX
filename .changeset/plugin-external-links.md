---
'@mdsvex/plugin-external-links': minor
---

New package: external link policy. It sets `rel`, and `target` when asked, on every markdown link that leaves the site.

```js
import { external_links } from '@mdsvex/plugin-external-links';

mdsvex({ plugins: [external_links({ target: '_blank' })] });
```

```html
<a href="https://example.com" rel="noopener noreferrer" target="_blank">out</a>
<a href="/guide">in</a>
```

- A link is external when its url is absolute `http:` or `https:`, or protocol relative, and its host is not in `internal_hosts`. `is_external` replaces that test.
- Relative urls, fragments, other schemes and a url whose host comes from an expression are left alone. So is an `<a>` typed as HTML, which is not a markdown link.
- `rel` defaults to `noopener noreferrer` and is added to what a link has. No `target` is set unless you give one.
- `icon` appends an empty span for a stylesheet to draw, and `new_tab_label` names it for a screen reader on links that open a new tab. `attrs` adds attributes such as a class.
