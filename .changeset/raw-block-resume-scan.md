---
'@mdsvex/parse': patch
---

Streaming a document with `feed()` no longer rescans a long `<script>` or `<style>` block from its start on every chunk while it waits for the closing tag.
