# svast-utils

svast trees are non standard and have arrays of child nodes in strange places. These utilities are helpful when working with svast trees.

I have not thought any of this through and threw them together very quickly. I may add some actually useful utilities in the future but this is enough to be going along with.

None of these utilities are immutable operations because that shit is expensive.

---

- [Install it](#install-it)
- [Use it](#use-it)
  - [`walk`](#walk)
  - [`cleanPosition`](#cleanpositions)

## Install it

```bash
npm i svast-utils
```

## Use it

There are currently two function in this module that are exposed as named exports

### `walk`

Walks a svast tree, visiting every node. You give it a svast tree (or a svast compatible tree) and a callback function to execute for each node.

```ts
type walk = (tree: Node, cb: walkCallback) => Node;

type walkCallback = (node: Node, parent: Node | undefined) => void | boolean;
```

Pass in a svast tree to walk and a callback function to execute for every node that is visited. Walk will return the tree when it has finished walking, this is the exact tree you passed in, it is not a copy.

The callback function will be passed the current node as the first argument and the parent node as the second argument. When you are in the root node, the parent will be undefined otherwise it will always exist.

You can return `false` from the callback function. This will prevent walk from walking any childnodes. This will not halt the walk entirely: it will not prevent sibling nodes from being walked.

There is no copying and no returning of new nodes. It just walks the tree with some optional bailouts. Feel free to mutate the tree as you go but if you do stuff like changing the length a children array while it is being walked something bad might happen.

`walk` calls itself recursively, if your tree is very large then your computer will explode.

#### example

```js
import { walk } from 'svast-utils';

const tree = {
  type: 'root',
  children: [
    { type: 'hello' },
    { type: 'hello' },
    { type: 'somethingelse' , children: [ ... ]},
  ]
}

const node_names = [];

walk(tree, (node, parent) => {
  node_names.push(node.type);
  // this will prevent the children of this node from being walked
  if (node.type === 'somethingelse') return false;
})

// node_names === ['root', 'hello', 'hello', 'somethingelse']
```

### `cleanPositions`

This removes all positional data from every node in a tree. It just walks a tree and deletes them all. This may be useful if you no longer need the positional data and want a smaller tree.

You simply pass the function a tree to clean and it will return the cleaned tree. This is the exact tree you passed in, mutated. It is not a copy.

#### example

```js
import { cleanPositions } from 'svast-utils';

const tree = {
  type: 'root',
  children: [
    {
      type: 'hello',
      position: { start: { ... }, end: { ... } }
    },
    {
      type: 'hello',
      position: { start: { ... }, end: { ... } }
    },
    {
      type: 'somethingelse' ,
      children: [ ... ],
      position: { start: { ... }, end: { ... }}
    },
  ],
  position: { start: { ... }, end: { ... }}
}

const clean_tree = cleanPositions(tree);

// clean_tree === tree === {
//   type: 'root',
//   children: [
//     { type: 'hello' },
//     { type: 'hello' },
//     {
//       type: 'somethingelse' ,
//       children: [ ... ],
//     },
//   ],
// }
```
