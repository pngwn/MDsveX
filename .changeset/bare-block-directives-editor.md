---
'@mdsvex/language-core': minor
'@mdsvex/source-map': minor
'vscode-pfm': minor
---

The editor reads leaf and container directives written without square brackets. Args complete after `::toc(` and `:::Callout(`, and are checked and hovered as the props they become. The grammar highlights `::name` and `:::name(key=val)` when they are alone on their line, after any quote or list markers. An inline directive is still only highlighted and completed with its brackets.
