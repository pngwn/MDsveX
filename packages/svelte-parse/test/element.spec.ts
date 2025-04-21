import { test, expect } from 'vitest';

import {
	SvelteElement,
	SvelteComponent,
	Text,
	SvelteMeta,
	Comment,
	Node,
	Point,
} from 'svast';

import { parseNode, parse } from '../src/main';
import { void_els } from '../src/void_els';

const childParser: () => [Node[], Point & { index?: number }, number] = () => [
	[<Node>{ type: 'fake' }],
	{ line: 1, column: 1, offset: 0, index: 0 },
	0,
];

test('parses a self closing tag without attributes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [],
	});
});

test('parses self closing elements with no whistespace after tagName', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<div/>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'div',
		selfClosing: true,
		children: [],
		properties: [],
	});
});

test('parses a self closing tag without attributes: space before name', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<       input />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [],
	});
});

test('parses a self closing tag without attributes: space after name', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<       input       />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [],
	});
});

test('parses a self closing tag without attributes: space after closeing slash', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<       input       /                >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [],
	});
});

test('parses a self closing component without attributes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<HelloFriend />`,
	});

	expect(parsed).toEqual(<SvelteComponent>{
		type: 'svelteComponent',
		tagName: 'HelloFriend',
		selfClosing: true,
		children: [],
		properties: [],
	});
});

Object.keys(void_els).forEach((el) => {
	test(`parses all void tags without attributes: < ${el} >`, () => {
		//@ts-ignore
		const { parsed } = parseNode({
			generatePositions: false,
			childParser,
			value: `<${el} >`,
		});

		expect(parsed).toEqual(<SvelteElement>{
			type: 'svelteElement',
			tagName: el,
			selfClosing: true,
			children: [],
			properties: [],
		});
	});
});

test('parses attribute values containing colons', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<a href=https://www.google.com />`,
	});

	expect(parsed).toEqual({
		type: 'svelteElement',
		tagName: 'a',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'href',
				value: [
					{
						type: 'text',
						value: 'https://www.google.com',
					},
				],
				modifiers: [],
				shorthand: 'none',
			},
		],
	});
});

