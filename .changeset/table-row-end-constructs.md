---
'@mdsvex/parse': patch
---

In a table body row, an HTML tag, a comment, a Svelte expression or a `<script>` that does not end on its row is literal text, as it already is in a header row. It used to read on into the next line, and the rest of that line was dropped from the table.

```md
| a   | b   |
| --- | --- |
| c   | <!--
--> | d |
```

The second body row now has the cells `-->` and `d`.
