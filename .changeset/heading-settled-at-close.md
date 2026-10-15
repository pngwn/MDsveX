---
'@mdsvex/parse': patch
---

A heading is settled when it closes. An element, an emphasis or a link in it that never closed is text before the close callbacks of the heading run, where before it turned into text after them, and inside a container directive only once the container closed. So `node.text_content` in the close callback of `## The <head> element` holds `<head>`.
