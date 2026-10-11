---
'@mdsvex/parse': patch
'mdsvex': patch
---

Spaces and tabs after a frontmatter fence no longer stop the frontmatter from being read. Editors and CMSs add them and they cannot be seen.

```md
--- 
title: hi
---

# Body
```

Before, a space after the opening `---` rendered a rule, a paragraph `title: hi` and another rule, with no `metadata` export, and a space after the closing `---` did the same. Both fences now allow trailing spaces and tabs, in a compiled document and in a `?metadata` import. A fence followed by anything else (`--- x`) is still not a fence.
