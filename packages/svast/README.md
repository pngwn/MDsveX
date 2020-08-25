# svast

**Sv**elte **A**bstract **S**yntax **T**ree

This AST implements the [Unist](https://github.com/syntax-tree/unist) spec. I think. All node types that implement a unique interface are camelCased and prefixed with `svelte`. I have inlined the unist nodes that `svast` extends for reference but the canonical documentation in the unist repo should be prefered.

This AST seeks to be language agnostic and has no opinion on the contents of any expression. Some Svelte syntax is impossible to parse in a language agnostic way, this specification does not conern itself with this problem right now.

## Base Unist Nodes

I have prefixed these with `Unist` for clarity. See [the actual spec](https://github.com/syntax-tree/unist)

### `UnistNode`

```idl
interface UnistNode {
  type: string
  data: UnistData?
  position: UnistPosition?
}
```

This is the base node that pretty much everything extends.

### `UnistPosition`

```idl
interface UnistPosition {
  start: UnistPoint
  end: UnistPoint
  indent: [number >= 1]?
}
```

The `UnistPosition` node represents the location of a node in the source file.

The `start` field represents the first character of the parsed source for that node.

The `end` position represents the last character of the parsed source for that node.

I do not understand what `indent` is right now.

### `UnistPoint`

```id
interface UnistPoint {
  line: number >= 1
  column: number >= 1
  offset: number >= 0?
}
```

The `UnistPoint` node represents one place in a source file.

The `line` field (1-indexed integer) represents a line in a source file.

The `column` field (1-indexed integer) represents a column in a source file.

The `offset` field (0-indexed integer) represents a character in a source file.

### `UnistData`

```idl
interface UnistData { }
```

The `UnistData` node represents information associated by the ecosystem with the node.

This space is guaranteed to never be specified by unist or specifications implementing unist.

### `UnistParent`

```idl
interface UnistParent <: UnistNode {
  children: [UnistNode]
}
```

Nodes containing other nodes (said to be children) extend the abstract interface `UnistParent` (Node).

The `children` field is a list representing the children of a node.

## SVAST Nodes

### `Parent`

```idl
interface Parent <: UnistParent {
  children: [Element | Component | Comment | Text | Expression | Block | SvelteTag]
}
```

A `Parent` is a node with children which is a list of nodes.

### `Literal`

```idl
interface Literal <: UnistLiteral {
  value: string
}
```

A node containing a value. It is that simple.

### `Root`

```idl
interface Root <: Parent {
  type: "root"
}
```

The root node of a tree.

### `Element`

```idl
interface Element <: Parent {
  type: "svelteElement"
  tagName: string
  properties: [Property | Directive]
  selfClosing: boolean
  children: [Element | Comment | Text | Expression | Block | Special]
}
```

Represents a DOM-element.

The `tagName` field must always be present and represents the element's local name.

The `properties` field must always be present, even if empty, and is a list of the element's attributes and directives. This field is a list of nodes that implement the `Property` or `Directive` interfaces.

The `selfClosing` field must be present and describes whether or not the source element was self closing or not. This isn't strictly abstract but is helpful in certain cases.

This input:

```svelte
<input on:click|preventDefault={handleClick} />
```

Yields:

```js
{
  type: 'svelteElement',
  tagName: 'input',
  properties: [{
    type: 'svelteDirective',
    name: 'on',
    specifier: 'click',
    modifiers: [{
      type: 'modifier', value: 'preventDefault'
    }],
    value: [{
      type: 'svelteExpression',
      value: 'handleClick'
    }]
  }],
  selfClosing: true,
  children: []
}
```

### `Component`

```idl
interface Component <: Element {
  type: "svelteComponent"
}
```

This input:

```svelte
<MyComponent on:click|preventDefault={handleClick} />
```

Yields:

```js
{
  type: 'svelteElement',
  tagName: 'MyComponent',
  properties: [{
    type: 'svelteDirective',
    name: 'on',
    specifier: 'click',
    modifiers: [{
      type: 'svelteModifier', value: 'preventDefault'
    }],
    value: [{
      type: 'svelteExpression',
      value: 'handleClick'
    }]
  }],
  selfClosing: true,
  children: []
}
```

The `Component` interface extends the `Element` interface but with a different value for `type` in order to distinguish these nodes.

### `Property`

```idl
interface Property <: UnistNode {
  type: 'svelteProperty'
  name: string
  shorthandExpression: boolean
  value: [Text | Expression]
  modifiers: [Literal]
}
```

The `Property` node represents an elements properties and reflect HTML, SVG, ARIA, XML, XMLNS, or XLink attributes.

The `name` field must be present and represents the exact name of the attribute or property as it is in the source. kebal-case names or not modified.

The `shorthandExpression` field must be present and signifies whether or not shorthand property syntax was used (a bare `{value}`).

The `value` field must be present and is always a list of nodes that implement either the `Text` or `Expression` interfaces. In the case of shorthand property expressions, the `value` field will be a list with one node (an `Expression`) whose value is the same as the attribute name.

The `modifiers` field must be present, even if it is empty, and represents any modifiers applied to a property name. In svelte this takes the form of `on:click|once|capture={...}`. This value should be a list of Literal nodes, describing the modifier name.

This input:

```svelte
<a name="hello {friend}!" />
```

Yields:

```js
{
  type: 'svelteElement',
  tagName: 'a',
  properties: [{
    type: 'svelteProperty',
    name: 'name',
    value: [{
      type: 'text',
      value: 'hello'
    }, {
      type: 'svelteExpression',
      value: 'friend'
    }, {
      type: 'text',
      value: '!'
    }],
    modifiers: [],
  }],
  selfClosing: true,
  children: []
}
```

### `Directive`

```idl
interface Directive <: Property {
  type: 'svelteDirective'
  specifier: string
}
```

The `Directive` node represents a svelte directive `x:y={z}`, it is the same as the `Property` interface with a few small differences.

The `name` field must be present, as with `Property`, but here represnts the directives 'type' the part of the attrubute _before_ the `:`.

The `specificer` must be present and is the describers the part of the attribute name _after_ the `:` but before the `=` or a whitespace character. In Svelte, this value specificies the local implementation of that directive type.

In the case of `shorthandExpression` being `true`, `value` will be a list of one `Expression` node with a value equal to the `specifier` value.

Everything else is the same as `Property`.

The following input:

```svelte
<a class:myclass={x ? y : z} on:click|preventDefault={(e) => fn(e)} />
```

Yields:

```js
{
  type: 'svelteElement',
  tagName: 'a',
  properties: [{
    type: 'svelteDirective',
    name: 'class',
    specifier: 'myclass',
    value: [{
      type: 'svelteExpression',
      value: 'x ? y : z'
    }],
    modifiers: [],
  }, {
    type: 'svelteDirective',
    name: 'on',
    specifier: 'click',
    value: [{
      type: 'svelteExpression',
      value: '(e) => fn(e)'
    }],
    modifiers: [{
      type: 'svelteModifier',
      value: 'preventDefault'}
    ],
  }],
  selfClosing: true,
  children: []
}
```

### `Comment`

```idl
interface Comment <: Literal {
  type: "comment"
}
```

Represents an HTML comment.

The `value` field should contain the contents of the comment.

This comment:

```svelte
<!--Some thing here-->
```

Yields:

```js
{type: 'comment', value: 'Some thing here'}
```

### Text

```idl
interface Text <: Literal {
  type: "text"
}
```

Represents bare text.

The `value` field should contain the text.

The following input:

```svelte
<div>Hello there</div>
```

Yields:

```js
{
  type: 'svelteElement',
  tagName: 'div',
  properties: [],
  selfClosing: false,
  children: [{
    type: 'text',
    value: 'Hello there'
  }]
}
```

### `VoidBlock`

```
interface VoidBlock <: Node {
  type: 'svelteVoidBlock'
  name: string
  expression: Expression
}
```

The `VoidBlock` node represents a void block. Void blocks do not allow branches.

The `name` field must be present and should be the name of the block.

The `expression` field must be present and should be an `Expression` node containing the expression value for that block.

For the following input:

```svelte
{@html `<p>something</p>`}
```

Yields:

```js
{
  type: 'svelteVoidBlock',
  name: 'html',
  expression: {
    type: 'svelteExpression',
    value: '<p>something</p>'
  }
}
```

### `BranchingBlock`

```
interface BranchingBlock <: Parent {
  type: 'svelteBranchingBlock'
}
```

The `BrancingBlock` node represents a svelte Block that allows a single branch, a `path`.

Standard blocks other than `each` extend this interface, as the standard blocks all have import, specific semantic information that relates only to them.

The `expression` field must be present and should contain the rest of the contents of the unknown branching block. The expression node itself can be empty.

The following input:

```svelte
{#custom someExpression}
  Hello
{/custom}
```

Yields:

```js
{
  type: 'svelteBranchingBlock',
  name: 'custom',
  children: [
    { type: 'text', value: 'Hello' }
  ]
}
```

_Parser relevant: Branches are distinguished by nested `{:branchname}` qualifiers that meet a certain contract defined by the grammar. Unknown (non-standard) blocks are tolerated, unknown branches are not._

### `EachBlock`

```idl
interface EachBlock <: BranchingBlock {
  type: 'svelteEachBlock'
  name: 'each'
  itemName: Expression
  itemIndex: Expression?
  itemKey: Expression?
}
```

The `EachBlock` node represents a svelte `#each` block.

The `expression` field contains the collection that is being iterated. The value is an `Expression` node.

The `itemName` field contains the identifier referring to a single element of the collection, during the loop. The value is an `Expression` node.

The `itemIndex` field contains the identifier used to refer to the `index` of the iterated item during the loop, if one exists.

The `itemKey` field is optional and contains the value that should be used as a key during the loop, if one exists. The presence of this field signifies that the each block is keyed.

### `IfBlock`

```idl
interface IfBlock <: Node {
  type: 'svelteIfBlock'
  branches: IfBranches
}
```

The `IfBlock` node represents a svelte `#if` block.

The `branches` field implements the `IfBranch` interface and specifies the various branches of the `if` block.

### `AwaitBlock`

```idl
interface IfBlock <: Node {
  type: 'svelteIfBlock'
  branches: AwaitBranches
}
```

### `Branch`

```idl
interface Branch <: Parent {
  type: 'svelteBranch'
  name: string
  expression: Expression
}
```

The `Branch` node describes a branch of a svelte block.

The `expression` fields contains the expression associated with that branch.

### `IfBranches`

```idl
interface IfBranches {
  if: Branch
  elseif: [Branch]?
  else: Branch?
}
```

The `IfBranch` node represents the possible branches of an `IfBlock`.

The `if` field contains the first `if` branch of the block. The value is a single `Branch`.

The `elseif` field contains a list of branches representing an arbitrary number of `:if else` clauses.

The `else` field contains the final `:else` clause of an `#if` block. It contains a single `Branch`.

### `AwaitBranches`

```idl
interface AwaitBranches {
  pending: Branch
  fulfilled: Branch
  error: Branch?
}
```

The `IfBranch` node represents the possible branches of an `IfBlock`.

The `pending` field represents the first branch of the block representing the pending state. The value is a single `Branch`.

The `fulfilled` field respresents the resolved branch of the block. The value is a single branch.

The `error` field respresents the optional error clause of an `#await` block. It contains a single `Branch`.
