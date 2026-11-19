---
'mdsvex': patch
---

Documents compile faster with parse plugins that group content, such as one that wraps each heading and what follows it in a section, or a steps directive that turns each heading into a step. Such a plugin used to slow down every node from its first wrapper to the end of the document or of the directive. On a set of 20 real documents a compile took about 4% less time with sections and about 10% less with steps. Output is unchanged.
