import { Node, Position, Point, Parent, Data, Literal } from 'unist';
export { Node, Position, Point, Parent, Data, Literal };

// TODO: script and style tags don't have nodes yet

export interface SvelteParent extends Parent {
	children: (
		| SvelteElement
		| SvelteComponent
		| Comment
		| Text
		| SvelteExpression
		| VoidBlock
		| BranchingBlock
		| EachBlock
		| SvelteTag
	)[];
}

export interface Root extends Parent {
	type: 'root';
}

export interface BaseSvelteTag extends SvelteParent {
	tagName: string;
	properties: (Property | Directive)[];
	selfClosing: boolean;
}

export interface SvelteTag extends BaseSvelteTag {
	type: 'svelteTag';
}

export interface SvelteElement extends BaseSvelteTag {
	type: 'svelteElement';
}

export interface SvelteComponent extends BaseSvelteTag {
	type: 'svelteComponent';
}

export interface BaseProperty extends Node {
	name: string;
	shorthand: 'none' | 'boolean' | 'expression';
	value: (Text | SvelteExpression)[];
	modifiers: Literal[];
}

export interface Property extends BaseProperty {
	type: 'svelteProperty';
}

export interface Directive extends BaseProperty {
	type: 'svelteDirective';
	specifier: string;
}

export interface Comment extends Literal {
	type: 'comment';
}

export interface Text extends Literal {
	type: 'text';
}

export interface SvelteExpression extends Literal {
	type: 'svelteExpression';
	value: string;
}

export interface VoidBlock extends Node {
	type: 'svelteVoidBlock';
	name: string;
	expression: SvelteExpression;
}

export interface BranchingBlock extends Node {
	type: 'svelteBranchingBlock';
	name: 'string';
	branches: Branch[];
}

export interface EachBlock extends SvelteParent {
	type: 'svelteEachBlock';
	itemName: SvelteExpression;
	itemIndex?: SvelteExpression;
	itemKey?: SvelteExpression;
}

export interface Branch extends Parent {
	type: 'svelteBranch';
	name: string;
	expression: SvelteExpression;
}
