---
'@mdsvex/plugin-steps': minor
---

New package: numbered steps. Each heading written directly inside a `:::steps` container starts a step, with the heading as its title and what follows as its body.

```js
import { steps } from '@mdsvex/plugin-steps';

mdsvex({ plugins: [steps()] });
```

````svx
:::steps

## Install

```sh
pnpm add mdsvex
```

## Configure

Add it to the config.

:::
````

- The first heading sets the depth that splits, and `:::steps(level=3)` names it instead. A heading of any other depth is content of its step.
- The package ships `Steps.svelte` and `Step.svelte` as Svelte source. They render an ordered list, numbered by a CSS counter in a small stylesheet that `steps({ css: false })` leaves out.
- A `steps` or `step` export from your own directives module replaces the component and gets the same `label` and `children`.
