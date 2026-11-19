---
'@mdsvex/parse': minor
---

In a plugin's open handler, `node.parent` is the node the author wrote it inside, whatever wrappers a plugin has put there. A child of a node that had a `wrap_inner` wrapper used to see that wrapper as its parent at open. It now sees the wrapper only in its close callback, where `node.parent` is the parent in the tree.
