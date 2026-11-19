---
'@mdsvex/plugin-diagram': minor
---

New package: `diagram()` draws each `mermaid` fence as a diagram. With `pele` installed it is drawn at build time and the page ships the SVG, themed by CSS variables for light and dark, with no script. With `mermaid` installed it is drawn in the browser. Both are optional peer dependencies, `engine` picks one, and the source of each diagram stays on the page beside it.

```js
import { diagram } from '@mdsvex/plugin-diagram';

mdsvex({ plugins: [diagram()] });
```
