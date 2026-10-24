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
| `fig:` | `:::figure[Caption](id=fig:x)` of `@mdsvex/plugin-kit` | it has a `fig:` id                                                            |
| `tbl:` | `:::table[Caption](id=tbl:x)` around a table           | it has a `tbl:` id                                                            |
| `eq:`  | a `math` fence with `id=eq:x` in its meta              | it has an `eq:` id                                                            |
| `sec:` | a heading, `sec:` and its id                           | it has an id, from `heading_ids`, and is as deep as `section_depth` or deeper |

- **Each kind counts on its own**, in the order the document has them: Figure 1, Table 1, Figure 2.
- **A figure or table without a caption** is numbered all the same, a figure or table without an id of its kind is not.
- **An equation** gets its number as `\tag{n}`, which the math renderer shows beside it, and is wrapped in a `<div class="equation">` with its id. Without the `math` option the fence stays code and shows the `\tag`.
- **A section** is numbered 1, 1.1, 1.2 from `section_depth` down, `h2` by default since an `h1` is usually the title. `number_sections: true` also puts the number in front of each heading, in a `<span class="section-number">`.
- **An id given twice** to two targets fails the compile with a `HeadingIdError`, as any id the author wrote does.

The kit owns the figure and renders the number, the numbering plugin only observes it. It reads `plugin_data.numbering['target:' + id]`, `{ kind, number, text }`, from Svelte context, and so can any component of your own.

## References

- **`:ref[fig:sales]`** reads "Figure 1", one link for the word and the number.
- **`:ref[fig:a, fig:b]`** reads "Figures 1 and 2", the plural word, each number a link.
- **`prefix`** replaces the word: `:ref[fig:sales](prefix=Chart)` reads "Chart 1", `prefix="Bar chart"` "Bar chart 1". In a reference to several ids the word is used as written, so write the plural. Only the literal `prefix=false` leaves the word out, "1", or "1 and 2" for several. Any other value is a word, `False` and `no` included.
- **Ids of different kinds**, `:ref[fig:a, tbl:b]`, are a warning. The reference reads each kind with its own word, "Figure 1 and Table 1", and ignores a written `prefix`, `prefix=false` still leaves the words out. Write one `:ref` for each kind.
- **A reference to a target that is not there** is a warning, and reads "Figure ?". An id with no known prefix is a warning and reads as written.

## Options

```ts
numbering({
	prefixes: {
		fig: ['Figure', 'Figures'],
		tbl: ['Table', 'Tables'],
		eq: ['Equation', 'Equations'],
		sec: ['Section', 'Sections'],
	}, // any of them, the word for one and for several, also what a caption reads as
	and: 'and', // what joins the last two numbers
	number_sections: boolean, // false, the number in front of each heading
	section_depth: number, // 2, the depth of the headings numbered 1, 2, 3
});
```

A site that writes "fig." passes `prefixes: { fig: ['fig.', 'figs.'] }`, and a sentence that starts with a reference writes `prefix=Fig.`, there is no separate form for a capital.

## Streaming

A target's number counts the targets of its kind before it, so it never changes, and it is shown as soon as the target closes. A reference reads the numbers through Svelte context, so in a streaming view a reference to a target before it shows the number at once, and one to a target after it reads "Figure ?" until that target arrives. A compiled page has every number before it renders. Only the warnings for ids that name nothing wait for the end of the document.
