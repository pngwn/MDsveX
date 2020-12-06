import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { SvelteElement, SvelteComponent, Root, Node, Point } from 'svast';

import { parseNode, parse } from '../src/main';

import { Result } from '../src/types_and_things';

const childParser: () => [Node[], Point & { index?: number }, number] = () => [
	[<Node>{ type: 'fake' }],
	{ line: 1, column: 1, offset: 0, index: 0 },
	0,
];

const siblings = suite<{ parseNode_1: Result }>('parse-siblings');

siblings.before((ctx) => {
	ctx.parseNode_1 = parseNode({
		generatePositions: false,
		childParser,
		value:
			'<input hello:world|modifierval|modifierval2=someval /><input2 hello2:world2|modifierval2|modifierval3=someval2 />',
	}) as Result;
});

siblings(
	'parseNode partially parses sibling nodes returning the first parsed node',
	({ parseNode_1: { parsed } }) => {
		assert.equal(parsed, <SvelteElement>{
			type: 'svelteElement',
			tagName: 'input',
			selfClosing: true,
			children: [],
			properties: [
				{
					type: 'svelteDirective',
					name: 'hello',
					specifier: 'world',
					value: [{ type: 'text', value: 'someval' }],
					shorthand: 'none',
					modifiers: [
						{ type: 'modifier', value: 'modifierval' },
						{ type: 'modifier', value: 'modifierval2' },
					],
				},
			],
		});
	}
);

siblings(
	'parseNode partially parses sibling nodes returning the chomped string',
	({ parseNode_1: { chomped } }) => {
		assert.is(
			chomped,
			'<input hello:world|modifierval|modifierval2=someval />'
		);
	}
);

siblings(
	'parseNode partially parses sibling nodes returning the chomped string',
	({ parseNode_1: { unchomped } }) => {
		assert.is(
			unchomped,
			'<input2 hello2:world2|modifierval2|modifierval3=someval2 />'
		);
	}
);

siblings(
	'parseNode partially parses sibling nodes returning the current location in the document',
	({ parseNode_1: { position } }) => {
		assert.equal(position, {
			line: 1,
			column: 55,
			offset: 54,
			index: 54,
		});
	}
);

siblings('parseNode should continue from the position initially passed', () => {
	const { position } = parseNode({
		generatePositions: false,
		childParser,
		value: '<input2 hello2:world2|modifierval2|modifierval3=someval2 />',
		currentPosition: {
			line: 1,
			column: 55,
			offset: 54,
		},
	}) as Result;

	assert.equal(position, {
		line: 1,
		column: 114,
		offset: 113,
		index: 59,
	});
});

siblings('parse should parse sibling nodes', () => {
	const contents = parse({
		generatePositions: false,
		value:
			'<input hello:world|modifierval|modifierval2=someval /><input2 hello2:world2|modifierval2|modifierval3=someval2 />',
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello',
						specifier: 'world',
						value: [{ type: 'text', value: 'someval' }],
						shorthand: 'none',
						modifiers: [
							{ type: 'modifier', value: 'modifierval' },
							{ type: 'modifier', value: 'modifierval2' },
						],
					},
				],
			},
			{
				type: 'svelteElement',
				tagName: 'input2',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello2',
						specifier: 'world2',
						value: [{ type: 'text', value: 'someval2' }],
						shorthand: 'none',
						modifiers: [
							{ type: 'modifier', value: 'modifierval2' },
							{ type: 'modifier', value: 'modifierval3' },
						],
					},
				],
			},
		],
	});
});

siblings('parse should parse nested self-closing elements', () => {
	const contents = parse({
		generatePositions: false,
		value: '<div><input /></div>',
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'div',
				properties: [],
				selfClosing: false,
				children: [
					{
						type: 'svelteElement',
						tagName: 'input',
						properties: [],
						selfClosing: true,
						children: [],
					},
				],
			},
		],
	});
});

siblings('parse should parse nested void elements', () => {
	const contents = parse({
		generatePositions: false,
		value: '<div><input ></div>',
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'div',
				properties: [],
				selfClosing: false,
				children: [
					{
						type: 'svelteElement',
						tagName: 'input',
						properties: [],
						selfClosing: true,
						children: [],
					},
				],
			},
		],
	});
});

siblings('parse should parse deeply nested void elements', () => {
	const contents = parse({
		generatePositions: false,
		value: '<  div><div><div><div><input></div></div></div></div>',
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'div',
				properties: [],
				selfClosing: false,
				children: [
					{
						type: 'svelteElement',
						tagName: 'div',
						properties: [],
						selfClosing: false,
						children: [
							{
								type: 'svelteElement',
								tagName: 'div',
								properties: [],
								selfClosing: false,
								children: [
									{
										type: 'svelteElement',
										tagName: 'div',
										properties: [],
										selfClosing: false,
										children: [
											{
												type: 'svelteElement',
												tagName: 'input',
												properties: [],
												selfClosing: true,
												children: [],
											},
										],
									},
								],
							},
						],
					},
				],
			},
		],
	});
});

