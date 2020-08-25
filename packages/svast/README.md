# svast

_svelte AST_

This AST implements the Unist spec. Or tries to.

## Nodes

### `Parent`

```idl
interface Parent <: UnistParent {
	children: [Element | Component | Comment | Text | Expression | Block]
}
```

A `Parent` is a node with children which is a list of nodes.

### `Literal`

```idl
interface Literal <: UnistLiteral {
	value: string
}
```

### `Root`

```idl
interface Root <: Parent {
	type: "root"
}
```

### `Element`

```idl
interface Element <: Parent {
	type: "element"
	tagName: string
	properties: [Property | Directive]
	content: Root?
	children: [Element | Comment | Text]
}
```

### `Component`

```idl
interface Component <: Element {
	type: "component"
}
```

### `Property`

```idl
interface Property <: UnistNode {
	type: 'property',
	name: string,
	value: [Text | Expression]
}
```

### `Directive`

```idl
interface Directive <: Property {
	type: 'directive',
	specifier: string
}
```

### `Comment`

```idl
interface Comment <: Literal {
	type: "comment"
}
```

### Text

```idl
interface Text <: Literal {
	type: "text"
}
```
