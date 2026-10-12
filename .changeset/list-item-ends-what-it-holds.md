---
'@mdsvex/parse': patch
---

A list item ends what it holds. A line that is not indented to the item ends a container directive or a Svelte block left open in it, and the line after a fence or a thematic break in an item is outside the item unless it is indented. A paragraph right under the item still continues onto a line that is not indented.

```md
- :::note
  inside the directive
outside the list
```
