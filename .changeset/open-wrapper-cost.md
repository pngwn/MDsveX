---
'@mdsvex/parse': patch
---

A parse plugin that keeps a wrapper open no longer slows down the rest of the document. While a `wrap_from` wrapper was open (a section from one heading to the next, a step inside a steps directive), or a `wrap_inner` wrapper of a node that was still open, every node went through the plugin dispatcher on its way into the tree. Now only the direct children of the wrapped node do. The same holds inside a container directive with bound handlers. On a set of 20 real documents a parse with a plugin that wraps each heading and what follows it in a section took about 13% less time. The tree is unchanged.

For a builder of your own, `PluginDispatcher.open_wants` now holds a parent index per node kind where it held a flag, and `PluginDispatcher.wants_open` is gone.
