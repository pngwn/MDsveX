---
'mdsvex': minor
---

A fenced code block with the language `math` renders as display math. The Vite plugin renders the LaTeX with Temml when it compiles the document, so the page gets MathML and loads no JavaScript for math. Temml is loaded the first time a document has a `math` fence.

````md
```math
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
```
````

```html
<div class="math math-display" translate="no">
	<math display="block" class="tml-display">...</math>
</div>
```

The new `math` option picks the renderer and passes options to it. KaTeX is an optional peer dependency, install it when you pick it. A function is a renderer of your own, and `false` leaves the fence a code block.

```js
mdsvex({ math: { options: { macros: { '\\RR': '\\mathbb{R}' } } } });
mdsvex({ math: { renderer: 'katex' } });
mdsvex({ math: false });
```

mdsvex adds no CSS. Import `temml/dist/Temml-Local.css`, or `katex/dist/katex.min.css` for KaTeX, yourself.

- A `math` export in a components module replaces math. It gets the LaTeX as `code`, `display`, the rest of the fence line as `meta`, and the rendered math as `children`. `pre` and `code` replacements never get math.
- LaTeX the renderer can't read fails the build with a `MathError`, which has the `line` and `column` of the place in the fence.
- A math fence never reaches the highlighter, whatever `highlight` is. With math on, inline code with a `math` hint, `` `#!math x` ``, is plain inline code and no longer warns about an unknown language.
- `compile()` takes `math` as a renderer function and leaves the fence a code block without one. The new `mdsvex/math` entry has `load_math`, `temml_math`, `katex_math` and `source_math`.
- The manifest the plugin writes for editors has a `math` field when the option is not the default.

Inline math, `$x$` and `$$x$$` are not math. A `latex` fence is still a code block.
