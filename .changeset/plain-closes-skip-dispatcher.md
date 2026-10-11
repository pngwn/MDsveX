---
'@mdsvex/parse': patch
---

With parse plugins, a node close that no plugin has anything for no longer goes through the plugin dispatcher, and a leaf node of a type no plugin handles is built in one step even while a `wrap_from` wrapper or a directive with bound handlers is open. Every close used to take a slower path as soon as a document had any plugin.
