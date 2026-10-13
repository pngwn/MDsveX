---
'@mdsvex/plugin-references': minor
---

New package: references. `@user`, `#123`, `owner/repo#123` and commit hashes become links, with the urls GitHub uses unless you give your own, and bare urls become links when you ask.

```js
import { references } from '@mdsvex/plugin-references';

mdsvex({ plugins: [references({ repo: 'sveltejs/svelte' })] });
```

```md
Thanks @ada for #123, which also closes sveltejs/kit#45. Landed in a1b2c3d.
```

- `repo` is the repository a bare `#123` and a commit hash belong to. Without it only `@user` and `owner/repo#123` are linked.
- `mention`, `issue` and `commit` are the url of each kind: a string with placeholders such as `{user}` and `{number}`, a function, or `false` to turn the kind off.
- `linkify: true` also makes a link of a bare `https://`, `http://` or `www.` url, which the parser never does. Punctuation at the end of a url stays with the sentence.
- `attrs` adds attributes to each link, by kind if you give a function.
- An email address, a reference that is part of a path or a word, one you escaped, and anything in code, an attribute or the text of an existing link are left as written.
