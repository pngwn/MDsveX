---
'@mdsvex/parse': patch
---

An HTML element left open in a table cell no longer matches a closing tag in a later cell or row. The closing tag is now literal text. Before, the parser closed the table twice and put the content after the tag under the root.

```md
| a <span>b | c</span> |
| --------- | --------- |
```
