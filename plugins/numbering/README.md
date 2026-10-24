# @mdsvex/plugin-numbering

Numbering for [mdsvex](https://mdsvex.pngwn.io): numbered figures, tables, equations and sections, and references that read as the number and link to it, in the way of [pandoc-crossref](https://lierdakil.github.io/pandoc-crossref/).

```bash
pnpm add --save-dev @mdsvex/plugin-numbering@next
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { figures } from '@mdsvex/plugin-kit';
import { numbering } from '@mdsvex/plugin-numbering';

export default {
	plugins: [mdsvex({ heading_ids: true, plugins: [figures(), numbering()] })],
};
```

````md
## Results

:::figure[Sales by month](id=fig:sales)
![A bar chart of sales by month](./sales.png)
:::

:::table[What each plan costs](id=tbl:plans)
| plan | price |
| --- | --- |
| free | 0 |
:::

```math id=eq:energy
E = mc^2
```

Sales rose in March (:ref[fig:sales]), the plans are in :ref[tbl:plans],
:ref[eq:energy] gives the energy and :ref[sec:results] has the rest.
````

```html
<figure id="tbl:plans" class="table">
	<figcaption>
		<span class="table-number">Table 1</span>: What each plan costs
	</figcaption>
	<table>
		...
	</table>
</figure>
<div id="eq:energy" class="equation">
	<div class="math math-display">... (1)</div>
</div>
<p>
	Sales rose in March (<span class="ref"><a href="#fig:sales">Figure 1</a></span
	>), the plans are in <span class="ref"><a href="#tbl:plans">Table 1</a></span
	>, ...
</p>
```

## Targets

The prefix of an id says what it is, as in pandoc-crossref.

| kind   | written as                                             | numbered when                                                                 |
| ------ | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `fig:` | `:::figure[Caption](id=fig:x)` of `@mdsvex/plugin-kit` | it has a caption and a `fig:` id                                              |
| `tbl:` | `:::table[Caption](id=tbl:x)` around a table           | it has a caption and a `tbl:` id                                              |
| `eq:`  | a `math` fence with `id=eq:x` in its meta              | it has an `eq:` id                                                            |
| `sec:` | a heading, `sec:` and its id                           | it has an id, from `heading_ids`, and is as deep as `section_depth` or deeper |

- **Each kind counts on its own**, in the order the document has them: Figure 1, Table 1, Figure 2.
- **A figure or table with a numbered id and no caption** is a warning and has no number.
- **An equation** gets its number as `\tag{n}`, which the math renderer shows beside it, and is wrapped in a `<div class="equation">` with its id. Without the `math` option the fence stays code and shows the `\tag`.
- **A section** is numbered 1, 1.1, 1.2 from `section_depth` down, `h2` by default since an `h1` is usually the title. `number_sections: true` also puts the number in front of each heading, in a `<span class="section-number">`.
- **An id given twice** to two targets fails the compile with a `HeadingIdError`, as any id the author wrote does.

The kit's figure renders the number. It reads `plugin_data.numbering['target:' + id]`, `{ kind, number, text }`, from Svelte context, and so can any component of your own.

## References

- **`:ref[fig:sales]`** reads "Figure 1" and links to the figure.
- **`:ref[fig:a, fig:b]`** reads "Figures 1 and 2", each number a link. Ids of different kinds read "Figure 1 and Table 2".
- **A reference to a target that is not there** is a warning, and reads "Figure ?". So does an id with no known prefix, which reads as written.

## Options

```ts
numbering({
	words: {
		fig: ['Figure', 'Figures'],
		tbl: ['Table', 'Tables'],
		eq: ['Equation', 'Equations'],
		sec: ['Section', 'Sections'],
		and: 'and',
	}, // any of them, what references and captions read as
	number_sections: boolean, // false, the number in front of each heading
	section_depth: number, // 2, the depth of the headings numbered 1, 2, 3
});
```

## Streaming

A target's number is known when it closes, from the targets of its kind before it, and never changes. A reference reads the numbers through Svelte context, so in a streaming view a reference to a target before it shows the number at once, and one to a target after it reads "Figure ?" until that target arrives. A compiled page has every number before it renders. Only the warnings for ids that name nothing wait for the end of the document.
