---
'@mdsvex/parse': patch
---

List items indented by the same amount are siblings again. The first item's indent was measured after its leading whitespace had been skipped, so later items nested under it. This affected any indented list, including lists inside HTML elements and components.

```md
<div>

    - one
    - two

</div>
```
