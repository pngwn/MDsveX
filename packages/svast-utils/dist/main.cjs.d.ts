import { Node } from 'svast';

declare function clean_positions(node: Node): Node;

declare type WalkCallback = (node: Node, parent: Node | undefined) => boolean | void;
declare function walk(node: Node, cb: WalkCallback, parent?: Node): Node;

export { clean_positions as cleanPositions, walk };
