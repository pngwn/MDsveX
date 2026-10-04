---
'mdsvex': patch
'@mdsvex/render': patch
---

A replaced `pre` gets `title`, `caption` and meta props from the fence meta with `highlight: false` too, which is the `compile()` default, and when a highlighter returns `null` for a fence. A meta prop that collides with a built-in prop is dropped with the same warning in every mode.

````md
```ts title="math.ts" playground height=300
const a = 1;
```
````

gives `title={"math.ts"}`, `playground={true}` and `height={"300"}` whether or not the code is highlighted. A fence that isn't replaced still renders as a plain `<pre><code class="language-ts">` without highlighting, with no `<figure>` for its title or caption.
