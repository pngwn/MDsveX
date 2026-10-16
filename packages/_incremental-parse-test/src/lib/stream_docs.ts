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

/** a document that cites as it goes, its bibliography written first so it grows in place */
export const CITE_DOC = `# A short history of computing machines

::bibliography[Works cited]

The list above starts empty and fills in as each citation arrives and its entry loads. Each citation shows its key until the bibliography file has loaded, then its number.

## Engines

Charles Babbage designed a machine that could follow a program of operations :cite[babbage1864]. Ada Lovelace saw that it could act on more than numbers :cite[lovelace1843], and wrote what is often called the first program for it :cite[lovelace1843, babbage1864].

## Computable numbers

Alan Turing described a machine that reads and writes symbols on a tape :cite[turing1936], and asked whether machines can think :cite[turing1950].

## Information

Claude Shannon measured information in bits :cite[shannon1948], and John von Neumann described a computer that keeps its program in memory :cite[vonneumann1945].

A key the file does not have shows as written :cite[nobody2000].
`;

/** the bibliography the citations demo reads, as CSL JSON */
export const REFS = JSON.stringify([
	{
		id: 'babbage1864',
		type: 'book',
		title: 'Passages from the Life of a Philosopher',
		author: [{ family: 'Babbage', given: 'Charles' }],
		issued: { 'date-parts': [[1864]] },
		publisher: 'Longman'
	},
	{
		id: 'lovelace1843',
		type: 'article-journal',
		title: 'Notes on the Analytical Engine',
		author: [{ family: 'Lovelace', given: 'Ada' }],
		issued: { 'date-parts': [[1843]] },
		'container-title': 'Scientific Memoirs',
		volume: 3,
		page: '666-731'
	},
	{
		id: 'turing1936',
		type: 'article-journal',
		title: 'On Computable Numbers, with an Application to the Entscheidungsproblem',
		author: [{ family: 'Turing', given: 'Alan' }],
		issued: { 'date-parts': [[1936]] },
		DOI: '10.1112/plms/s2-42.1.230'
	},
	{
		id: 'turing1950',
		type: 'article-journal',
		title: 'Computing Machinery and Intelligence',
		author: [{ family: 'Turing', given: 'Alan' }],
		issued: { 'date-parts': [[1950]] },
		'container-title': 'Mind',
		volume: 59,
		page: '433-460'
	},
	{
		id: 'shannon1948',
		type: 'article-journal',
		title: 'A Mathematical Theory of Communication',
		author: [{ family: 'Shannon', given: 'Claude' }],
		issued: { 'date-parts': [[1948]] },
		'container-title': 'Bell System Technical Journal',
		volume: 27,
		page: '379-423'
	},
	{
		id: 'vonneumann1945',
		type: 'report',
		title: 'First Draft of a Report on the EDVAC',
		author: [{ family: 'Neumann', given: 'John', 'non-dropping-particle': 'von' }],
		issued: { 'date-parts': [[1945]] }
	}
]);