test('parses a self closing tag with shorthand boolean attribute', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

test('parses a self closing tag with shorthand boolean attribute: weird spacing', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input         hello         /        >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

test('parses a self closing tag with shorthand boolean attribute: no trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello/>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with shorthand boolean attribute: no trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with multiple shorthand boolean attributes: trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello goodbye />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
			{
				type: 'svelteProperty',
				name: 'goodbye',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with multiple shorthand boolean attributes: weird spacing', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<         input         hello           goodbye       /           >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
			{
				type: 'svelteProperty',
				name: 'goodbye',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with multiple shorthand boolean attributes: no trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello goodbye/>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
			{
				type: 'svelteProperty',
				name: 'goodbye',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with multiple shorthand boolean attributes: no trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello goodbye>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
			{
				type: 'svelteProperty',
				name: 'goodbye',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with multiple shorthand boolean attributes: trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello goodbye >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
			{
				type: 'svelteProperty',
				name: 'goodbye',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with an unquoted attribute: trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello=value />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with an unquoted attribute: no trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello=value/>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with an unquoted attribute: trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello=value >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with an unquoted attribute: no trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello=value>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with a double-quoted attribute: trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello="value" />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with a double-quoted attribute: no trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello="value"/>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with a double-quoted attribute: trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello="value" >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with a double-quoted attribute: no trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello="value">`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with double-quoted attributes: many values, trailing whitespace', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello="value valuetwo" />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
					{
						type: 'text',
						value: ' ',
					},
					{
						type: 'text',
						value: 'valuetwo',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with double-quoted attributes: many values, no trailing whitespace', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello="value valuetwo"/>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
					{ type: 'text', value: ' ' },
					{
						type: 'text',
						value: 'valuetwo',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with double-quoted attributes: many values, trailing whitespace', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello="value valuetwo" >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
					{ type: 'text', value: ' ' },
					{
						type: 'text',
						value: 'valuetwo',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with double-quoted attributes: many values, no trailing whitespace', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello="value valuetwo">`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
					{ type: 'text', value: ' ' },
					{
						type: 'text',
						value: 'valuetwo',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with a single-quoted attribute: trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello='value' />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with a single-quoted attribute: no trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello='value'/>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with a single-quoted attribute: trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello='value' >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with a single-quoted attribute: no trailing space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello='value'>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with single-quoted attributes: many values, trailing whitespace', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello='value valuetwo' />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
					{ type: 'text', value: ' ' },
					{
						type: 'text',
						value: 'valuetwo',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with single-quoted attributes: many values, no trailing whitespace', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello='value valuetwo'/>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
					{ type: 'text', value: ' ' },
					{
						type: 'text',
						value: 'valuetwo',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with single-quoted attributes: many values, trailing whitespace', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello='value valuetwo' >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
					{ type: 'text', value: ' ' },
					{
						type: 'text',
						value: 'valuetwo',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with single-quoted attributes: many values, no trailing whitespace', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello='value valuetwo'>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [
					{
						type: 'text',
						value: 'value',
					},
					{ type: 'text', value: ' ' },
					{
						type: 'text',
						value: 'valuetwo',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a void tag with a directive', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteDirective',
				name: 'hello',
				specifier: 'world',
				value: [],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with a directive', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteDirective',
				name: 'hello',
				specifier: 'world',
				value: [],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a self-closing tag with two directives', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world goodbye:friends />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteDirective',
				name: 'hello',
				specifier: 'world',
				value: [],
				shorthand: 'none',
				modifiers: [],
			},
			{
				type: 'svelteDirective',
				name: 'goodbye',
				specifier: 'friends',
				value: [],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a tag with a directive an a directive value: double-quoted', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world="cheese" />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteDirective',
				name: 'hello',
				specifier: 'world',
				value: [{ type: 'text', value: 'cheese' }],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a tag with a directive an a directive value: double-quoted, two values', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world="cheese strings" />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
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
	});
});

test('parses a tag with a directive an a directive value: single-quoted, two values', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world='cheese strings' />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
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
	});
});

test('parses a tag with a directive an a directive value: single-quoted, two values, many spaces', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world='cheese      strings' />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteDirective',
				name: 'hello',
				specifier: 'world',
				value: [
					{ type: 'text', value: 'cheese' },
					{ type: 'text', value: '      ' },
					{ type: 'text', value: 'strings' },
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a tag with a directive an a directive value: unquoted', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world="cheese" />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteDirective',
				name: 'hello',
				specifier: 'world',
				value: [{ type: 'text', value: 'cheese' }],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

test('parses a tag with a directive with modifiers', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world|modifierval />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteDirective',
				name: 'hello',
				specifier: 'world',
				value: [],
				shorthand: 'none',
				modifiers: [{ type: 'modifier', value: 'modifierval' }],
			},
		],
	});
});

test('parses a tag with a directive with modifier but no value', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<a on:click|preventDefault booleanAttribute/>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'a',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteDirective',
				name: 'on',
				specifier: 'click',
				value: [],
				shorthand: 'none',
				modifiers: [{ type: 'modifier', value: 'preventDefault' }],
			},
			{
				type: 'svelteProperty',
				name: 'booleanAttribute',
				value: [],
				shorthand: 'boolean',
				modifiers: [],
			},
		],
	});
});

test('parses a tag with a directive with multiple modifiers', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world|modifierval|modifierval2 />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteDirective',
				name: 'hello',
				specifier: 'world',
				value: [],
				shorthand: 'none',
				modifiers: [
					{ type: 'modifier', value: 'modifierval' },
					{ type: 'modifier', value: 'modifierval2' },
				],
			},
		],
	});
});

