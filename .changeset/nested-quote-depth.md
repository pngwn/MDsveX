---
'@mdsvex/parse': patch
---

Lines in a nested block quote stay at their own depth after a heading, thematic break, code fence or blank quoted line. A line with fewer `>` markers closes the deeper quotes instead of opening another one.

```md
> > # heading
> > stays in the inner quote
> back in the outer quote
```
