import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { SvelteElement, SvelteComponent, Text, SvelteExpression } from 'svast';

import { parseNode } from '../src/main';

const expression = suite('parse-element');

expression('parses a simple expression', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{hello}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: 'hello',
	});
});

expression('parses nested braces', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{{{{hello}}}}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '{{{hello}}}',
	});
});

expression('parses nested braces: while ignoring quoted braces: single', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{{{{'}'}}}}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: "{{{'}'}}}",
	});
});

expression('handles escaped single-quotes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: "{{{{'}\\''}}}}",
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: "{{{'}\\''}}}",
	});
});

expression('parses nested braces: while ignoring quoted braces: double', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{{{{"}"}}}}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: `{{{"}"}}}`,
	});
});

expression('handles escaped double-quotes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: '{{{{"}\\""}}}}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '{{{"}\\""}}}',
	});
});

expression(
	'parses nested braces: while ignoring quoted braces: backtick',
	() => {
		//@ts-ignore
		const { parsed } = parseNode({
			childParser: () => [[{ type: 'fake' }], 0],
			value: '{{{{`}`}}}}',
		});

		assert.equal(parsed, <SvelteExpression>{
			type: 'svelteExpression',
			value: '{{{`}`}}}',
		});
	}
);

expression('handles escaped backticks', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: '{{{{`}\\``}}}}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '{{{`}\\``}}}',
	});
});

expression('parses nested braces: while ignoring regex', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: '{/}/gi}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '/}/gi',
	});
});

expression('parses nested braces: while ignoring regex', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: `{/\\/}/gi}`,
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: `/\\/}/gi`,
	});
});

expression('handles quoted slashes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: '{"/}/gi"}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '"/}/gi"',
	});
});

expression('ignores nested quotes', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: '{{{{`"}`}}}}',
	});

	assert.equal(parsed, <SvelteExpression>{
		type: 'svelteExpression',
		value: '{{{`"}`}}}',
	});
});

expression('parses expressions as attribute values', () => {
	//@ts-ignore
	const { parsed } = parseNode({
		childParser: () => [[{ type: 'fake' }], 0],
		value: `<input hello={value} />`,
	});

	assert.equal(parsed, <SvelteElement>{
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
						type: 'svelteExpression',
						value: 'value',
					},
				],
				shorthand: 'none',
				modifiers: [],
			},
		],
	});
});

expression.run();
