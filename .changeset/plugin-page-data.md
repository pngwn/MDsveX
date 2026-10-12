---
'@mdsvex/plugin-page-data': minor
---

New package: page data. It works out a reading time, an excerpt, a title and an edit url for each document and leaves them in its plugin data, under one key.

```js
import { page_data } from '@mdsvex/plugin-page-data';

mdsvex({
	plugins: [page_data({ edit_url: 'https://github.com/you/site/edit/main/' })],
});
```

```js
import Post, { plugin_data } from './post.svx';

plugin_data.page;
// { title, excerpt, words, minutes, edit_url }
```

- `words` counts the prose and leaves code blocks out. Each Chinese, Japanese or Korean character is a word. `minutes` is the words over `words_per_minute`, 200 by default, rounded up as the `reading-time` package shows it.
- `excerpt` is the first paragraph, or everything before a `<!-- more -->` comment, as plain text. `max_length` cuts it where a word ends.
- `title` is the text of the first `#` heading, and is only set when the frontmatter has no `title`. `metadata` is never changed.
- `edit_url` is the base you give and the path of the document, and is off without a base.
- Each part can be turned off. A `?data` import gives all of it without rendering the document, for a page that lists posts.