siblings('parse should parse sibling nodes', () => {
	const contents = parse({
		generatePositions: false,
		value: '<input hello:world|modifierval|modifierval2=someval />Hail',
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'input',
				selfClosing: true,
				children: [],
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello',
						specifier: 'world',
						value: [{ type: 'text', value: 'someval' }],
						shorthand: 'none',
						modifiers: [
							{ type: 'modifier', value: 'modifierval' },
							{ type: 'modifier', value: 'modifierval2' },
						],
					},
				],
			},
			{
				type: 'text',
				value: 'Hail',
			},
		],
	});
});

siblings('parse should parse deeply nested void elements', () => {
	const contents = parse({
		generatePositions: false,
		value: '<  div><div><div><div>Hail</div></div></div></div>',
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'div',
				properties: [],
				selfClosing: false,
				children: [
					{
						type: 'svelteElement',
						tagName: 'div',
						properties: [],
						selfClosing: false,
						children: [
							{
								type: 'svelteElement',
								tagName: 'div',
								properties: [],
								selfClosing: false,
								children: [
									{
										type: 'svelteElement',
										tagName: 'div',
										properties: [],
										selfClosing: false,
										children: [
											{
												type: 'text',
												value: 'Hail',
											},
										],
									},
								],
							},
						],
					},
				],
			},
		],
	});
});

siblings('parse should parse deeply nested void elements', () => {
	const contents = parse({
		generatePositions: false,
		value:
			'<  div><div><div>hail<div>Hail</div></div></div><span>hail</span></div>',
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteElement',
				tagName: 'div',
				properties: [],
				selfClosing: false,
				children: [
					{
						type: 'svelteElement',
						tagName: 'div',
						properties: [],
						selfClosing: false,
						children: [
							{
								type: 'svelteElement',
								tagName: 'div',
								properties: [],
								selfClosing: false,
								children: [
									{
										type: 'text',
										value: 'hail',
									},
									{
										type: 'svelteElement',
										tagName: 'div',
										properties: [],
										selfClosing: false,
										children: [
											{
												type: 'text',
												value: 'Hail',
											},
										],
									},
								],
							},
						],
					},
					{
						type: 'svelteElement',
						tagName: 'span',
						properties: [],
						selfClosing: false,
						children: [
							{
								type: 'text',
								value: 'hail',
							},
						],
					},
				],
			},
		],
	});
});

siblings('parses script tags ignoring the contents', () => {
	const contents = parse({
		generatePositions: false,
		value: `<script>Hello friends</script>`,
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteScript',
				tagName: 'script',
				properties: [],
				selfClosing: false,
				children: [{ type: 'text', value: 'Hello friends' }],
			},
		],
	});
});

siblings('parses script tags with attributes ignoring the contents', () => {
	const contents = parse({
		generatePositions: false,
		value: `<script hello:world='cheese strings'>


Hello friends</script>`,
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteScript',
				tagName: 'script',
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello',
						specifier: 'world',
						value: [
							{ type: 'text', value: 'cheese' },
							{ type: 'text', value: ' ' },
							{ type: 'text', value: 'strings' },
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
				selfClosing: false,
				children: [{ type: 'text', value: '\n\n\nHello friends' }],
			},
		],
	});
});

siblings('parses style tags ignoring the contents', () => {
	const contents = parse({
		generatePositions: false,
		value: `<style hello:world='cheese strings'>


Hello friends</style>`,
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteStyle',
				tagName: 'style',
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello',
						specifier: 'world',
						value: [
							{ type: 'text', value: 'cheese' },
							{ type: 'text', value: ' ' },
							{ type: 'text', value: 'strings' },
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
				selfClosing: false,
				children: [{ type: 'text', value: '\n\n\nHello friends' }],
			},
		],
	});
});

siblings('parses style tags ignoring the contents', () => {
	const contents = parse({
		generatePositions: false,
		value: `<svelte:head hello:world='cheese strings'>
<meta description="boo" />
</svelte:head>`,
	});

	assert.equal(contents, <Root>{
		type: 'root',
		children: [
			{
				type: 'svelteMeta',
				tagName: 'head',
				properties: [
					{
						type: 'svelteDirective',
						name: 'hello',
						specifier: 'world',
						value: [
							{ type: 'text', value: 'cheese' },
							{ type: 'text', value: ' ' },
							{ type: 'text', value: 'strings' },
						],
						shorthand: 'none',
						modifiers: [],
					},
				],
				selfClosing: false,
				children: [
					{ type: 'text', value: '\n' },
					{
						type: 'svelteElement',
						tagName: 'meta',
						selfClosing: true,
						children: [],
						properties: [
							{
								type: 'svelteProperty',
								name: 'description',
								value: [{ type: 'text', value: 'boo' }],
								shorthand: 'none',
								modifiers: [],
							},
						],
					},
					{ type: 'text', value: '\n' },
				],
			},
		],
	});
});

siblings.run();
