# Streaming with your own parts

::toc[On this page]

This document is fed to the parser a few characters at a time. Edit it, or any other file, and it streams again. The list above is `@mdsvex/plugin-toc` from npm, it grows as each heading arrives.

## A component

A tag names a component from `App.svelte`: <Counter count="3" /> is drawn before its paragraph has ended, and keeps its count once it has.

## A directive with a plugin

:lookup[markdown] and :lookup[opcodes] are shown at once. The handler in `plugins.js` looks each one up, and the answer patches a block that has already rendered.

## A plugin on every heading

Each heading above got its id and its link when its line ended, from `heading_links` in `plugins.js`.

- a list
- with *strong*, _emphasis_ and `code`

> And everything else markdown has.
