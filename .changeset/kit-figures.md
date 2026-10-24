---
'@mdsvex/plugin-kit': minor
---

`figures()` adds a `:::figure` directive. What is written inside it, an image, a code block, a table or a diagram, is put in a `<figure>` with the bracket text as its caption, and an optional `id` stays on the element so a link can reach it.

```md
:::figure[Sales by month](id=fig:sales)
![A bar chart of sales by month](./chart.png)
:::
```
