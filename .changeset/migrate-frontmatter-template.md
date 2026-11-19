---
'@mdsvex/migrate': minor
---

Migrating a document renames its frontmatter `layout` key to `template`, so `layout: blog` becomes `template: blog` and `layout: false` becomes `template: false`. To rename the key without converting the markdown, use `migrate_frontmatter`:

```ts
import { migrate_frontmatter } from '@mdsvex/migrate';

const { code, notes } = migrate_frontmatter(source);
```
