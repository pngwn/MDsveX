# svelte-parse

It is a parser.

- [Details and Limitations](#details-and-limitations)
- [Install](#install-it)
- [Use](#use-it)
  - [`parse`](#parse)
  - [`parseNode`](#parsenode)
  - [`Point`](#point)

## Details and limitations

This is a parser for Svelte syntax that generates a [`svast`](https://github.com/pngwn/MDsveX/tree/master/packages/svast).

This is not the same as the Svelte parser as it performs no validation and allows pretty much anything that looks like valid syntax.

- `directive:specifier` directives are not validated: any directive name and specificier is allowed.
- `on:click|modifier` modifiers are not validated: any modifier name is allowed and they can appear after any attribute or directive.
- `svelte:*` special tags are not validated: they can have any name, there can be any quantity, they can appear anywhere, and child nodes are allowed.
- `script` and `style` elements are not validated: there can be any quantity regardless of attribute names and values.
- Anything contained inside expressions and script elements is not parsed, `svelte-parse` tries to be language agnostic. This introduces some limitations detailed below.
- The parser will try to contiue parsing regardless of what happens. It does not actively try to repair mistakes or recover from errors, but it never throws and usually returns an AST. Errors are reported separately.

_Note: Error handling is currently a wip/todo, the above represents the intention._

`svelte-parse` will parse _almost_ anything that the Svelte parser will, with one or two important caveats. This is not a drop in replacement right now (and may never be).

- Javascript expressions are difficult to parse without a JavaScript parser. `svelte-parse` handles them by matching curly braces (as they mark the end of an expression in various contexts) and by ignoring quoted values inside expressions. The biggest shortcoming here is that using curly braces inside regular expressions in an expression will cause the parse to fail in some way unless those braces are balanced. Being as language agnostic as possible is a goal, even if it is unrealistic. The current parser will handle C-like languages with the above caveats.
- `svelte-parse` does not currently implement the full HTML parsing algorithm and has relatively rudimentary HTML handling. Void tags are handled so `<input/>` and `<input>` are treated the same but unclosed paragraph tags, for example, are not autoclosed. All non-void tags are expected to have a closing tags. I am uncertain how far down this path I'm willing to go.
- `{#each exp}` blocks do not currently use the [`EachBlock`](https://github.com/pngwn/MDsveX/tree/master/packages/svast#eachblock) node as defined in [`svast`](https://github.com/pngwn/MDsveX/tree/master/packages/svast) because it is difficult/ impossible to parse in a language agnostic manner. It is currently a [`BranchingBlock`](https://github.com/pngwn/MDsveX/tree/master/packages/svast#branchingblock). The `expression`, `name`, `index`, and `key` are stored as a big blob in the expression field instead of being stored separately as they should be.

## Install it

```bash
npm i svelte-parse
```

## Use it

`svelte-parse` exports two functions, `parse` and `parseNode`. If you just want an AST for a Svelte document then use `parse` and ignore `parseNode` completely.

### `parse`

`parse` takes in a source string and returns an AST. It accepts an object of options, the interface looks like this:

```ts
interface ParseOptions {
	value: string;
	generatePositions?: boolean; // default = false
}
```

The `value` property should be the source code you wish to parse.

The `generatePositions` field is optional and should be a boolean. This will tell the parser whether or not it should generate positional data when parsing the source file.

Parse will return the `Root` svast node, the interface looks like this:

```ts
interface Root {
	type: 'root';
	children: (
		| SvelteElement
		| SvelteComponent
		| Comment
		| Text
		| SvelteExpression
		| VoidBlock
		| BranchingBlock
		| IfBlock
		| EachBlock
		| AwaitBlock
		| SvelteTag
	)[];
}
```

The `ast` constains the AST that was generated as a result of the parse. This will be a [`Root`](https://github.com/pngwn/MDsveX/tree/master/packages/svast#root) svast node and is the entry point into the AST.

The `errors` property will be an array of any parsing errors or warnings. I have no idea what this will contain. (error code, error message, position ?)

This is how you might use it:

```js
import { parse } from 'svelte-parse';

const source = `
{@html someHTML}

<div>
  <input on:input={(e) => console.log(e)}/>
</div>
`;

const { ast, errors } = parse({ value: source, generatePositions: true });

// TODO, what does this return? run it
// {
// 	type: 'root',
// 	children:
// }
```

### `parseNode`

`parseNode` takes a source string and returns an AST node. It is a little bit weird but is designed to allow you to compose parsers when parsing hybrid languages.

Given a string `<input /><input />` it will parse only the first input returning a single AST node, positional information, the portion of the string that has been parsed, and the portion of the string that is yet to be parsed. This gives you great control over how you parse a given source string.

It accepts an object of options, the interface looks like this:

```ts
export interface ParseNodeOptions {
	value: string;
	currentPosition?: Point & { index?: number };
	childParser: (
		options: ParseNodeOptions
	) => [Node[], Point & { index?: number }, number];
	block?: boolean;
	silent?: boolean;
	generatePositions: boolean;
}
```

The `value` property is required should be a a string of svelte source code.

The `currentPosition` property is optional and describes the current location of the parser's pointer in a source file. Passing in this object allows you to start parsing any fragment of a document while maintaining accurate positional information, the parser will use this as the starting point when generating positional information. It should be a [`Point` object](#point) with an optional `index` field.

The `childParser` field is required and should be a function with which to parse any children (`<div><Child /><Child /></div>`). Whatever function you are using to invoke `parseNode` in a loop to chomp the entire source string should probably be passed in as the `childParser` option. It is important that this function knows when to yield to it's caller, a conditional check when iteratively parsing a possible child string will handle this, the `parseNode` function itself knows when it is no longer parsing a child node and will return `undefined` in such a case.

`childParser` receives the same arguments as `parseNode` and should return an array with three elements: an array of `Node`s, a `Point` object and a number representing the current index (same as `Point.offset` but for a single parse run rather than a whole document).

The `block` field is optional and is a boolean describing whether or not we are currently in a block parsing context or an inline parsing context. This information can be used by `parseNode` or `childParser` as needed.

The `silent` field is optional and is be a boolean and probably does something.

The `generatePositions` field is optional and should be a boolean. This will tell the parser whether or not it should generate positional data when parsing the source.

`parseNode` returns an object containing lots of valuable information, the interface looks like this:

```ts
export interface Result {
	chomped: string;
	unchomped: string;
	parsed: Node;
	position?: Point & { index?: number };
}
```

The `chomped` field contains the portion of the provided source that has been parsed.

The `unchomped` field contains the portion of the provided source that is yet to be parsed. If parsing in a loop, this is where you will continue from.

The `parsed` field is a `Node` object and contains the AST for the `chomped` source string.

The `position` field, when present, is a `Point` object and describes the final position of the parsers pointer. If parsing in a loop this should be passed back into the parseNode function.

For an example oif how the `parseNode` function can be used to parse a document you can look at [the implementation of [`parse`](https://github.com/pngwn/MDsveX/blob/9dcb6cb3d4dcb1aa17d2687925209a955b7cbe0a/packages/svelte-parse/src/main.ts#L1188-L1207) and the [`parse_siblings`](https://github.com/pngwn/MDsveX/blob/9dcb6cb3d4dcb1aa17d2687925209a955b7cbe0a/packages/svelte-parse/src/main.ts#L1144-L1183) function it uses internally..

### `Point`

The `Point` interface looks like this:

```ts
interface Point {
	line: number;
	column: number;
	offset: number;
}
```

The `line` field is a 1-indexed number and should be the current line number in the document.

The `column` field is a 1-indexed number and is the current column number in the document.

The `offset` field is a 0-indexed number and is the current character offset in the document.
