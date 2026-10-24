# Numbering and cross-references: design

Status: draft for a decision, nothing built. Item 35 of `plugins/PLUGIN_AUDIT.md` (§3.9, Reference apparatus).

What it is for: "Figure 3", "Table 2", "(4)" beside an equation and "1.2" before a heading, with references in the text that read as the number and link to the thing, in the way of [pandoc-crossref](https://lierdakil.github.io/pandoc-crossref/). PFM adds no syntax for it, so every part below is an existing construct: a directive, a directive arg, a fence meta key, a heading id.

Three choices are not settled by the audit or `design/plugin-async.md`. Section 4 asks them, each with a recommendation. The rest follows from those answers and from the async design, and is here so the choices can be judged against it.

## 1. What an author writes

With the recommendations of section 4:

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

- **The kind comes from the prefix of the id**, `fig:`, `tbl:`, `eq:`, `lst:`, `sec:`, as in pandoc-crossref. So a reference knows what it reads as ("Figure") before its target has arrived, which is what a stream needs (section 3).
- **Listings** are fences with `caption="..."` and `id=lst:...`, which `fence_meta` already reads.
- **Sections** are headings. A heading has no id syntax (custom ids are deferred), so `sec:results` names the heading whose id is `results`. Section numbers in front of headings are an option, off by default.
- **The words** ("Figure", "Table", "Equation", "Section", the plural, "and") are options of the plugin, and a frontmatter key can change them for one document.

## 2. How it is built

One bundle, `@mdsvex/plugin-numbering`, with components for its directives:

- **A target's number is known at its close.** It is one more than the targets of its kind before it. Every target is a block (a container directive, a fence, a heading), and the parser never revokes one, so the count lives in `ctx.scratch`. The close callback writes `ctx.add('targets', { id, kind, number })`, owned by the target. `ctx.id(id, { fixed: true })` registers the id, so a heading or a footnote that has it already is a `HeadingIdError`, as for any id the author wrote.
- **A figure and a table** are the plugin's own `figure` and `table` directives. The component renders `<figure>` and a caption with the number, from an arg the close callback sets.
- **An equation** gets its number as `\tag{n}` appended to the fence's code (a plugin can put text in a fence), which Temml and KaTeX both render to the right of the display. The fence is wrapped in a `div` with its id by `wrap_from` at open and `close()` at its close, since the math wrapper takes no attributes.
- **A reference** is the inline directive `ref`. Its component reads the targets from plugin data through Svelte context (`PluginDataContext`) and renders a link with the text. While its target is not known it renders "Figure ?" with no link.
- **The document hook** warns at each reference whose id names no target, and at an id with an unknown prefix.

## 3. What streams and what does not

- **Targets stream.** A figure's number is right the moment it closes and never changes, since only what is before it counts.
- **References stream.** A reference to a target before it reads the number at once. A reference to a target after it (a forward reference) reads "Figure ?" until the target closes, then the data event for `targets` renders it again. This is the reason for the prefix: without it, a forward reference could not even say "Figure".
- **In a compile** the data is complete before the render, so every reference has its number and nothing waits.
- **Warnings for unknown ids** wait for the end, in the document hook, since a target may still come.
- **Section numbers** stream as headings close, from a counter per depth in the scratch.
- **Numbering by chapter**, "Figure 2.3", streams too: the chapter is the last `h1` before the figure.
- **What cannot be done:** a number that depends on what comes later, such as "Figure 3 of 7". Nobody has asked for it.

## 4. Decisions

### 4.1 Which construct is a figure

The component kit being built beside this (`plugins/kit`, not on `next` yet) makes a figure of a lone image with a title, `![alt](./sales.png "Sales by month")`, with `unwrap_images` on. A numbered figure needs an id as well, and an image has nowhere to put one.

1. **A `:::figure` directive with an `id` arg, which this plugin owns, around an image or anything else** (recommended). Its label is the caption. It also covers a figure that is a code block, a diagram or two images side by side. The kit's titled image stays the way to get an unnumbered figure, so there are two ways to get a `<figure>`, one numbered and one not.
2. **The kit's titled image, numbered, with an id made from the caption** as heading ids are made (`fig:sales-by-month`). No new directive, one way to make a figure. A reference breaks when the caption is edited, and only images can be figures.
3. **The kit's titled image, with the id in the title**, `"Sales by month (fig:sales)"`. One construct, but it puts structure in a string, which PFM avoids elsewhere.

Whichever is picked, the kit and this plugin must not both claim `figure`: when two bundles claim one directive name, the component of the later one renders it and nothing says so.

### 4.2 Which construct is a table

Tables have no caption in PFM and no place for an id.

1. **A `:::table[Caption](id=tbl:x)` directive around the table** (recommended), the same shape as 4.1 option 1.
2. **One `:::figure` for both**, the kind taken from the prefix of its id: `:::figure[Caption](id=tbl:plans)` around a table is Table 1. One directive fewer, and a `figure` that is called a table is easy to misread.

### 4.3 How a reference is written

1. **`:ref[fig:sales]`**, the id as the label (recommended). Several ids, comma separated, read as "Figures 1 and 2". The number alone, for "Figures 1 to 3" written by hand, is `:ref[fig:sales](bare=true)`. A capital at the start of a sentence comes from the words option, not from the id.
2. **A plain link with an empty text, `[](#fig:sales)`**, filled in by the plugin. No directive, and it degrades to a link on GitHub, but an empty link means something today (nothing) and would change meaning when the plugin is added.
3. **`:fig[sales]`, `:tbl[plans]`**, one directive per kind. Shorter, five names to learn, and the prefix rule of 4.1 goes.

### Smaller choices, with the default I would take

- **Ids keep their prefix as the element id** (`id="fig:sales"`), so a link to `#fig:sales` written by hand works too, and the link check plugin sees it. A colon is valid in an id and needs escaping only in CSS.
- **Section numbering is off by default**, and numbers headings from `h2` when on, since an `h1` is usually the title.
- **Equations without an id are not numbered**, as in LaTeX's `equation*`. Every figure and table with a caption is numbered, with an id or without.

## 5. What the plugin API is missing for this

Nothing blocks it. Three things cost workarounds:

- **A plugin cannot add a class or an id to the math wrapper**, so an equation is wrapped in a `div` of its own.
- **A plugin cannot see the options of the compile.** Section numbering wants to know whether `heading_ids` is on, and the words want the language of the page.
- **Two bundles that claim one directive name are not reported**, the later one's component wins. That matters as soon as the kit ships.
