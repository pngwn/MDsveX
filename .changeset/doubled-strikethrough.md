---
'@mdsvex/parse': patch
---

A doubled `~~~~` nests two strikethroughs before punctuation, a link or a code span, as it does before a letter, and tildes with nothing between them stay literal text. Neither produces an empty strikethrough any more.

```md
~~~~(x)~~~~ and a ~~~~ b
```
