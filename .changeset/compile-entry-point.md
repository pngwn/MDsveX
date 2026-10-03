---
'mdsvex': minor
---

Add a `mdsvex/compile` entry point that holds only the compiler: `compile`, `CompilerSession`, the errors it throws and its option and result types. It never imports Vite, `es-module-lexer` or Node builtins, even lazily, so a browser or worker bundle needs no config to leave them out.

```js
import { compile } from 'mdsvex/compile';

const { code } = compile('# Hello');
```

The root `mdsvex` entry is unchanged and still exports everything, including the Vite plugin.
