---
'mdsvex': patch
---

Documents compile faster with parse plugins, most of all with plugins that add nodes (`wrap_inner`, `prepend`, `append`, `wrap_from`) or that change inline nodes such as emphasis and links. A plugin now costs about what its own handlers do, where it used to slow down every node after the first one it added or changed. On a set of 20 real documents a compile with the heading autolink plugin took about 14% less time. Output is unchanged.
