---
'@mdsvex/parse': patch
---

An autolink has its `href` and its text when it closes, as a link written `[text](url)` does. A parse plugin that reads a link in its close callback used to see neither for `<https://example.com>`, and a node it appended there landed ahead of the link text.
