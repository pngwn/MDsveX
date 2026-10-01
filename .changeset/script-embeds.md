---
'@mdsvex/render': minor
'mdsvex': minor
---

A top level `<script>` with a `src` attribute, as in pasted tweet or Instagram embeds, renders as `<svelte:element this={"script"}>`. Svelte treats every top level `<script>` as the component script, so two embeds used to fail to compile.
