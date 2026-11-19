# Numbering and cross-references: design

Status: decided 2026-10-24, built as `@mdsvex/plugin-numbering`. Section 4 has the rulings. Item 35 of `plugins/PLUGIN_AUDIT.md` (section 3.9, Reference apparatus).

What it is for: "Figure 3", "Table 2", "(4)" beside an equation and "1.2" before a heading, with references in the text that read as the number and link to the thing, in the way of [pandoc-crossref](https://lierdakil.github.io/pandoc-crossref/). PFM adds no syntax for it, so every part below is an existing construct: a directive, a directive arg, a fence meta key, a heading id.

## 1. What an author writes

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

Sales rose in March (:ref[fig:sales]), the plans are in :ref[tbl:plans], :ref[eq:energy]
gives the energy and :ref[sec:results] has the rest. :ref[fig:sales, tbl:plans] together.
````

```html
<h2 id="results">Results</h2>
<figure id="fig:sales">
	<img src="..." alt="A bar chart of sales by month" />
	<figcaption>Figure 1: Sales by month</figcaption>
</figure>
<figure id="tbl:plans" class="table">
	<figcaption>Table 1: What each plan costs</figcaption>
	<table>...</table>
</figure>
<div id="eq:energy" class="equation">
	<div class="math math-display" translate="no"><!-- E = mc^2 \tag{1} --></div>
</div>
<p>
	Sales rose in March (<a href="#fig:sales">Figure 1</a>), the plans are in
	<a href="#tbl:plans">Table 1</a>, <a href="#eq:energy">Equation 1</a> gives the energy and
	<a href="#results">Section 1</a> has the rest. <a href="#fig:sales">Figure 1</a> and
	<a href="#tbl:plans">Table 1</a> together.
</p>
```

- **The kind comes from the prefix of the id**, `fig:`, `tbl:`, `eq:`, `sec:`, as in pandoc-crossref. So a reference knows what it reads as ("Figure") before its target has arrived, which is what a stream needs (section 3).
- **A figure** is the `:::figure` directive of `@mdsvex/plugin-figures`, the one way to make a figure. Without an id, or with an id that does not start with `fig:`, it is not numbered. The numbering plugin does not claim `figure`.
- **A table** is the numbering plugin's own `:::table[Caption](id=tbl:x)` around a table.
- **A figure and a table are numbered when they have an id of their kind**, with a caption or without. The caption reads `Figure 1: Caption`, or `Figure 1` alone.
- **An equation** is a `math` fence with `id=eq:x` in its meta. One without an id is not numbered, as LaTeX's `equation*`.
- **A section** is a heading. A heading has no id syntax (custom ids are deferred), so `sec:results` names the heading whose id is `results`, which takes `heading_ids`. Numbers in front of headings are an option, off by default.
- **The words** ("Figure", "Table", "Equation", "Section" and their plurals) are the `prefixes` option, and "and" is the `and` option. A reference replaces the word with its `prefix` arg (4.4).

## 2. How it is built

- **A target's number is known at its close.** It is one more than the targets of its kind before it. Every target is a block (a directive label, a fence, a heading), and the parser never revokes one, so the counts live in `ctx.scratch`. The close callback writes `ctx.set('target:<id>', { kind, number, text })`, owned by the target, `number` a string so `2.1` fits later. `ctx.id(id, { fixed: true })` registers the id, so one given twice is a `HeadingIdError`, as for any id the author wrote.
- **A figure** belongs to `@mdsvex/plugin-figures`. The numbering plugin observes it (`observe: { figure }`, #1234): it reads the args at the open, takes the number then, and writes the target at the close, changing nothing of the node. Its component reads `plugin_data.numbering['target:' + id]` from Svelte context and renders `text` before the caption, or alone when there is none.
- **A table** is the plugin's own directive, numbered by the same handler as its owner, its component renders `<figure class="table">` and the caption with the number.
- **An equation** gets its number as `\tag{n}` appended to the fence's code, which Temml and KaTeX render beside the display. The fence is wrapped in a `div` with its id, since the math wrapper takes no attributes.
- **A reference** is the inline directive `ref`. Its close callback hands its component the ids, the prefixes of their kinds and `and` as args, beside the `prefix` the author wrote, and the component reads the targets from plugin data through Svelte context. While a target is not known it renders the word and `?`, with no link.
- **Several ids**, `:ref[fig:a, fig:b]`, read "Figures 1 and 2", each number its own link, as citations does with several keys.
- **The document hook** warns at each reference whose id names no target and at an id with an unknown prefix. A reference that mixes kinds warns at its close.

## 3. What streams and what does not

- **Targets stream.** A figure's number is right the moment it closes and never changes, since only what is before it counts.
- **References stream.** A reference to a target before it reads the number at once. A forward reference reads "Figure ?" until the target closes, then the data event for its key renders it again.
- **In a compile** the data is complete before the render, so every reference has its number and nothing waits.
- **Warnings for unknown ids** wait for the end, in the document hook, since a target may still come.
- **Section numbers** stream as headings close, from a counter per depth in the scratch.
- **What cannot be done:** a number that depends on what comes later, such as "Figure 3 of 7".

## 4. Decisions

Decided 2026-10-24:

1. **Figures.** One way to make a figure, the `:::figure[Caption](id=...)` of `@mdsvex/plugin-figures`, which began in the component kit. The kit's lone image with a title is removed. With a `fig:` id and the numbering plugin on, a figure is numbered, the figures plugin renders the number it is given through plugin data.
2. **Tables.** `:::table[Caption](id=tbl:x)` around the table, owned by the numbering plugin.
3. **References.** `:ref[fig:sales]`, the kind from the prefix, "Figure ?" while a forward reference streams, and several ids in one reference as pandoc-crossref groups them.

4. **The word of a reference.** `prefix` takes a word or `false`. `:ref[fig:sales](prefix=Chart)` reads "Chart 1" and `prefix="Bar chart"` "Bar chart 1", the link covering word and number. `prefix=false` reads "1", pandoc-crossref's `-@fig:sales`, and only the literal `false` does. The defaults are the `prefixes` option, a word for one and for several by kind. A group takes the plural default, a written `prefix` is used as written (the author writes the plural) and `false` reads "1 and 2". There is no separate form for a capital, a word covers it. `@fig:sales` was not taken, it would be new syntax and clashes with `@user` mentions of the references plugin.
5. **Kinds mixed in one reference** are a warning. The reference reads each kind with its own default word, "Figure 1 and Table 1", ignores a written `prefix` since one word can not name two kinds, and `prefix=false` still leaves the words out.
6. **A figure or table without a caption** is numbered when it has an id of its kind. Observing the figure, the plugin no longer needs the caption to find it, and an id is the author asking for a number.

Smaller choices, as recommended:

- **Ids keep their prefix as the element id** (`id="fig:sales"`), so a link to `#fig:sales` written by hand works too, and the link check plugin sees it.
- **Section numbering is off by default**, and numbers headings from `h2` when on, since an `h1` is usually the title.
- **Listings** (fences with a caption) and chapter numbers (`Figure 2.1`) come later.

## 5. What the plugin API was missing for this

- **A plugin could not see a directive another bundle owns.** A global handler is never called for a directive a component takes, and two bundles that bound one name ran only the later one's handlers, silently. #1234 adds observers and makes two owners of a name a `DirectiveOwnerError`, so the plugin observes the figure. Before it, the figure was found from the close of its caption label, and could not be numbered without one.
- **A plugin cannot add a class or an id to the math wrapper**, so an equation is wrapped in a `div` of its own.
- **A plugin cannot see the options of the compile.** Section references need `heading_ids`, and the plugin can only find out from the tree that it is off.
