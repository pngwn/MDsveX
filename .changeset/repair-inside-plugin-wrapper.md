---
'@mdsvex/parse': patch
---

An unclosed html tag inside a wrapper a parse plugin made becomes a paragraph of its literal text, as it does without the wrapper. Inside a blockquote whose content a plugin had wrapped it became bare text.
