---
'mdsvex': minor
---

A new `mdsvex/host` entry holds what a tool that compiles documents without Vite needs beside `compile()`. It runs in a browser and in Node without Vite. Its first export, `read_exports`, finds the names a module or a Svelte module script exports, with the TypeScript stripper you pass.

```js
import { read_exports } from 'mdsvex/host';

const { names } = read_exports(source, 'svelte', (code) =>
	ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ESNext } }).outputText
);
```
