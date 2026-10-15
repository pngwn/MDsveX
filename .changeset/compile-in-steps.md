---
'mdsvex': minor
---

A host that is not Vite can compile in steps, fetching what a document needs between them:

```js
const session = new CompilerSession();
const inputs = compile_inputs(options);
const parsed = session.parse(source, inputs);
await session.settle(parsed); // undefined when nothing was deferred
// read parsed.needs, set inputs.sources
const { code } = session.render(parsed, inputs);
```

`CompilerSession.parse`, `settle` and `render`, `Parsed.needs` and `compile_inputs(options)` are public.
