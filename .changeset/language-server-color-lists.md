---
'@mdsvex/language-server': patch
---

Editors that follow the language server protocol strictly, such as Zed, no longer log an error each time they ask the server for colors. The server answered with `null` where the protocol wants a list.
