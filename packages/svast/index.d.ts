import { Node, Position, Point, Parent, Data, Literal } from 'unist';
export { Node, Position, Point, Parent, Data, Literal };

// TODO: script and style tags don't have nodes yet
export type SvelteChild =
	| SvelteElement
	| SvelteComponent
	| Comment
	| Text
	| SvelteExpression
	| VoidBlock
	| BranchingBlock
	| EachBlock
	| SvelteTag;

export interface SvelteParent extends Parent {
	children: SvelteChild[];
}

export interface Root extends Parent {
	type: 'root';
}

export interface BaseSvelteTag<T extends string> extends SvelteParent {
	type: T;
	tagName: string;
	properties: (Property | Directive)[];
	selfClosing: boolean;
}

export type SvelteTag = BaseSvelteTag<'svelteTag'>;

export type SvelteElement = BaseSvelteTag<'svelteElement'>;

export type SvelteComponent = BaseSvelteTag<'svelteComponent'>;

export interface BaseProperty<T extends string> extends Node {
	type: T;
	name: string;
	shorthand: 'none' | 'boolean' | 'expression';
	value: (Text | SvelteExpression)[];
	modifiers: Literal[];
}

export type Property = BaseProperty<'svelteProperty'>;

export interface Directive extends BaseProperty<'svelteDirective'> {
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
	expression: SvelteExpression;
	itemName: SvelteExpression;
	itemIndex?: SvelteExpression;
	itemKey?: SvelteExpression;
}

export interface Branch extends Parent {
	type: 'svelteBranch';
	name: string;
	expression: SvelteExpression;
}
