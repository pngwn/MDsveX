/** a long document for the table of contents to grow beside */
export const TOC_DOC = `# A guide to the streaming parser

::toc[On this page]

The table of contents above and the one beside this text fill in as each heading arrives. Every heading gets its id the moment its line ends, so a link in the list works before the document has finished.

## Installing

Install the parser and the renderer from the registry. Both are plain modules with no build step of their own.

### With pnpm

Run the install in the root of your project, then import the parser where you need it.

### With npm

The same packages install with npm. Nothing else changes.

## Feeding text

A parser is fed text in pieces of any size. It emits opcodes for what it is sure of and holds the rest until the next piece settles it.

### Chunks and lines

A heading is complete when its line ends, a paragraph when a blank line follows it.

### Revocation

When a guess turns out wrong, the parser revokes the node and what it held becomes text.

## Rendering

The renderer caches each top level block once it has closed, so a long document costs little to show while it grows.

### Blocks that change later

A plugin that looks something up later patches its node, and the renderer drops the cache of that block.

### Plugin data

What plugins write is followed as it changes, so a component that reads it renders again.

## Plugins

A plugin declares handlers by node type. Fused handlers run as nodes open and close, in the one pass the builder already makes.

### Heading ids

Ids are given out in document order, so a repeat of a heading gets a suffix.

### Repeated headings

## Plugins

The heading above repeats one earlier in the document, so its id is \`plugins-1\`.

## Wrapping up

That is the whole tour. Every heading of this document is in the list.
`;

/** a document whose terms are looked up after they appear */
export const DEFER_DOC = `# Looking things up later

Each term below is shown at once, and its definition arrives a moment later, as a lookup over the network would.

## Markup

:lookup[markdown] is a plain text format, and :lookup[html] is what a browser renders.

## The parser

The parser emits :lookup[opcodes], and a :lookup[revoke] takes back a guess that was wrong.

## Rendering

A :lookup[block] that already rendered is patched when its lookup lands, and the rest of the page is left alone.
`;

/** what the fake lookup answers */
export const DEFINITIONS: Record<string, string> = {
	markdown: 'a light markup language for prose',
	html: 'the markup of the web',
	opcodes: 'small instructions that build the tree',
	revoke: 'the opcode that undoes a speculative node',
	block: 'a child of the root, the unit the renderer caches'
};
