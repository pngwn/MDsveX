---
'@mdsvex/migrate': minor
---

`migrate_config` reads `remarkPlugins` and `rehypePlugins`. mdsvex runs no remark or rehype plugins now, so each plugin in the lists gets a note that says what replaces it: core syntax, an option, a first-party plugin, a component, or nothing yet. The lists stay in the config under a `TODO(mdsvex-migrate)` comment.

```js
import { mdsvex } from 'mdsvex';
import slug from 'rehype-slug';
import autolink from 'rehype-autolink-headings';

mdsvex({ rehypePlugins: [slug, autolink] });
```

```
5:26 `rehype-slug` does not run now. The `heading_ids` option makes the same ids. `heading_ids: true` was added.
5:32 `rehype-autolink-headings` does not run now. Install `@mdsvex/plugin-anchors` and add `anchors()` to `plugins`, with `heading_ids: true`.
```

`rehype-slug`, `remark-slug`, `remark-unwrap-images` and `rehype-unwrap-images` turn their option on in the config, unless the plugin had options of its own. The notes have the new kind `plugin`.
