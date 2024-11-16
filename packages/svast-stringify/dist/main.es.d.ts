import { Node, Root } from 'svast';

declare type CompileChildren = (nodes: Node[]) => string;
declare function compile_node(node: Node, compile_children: CompileChildren): string | undefined;
declare function compile(tree: Root): string;

export { compile, compile_node as compileNode };
