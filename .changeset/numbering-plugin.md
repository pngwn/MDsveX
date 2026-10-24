---
'@mdsvex/plugin-numbering': minor
---

New package: numbering and cross-references. Figures, tables, equations and sections are numbered, and `:ref[id]` reads as the number and links to it. The prefix of the id says what it is.

````md
:::table[What each plan costs](id=tbl:plans)
| plan | price |
| --- | --- |
| free | 0 |
:::

```math id=eq:energy
E = mc^2
```

The plans are in :ref[tbl:plans], :ref[eq:energy] gives the energy, and :ref[fig:a, fig:b] reads "Figures 1 and 2".
:ref[fig:a](prefix=Chart) reads "Chart 1" and :ref[fig:a](prefix=false) reads "1".
````

The words are the `prefixes` option. A figure is the `:::figure[Caption](id=fig:x)` of `@mdsvex/plugin-kit`, a section is a heading referenced as `sec:` and its id, and `number_sections: true` puts the number in front of each heading. In a streaming view each number shows as soon as its target arrives, and a reference to a target further down reads "Figure ?" until then.