test('parses a tag with a directive with modifiers', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello|modifierval />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'none',
				modifiers: [{ type: 'modifier', value: 'modifierval' }],
			},
		],
	});
});

test('parses a tag with a directive with multiple modifiers', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello|modifierval|modifierval2 />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [
			{
				type: 'svelteProperty',
				name: 'hello',
				value: [],
				shorthand: 'none',
				modifiers: [
					{ type: 'modifier', value: 'modifierval' },
					{ type: 'modifier', value: 'modifierval2' },
				],
			},
		],
	});
});

test('parses a tag with an attribute with multiple modifiers and a value', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<input hello:world|modifierval|modifierval2=someval />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
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
});

test('parses a tag with an attribute with multiple modifiers and a value: weird spacing', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<      input      hello:world|modifierval|modifierval2   =   someval    /    >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
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
});

test('parses a tag with an attribute with multiple modifiers and a value: weird spacing, double-quotes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<      input      hello:world|modifierval|modifierval2   =   "someval"    /    >`,
	});

	expect(parsed).toEqual(<SvelteElement>{
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
});

test('parses a tag with an attribute with multiple modifiers and a value: weird spacing and newlines', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<      
			input      
			
			hello:world|modifierval|modifierval2   
			=   
			"someval"    
			/    
			>`,
	});

	expect(parsed).toEqual(<SvelteElement>{
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
});

test('parses text', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `hail`,
	});

	expect(parsed).toEqual(<Text>{
		type: 'text',
		value: 'hail',
	});
});

test('parses quoted attribute expressions with space', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<button disabled="{!first || !last}" />`,
	});

	expect(parsed).toEqual(<SvelteElement>{
		type: 'svelteElement',
		tagName: 'button',
		properties: [
			{
				type: 'svelteProperty',
				name: 'disabled',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: '!first || !last',
						},
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
		selfClosing: true,
		children: [],
	});
});

test('parses svelte special elements', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<svelte:options tag={null} />`,
	});

	expect(parsed).toEqual(<SvelteMeta>{
		type: 'svelteMeta',
		tagName: 'options',
		properties: [
			{
				type: 'svelteProperty',
				name: 'tag',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'null',
						},
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
		selfClosing: true,
		children: [],
	});
});

test('parses svelte special elements', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<svelte:options tag={null} />`,
	});

	expect(parsed).toEqual(<SvelteMeta>{
		type: 'svelteMeta',
		tagName: 'options',
		properties: [
			{
				type: 'svelteProperty',
				name: 'tag',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'null',
						},
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
		selfClosing: true,
		children: [],
	});
});

test('parses html comments: no spaces', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<!--comment text-->`,
	});

	expect(parsed).toEqual(<Comment>{
		type: 'comment',
		value: 'comment text',
	});
});

test('parses html comments: spaces and newlines', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<!--


		comment text  
		
		
-->`,
	});

	expect(parsed).toEqual(<Comment>{
		type: 'comment',
		value: '\n\n\n\t\tcomment text  \n\t\t\n\t\t\n',
	});
});

//

test('parses shorthand expressions: failing test case', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		generatePositions: false,
		childParser,
		value: `<Avatar alt="{initials}" {size}></Avatar>`,
	});

	expect(parsed).toEqual({
		type: 'svelteComponent',
		tagName: 'Avatar',
		properties: [
			{
				type: 'svelteProperty',
				name: 'alt',
				modifiers: [],
				shorthand: 'none',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'initials',
						},
					},
				],
			},
			{
				type: 'svelteProperty',
				name: 'size',
				modifiers: [],
				shorthand: 'expression',
				value: [
					{
						type: 'svelteDynamicContent',
						expression: {
							type: 'svelteExpression',
							value: 'size',
						},
					},
				],
			},
		],
		children: [{ type: 'fake' }],
		selfClosing: false,
	});
});
