# svast

_svelte AST_

This AST implements the Unist spec. Or tries to.

## Nodes

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

A node containing a value.

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
	type: "element"
	tagName: string
	properties: [Property | Directive]
	selfClosing: boolean
	children: [Element | Comment | Text | Expression | Block | SvelteTag]
}
```

Represents a DOM-element.

The `tagName` field must always be present and represents the element's local name.

The `properties` field must always be present, even if empty, and is a list of the element's attributes and directives. This field is a list of nodes that implement the `Property` or `Directive` interfaces.

The `selfClosing` field must be present and describes whether or not the source element was self closing or not. This isn't strictly abstract but is helpful in certain cases.

### `Component`

```idl
interface Component <: Element {
	type: "component"
}
```

The `Component` interface extends the `Element` interface but with a sifferent value for `type` in orde to distinguish these nodes.

### `Property`

```idl
interface Property <: UnistNode {
	type: 'property'
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

### `Directive`

```idl
interface Directive <: Property {
	type: 'directive'
	specifier: string
}
```

The `Directive` node represents a svelte directive `x:y={z}`, it is the same as the `Property` interface with a few small differences.

The `name` field must be present, as with `Property`, but here represnts the directives 'type' the part of the attrubute _before_ the `:`.

The `specificer` must be present and is the describers the part of the attribute name _after_ the `:` but before the `=` or a whitespace character. In Svelte, this value specificies the local implementation of that directive type.

Everything else is the same as `Property`.

### `Comment`

```idl
interface Comment <: Literal {
	type: "comment"
}
```

Represents an HTML comment.

The `value` field should contain the contents of the comment.

### Text

```idl
interface Text <: Literal {
	type: "text"
}
```

Represents bare text.

The `value` field should contain the text.
