---
'@mdsvex/parse': patch
---

A parse plugin that changes an emphasis, a link, an inline html element or another node the parser opens before it knows the node will stay no longer slows down the rest of the document. What the plugin did to such a node was kept in case of a revoke until the document ended, and every later node close went through the plugin dispatcher because of it. It is now dropped when the node closes, unless the parser still decides on the node.
