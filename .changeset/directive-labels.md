---
'@mdsvex/parse': minor
'@mdsvex/render': patch
'mdsvex': patch
---

Leaf and container directive labels now take inline markdown, as inline directive text does. A directive component's `label` snippet renders it, so `:::Callout[Heads *up*]` passes `Heads <strong>up</strong>`. Links, images and autolinks stay literal, and nothing in a label reaches past its closing `]`, so `::x[*a](k=*)` keeps `*a` as text and its args intact.

In the parse tree the label is a `directive_label` node, the directive's first child, so a container's label stays apart from its body:

```
directive_container name="Callout"
  directive_label
    text "Heads "
    strong_emphasis
      text "up"
  paragraph
    text "body"
```
