---
'@mdsvex/migrate': minor
---

`migrate` rewrites GitHub alerts as callouts: `> [!NOTE]` and the other four kinds, in any case, become `:::note` and so on, with one level of `>` taken off the body and text after the marker as the title. Obsidian's other kinds and callouts that fold stay block quotes.

`migrate_document` migrates a document as `migrate` does and returns its `code` with `notes`: the plugin to install for the callouts, each Obsidian callout left as it was, and a frontmatter `template` key that blocks renaming `layout`.

The notes for `remark-github-blockquote-alert`, `remark-github-alerts`, `rehype-callouts`, `remark-obsidian-callout`, `remark-github-admonitions-to-directives` and `remark-github-beta-blockquote-admonitions` say to install `@mdsvex/plugin-callouts`. The note for `remark-validate-links` names `@mdsvex/plugin-link-check`, and `remark-lint` gets one too.
