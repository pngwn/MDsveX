---
'@mdsvex/plugin-embeds': patch
---

A Vimeo embed's frame allows `encrypted-media`, as the YouTube one already did. Without it Vimeo's player logs a permissions policy violation to the console on every page that has one, and can't play a video that needs it.
