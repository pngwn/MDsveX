---
'@mdsvex/parse': minor
---

The bracket text of leaf and container directives is now parsed as inline content, as inline directive text already was. It becomes a `directive_label` node, the first child of the directive, so a container's label stays apart from its body blocks:

```
:::Callout[Heads *up*](kind=warn)
body
:::
```

```
directive_container name="Callout" args.kind="warn"
  directive_label
    text "Heads "
    strong_emphasis
      text "up"
  paragraph
    text "body"
```

The label takes the same inline constructs as inline directive text: emphasis, strong, code spans, strikethrough, superscript, subscript, escapes, nested inline directives, mustaches and html. Links, images and autolinks stay literal. Nothing in the label reaches past its closing `]`, so `::x[*a](k=*)` keeps `*a` as text and its args intact, and brackets inside a code span no longer end the label. Empty brackets make no label node. The directive keeps the raw bracket text as its value range.
