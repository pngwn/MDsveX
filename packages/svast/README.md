# svast

**Sv**elte **A**bstract **S**yntax **T**ree

This AST implements the [Unist](https://github.com/syntax-tree/unist) spec. I think. All node types that implement a unique interface are camelCased and prefixed with `svelte`. I have inlined the unist nodes that `svast` extends for reference but the canonical documentation in the unist repo should be prefered.

This AST seeks to be language agnostic and has no opinion on the contents of any expression. Some Svelte syntax is impossible to parse in a language agnostic way, this specification does not conern itself with this problem right now.

- [Base Unist Nodes](#base-unist-nodes)
  - [`UnistNode`](#unistnode)
  - [`UnistPosition`](#unistposition)
  - [`UnistPoint`](#unistpoint)
  - [`UnistData`](#unistdata)
  - [`Unistparent`](#unistparent)
- [SVAST Nodes](#svast-nodes)
  - [`Parent`](#parent)
  - [`Literal`](#literal)
  - [`Root`](#root)
  - [`Element`](#element)
  - [`Component`](#component)
  - [`BaseProperty`](#baseproperty)
  - [`Property`](#property)
  - [`Directive`](#directive)
  - [`Comment`](#comment)
  - [`Text`](#text)
  - [`VoidBlock`](#voidblock)
  - [`BranchingBlock`](#branchingblock)
  - [`EachBlock`](#eachblock)
  - [`IfBlock`](#ifblock)
  - [`AwaitBlock`](#awaitblock)
  - [`Branch`](#branch)
  - [`IfBranches`](#ifbranches)
  - [`AwaitBranches`](#awaitbranches)

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
  children: [
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
  ]
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

### `BaseTag`

```idl
interface BaseTag <: Parent {
  tagName: string
  properties: [Property | Directive]
  selfClosing: boolean
}
```

The `BaseTag` node is the node that all element and component types extend.

The `tagName` field contains the element's local name.

The `properties` field is a list of the element's attributes and directives. This field is a list of nodes that implement the `Property` or `Directive` interfaces.

The `selfClosing` field describes whether or not the source element was self closing or not. This isn't strictly abstract but is helpful in certain cases.

### `SvelteTag`

```idl
interface SvelteTag <: BaseTag {
  type: "svelteTag"
}
```

The `SvelteTag` represent special `svelte` namespace tag names such as `<svelte:self />`.

The following input:

```svelte
<svelte:self this={Component} />
```

Yields:

```js
{
  type: 'svelteTag',
  tagName: 'self',
  properties: [{
    type: 'svelteProperty',
    name: 'this',
    modifiers: [],
    value: [{
      type: 'svelteExpression',
      value: 'Component'
    }]
  }],
  selfClosing: true,
  children: []
}
```

### `Element`

```idl
interface Element <: BaseTag {
  type: "svelteElement"
}
```

The `Element` node represents a DOM-element in Svelte.

The following input:

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
interface Component <: BaseTag {
  type: "svelteComponent"
}
```

The `Component` interface represents Svelte components, PascalCased tags.

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

### `BaseProperty`

```idl
interface Property <: UnistNode {
  name: string
  shorthand: boolean
  value: [Text | Expression]
  modifiers: [Literal]
}
```

### `Property`

```idl
interface Property <: BaseProperty {
  type: 'svelteProperty'
}
```

The `Property` node represents an element's properties and reflect HTML, SVG, ARIA, XML, XMLNS, or XLink attributes.

The `name` field contains the exact name of the attribute or property as it is in the source. kebal-case names or not modified.

The `shorthand` field signifies whether or not shorthand property syntax was used (a bare `{value}`).

The `value` field is always a list of nodes that implement either the `Text` or `Expression` interfaces. In the case of shorthand property expressions, the `value` field will be a list with one node (an `Expression`) whose value is the same as the attribute name.

The `modifiers` field represents any modifiers applied to a property name. In Svelte this takes the form of `on:click|once|capture={...}`. This value should be a list of Literal nodes, describing the modifier name.

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
    shorthand: false,
    modifiers: [],
  }],
  selfClosing: true,
  children: []
}
```

### `Directive`

```idl
interface Directive <: BaseProperty {
  type: 'svelteDirective'
  specifier: string
}
```

The `Directive` node represents a Svelte directive `x:y={z}`.

The `name` field reprsents the directive 'type', the part of the attrubute _before_ the `:`.

The `specificer` field describes the local implementation of that directive type. It is the part of the attribute name _after_ the `:` but before the `=` or a whitespace character.

In the case of `shorthand` being `true`, `value` will be a list of one `Expression` node with a value equal to the `specifier` value.

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
    shorthand: false,
    modifiers: [],
  }, {
    type: 'svelteDirective',
    name: 'on',
    specifier: 'click',
    value: [{
      type: 'svelteExpression',
      value: '(e) => fn(e)'
    }],
    shorthand: false,
    modifiers: [{
      type: 'svelteModifier',
      value: 'preventDefault'
    }],
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

The `name` field is be the name of the block.

The `expression` field is an `Expression` node containing the expression value for that block.

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
  expression: Expression
}
```

The `BrancingBlock` node represents a Svelte Block that allows a single branch, a `path`.

Standard blocks other than `each` do not extend this interface, as the standard blocks all have more complex branching structures.

The `expression` field contains the rest of the contents of the unknown branching block. The expression node itself can be empty.

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
export interface EachBlock <: SvelteParent {
  type: 'svelteEachBlock'
  expression: Expression
  itemName: Expression
  itemIndex: Expression?
  itemKey: Expression?
}
```

The `EachBlock` node represents a Svelte `#each` block.

The `expression` field is the collection that is being iterated. The value is an `Expression` node.

The `itemName` field is the identifier referring to a single element of the collection during the loop. The value is an `Expression` node.

The `itemIndex` field is the identifier used to refer to the `index` of the iterated item during the loop, if one exists.

The `itemKey` field is optional and is the value that should be used as a key for eachitem, if one exists. The presence of this field signifies that the each block is keyed.

The follwing input:

```svelte
{#each array.filter(v => v.prop) as { some, thing }, index (thing)}
  <p>{some}</p>
{/each}
```

Yields:

```js
{
  type: 'svelteEachBlock',
  itemName: {
    type: 'svelteExpression',
    value: '{ some, thing }'
  },
  itemIndex: {
    type: 'svelteExpression',
    value: 'index'
  },
  itemKey: {
    type: 'svelteExpression',
    value: 'thing'
  },
  children: [{
    type: 'svelteElement',
    tagName: 'p',
    properties: [],
    selfClosing: false,
    children: [{
      type: 'svelteExpression',
      value: 'some'
    }]
  }]
}
```

### `IfBlock`

```idl
interface IfBlock <: Node {
  type: 'svelteIfBlock'
  name: 'if'
  branches: IfBranches
}
```

The `IfBlock` node represents a Svelte `#if` block.

The `branches` field implements the `IfBranches` interface and specifies the various branches of the `if` block.

The follwing input:

```svelte
{#if condition}
  hi
{:else if condition2}
  {boo}
{else}
  <p>bootoo</p>
{/if}
```

Yields:

```js
{
  type: 'svelteIfBlock',
  name: 'if',
  branches: {
    if: {
      type: 'svelteBranch',
      name: 'if',
      expression: {
        type: 'svelteExpression',
        value: 'condition'
      },
      children: [{
        type: 'text',
        value: 'condition'
      }]
    },
    elseif: {
      type: 'svelteBranch',
      name: 'elseif',
      expression: {
        type: 'svelteExpression',
        value: 'condition2'
      },
      children: [{
        type: 'svelteExpression',
        value: 'boo'
      }]
    },
    else: {
      type: 'svelteBranch',
      name: 'if',
      expression: {
        type: 'svelteExpression',
        value: ''
      },
      children: [{
        type: 'svelteElement',
        tagName: 'p',
        properties: [],
        selfClosing: false,
        children: [{
          type: 'text',
          value: 'bootoo'
        }]
      }
    }
  }
}
```

### `AwaitBlock`

```idl
interface AwaitBlock <: Node {
  type: 'svelteAwaitBlock'
  branches: AwaitBranches
}
```

the `AwaitBlock` node represents a Svelte `#await` block.

The `branches` field implements the `AwaitBranch` interface and specifies the various branches of the `await` block.

The following input:

```svelte
{#await promise then value}
  {value}
{:catch error}
  <p>it errored</p>
{/await}
```

Yields:

```js
{
  type: 'svelteIfBlock',
  name: 'if',
  branches: {
    pending: {
      type: 'svelteBranch',
      name: 'pending',
      expression: {
        type: 'svelteExpression',
        value: 'promise'
      },
      children: []
    },
    fulfilled: {
      type: 'svelteBranch',
      name: 'fulfilled',
      expression: {
        type: 'svelteExpression',
        value: 'value'
      },
      children: [{
        type: 'svelteExpression',
        value: 'value'
      }]
    },
    error: {
      type: 'svelteBranch',
      name: 'error',
      expression: {
        type: 'svelteExpression',
        value: 'error'
      },
      children: [{
        type: 'svelteElement',
        tagName: 'p',
        properties: [],
        selfClosing: false,
        children: [{
          type: 'text',
          value: 'It errored'
        }]
      }
    }
  }
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

The `Branch` node describes a branch of a Svelte block.

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

The end.
