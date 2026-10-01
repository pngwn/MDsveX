---
'@mdsvex/render': minor
'mdsvex': minor
---

Import statements at the top of a document are kept. They go into the document's instance `<script>`, or into a new `<script>` when there is none.

```md
import Chart from './Chart.svelte'

<Chart />
```
