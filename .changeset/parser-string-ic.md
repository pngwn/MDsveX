---
'@mdsvex/parse': patch
---

Parsing is faster when several entry points share one process, because the parser reads source characters through a direct builtin call that stays optimized for every string representation and never reads past the end of the input.
