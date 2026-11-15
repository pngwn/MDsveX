---
'@mdsvex/plugin-steps': minor
'@mdsvex/plugin-elements': minor
'@mdsvex/plugin-embeds': minor
---

Steps, the elements (`details`, `accordion`, `kbd`, `ruby`, `badge`, `mark`, `ins`, `abbr`) and the video embeds render at build time. A page gets their HTML and the plugin's stylesheet, and never loads or hydrates their components. Content inside them stays live. The components are still exported under the same paths, such as `@mdsvex/plugin-steps/Steps.svelte`, to wrap one in your own.

An embed with an id no longer passes its label to the component, since the label is already the title of the frame. With no id, the label still shows in place of the frame.
