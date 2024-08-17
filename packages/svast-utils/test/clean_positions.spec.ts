import { test, expect } from 'vitest';

import { Node } from 'svast';
import { clean_positions } from '../src/clean_positions';
import { table_with_positions } from './fixtures/table_with_positions';
import { table_without_positions } from './fixtures/table_without_positions';

test('removes the position property from a simple node', () => {
	const node = {
		type: 'hi',
		position: {
			start: { line: 1, column: 1, offset: 1 },
			end: { line: 1, column: 1, offset: 1 },
		},
	};

	expect(clean_positions(node)).toEqual({ type: 'hi' });
});

test('removes the position property from a node and all children nodes', () => {
	const node = {
		type: 'hi',
		position: {
			start: { line: 1, column: 1, offset: 1 },
			end: { line: 1, column: 1, offset: 1 },
		},
		children: [
			{
				type: 'hi',
				position: {
					start: { line: 1, column: 1, offset: 1 },
					end: { line: 1, column: 1, offset: 1 },
				},
			},
			{
				type: 'hi',
				position: {
					start: { line: 1, column: 1, offset: 1 },
					end: { line: 1, column: 1, offset: 1 },
				},
			},
		],
	};

	expect(clean_positions(node)).toEqual({
		type: 'hi',
		children: [
			{
				type: 'hi',
			},
			{
				type: 'hi',
			},
		],
	});
});

test('removes the position property from a node and all property nodes', () => {
	const node = {
		type: 'hi',
		position: {
			start: { line: 1, column: 1, offset: 1 },
			end: { line: 1, column: 1, offset: 1 },
		},
		properties: [
			{
				type: 'hi',
				position: {
					start: { line: 1, column: 1, offset: 1 },
					end: { line: 1, column: 1, offset: 1 },
				},
			},
			{
				type: 'hi',
				position: {
					start: { line: 1, column: 1, offset: 1 },
					end: { line: 1, column: 1, offset: 1 },
				},
			},
		],
	};

	expect(clean_positions(node)).toEqual({
		type: 'hi',
		properties: [
			{
				type: 'hi',
			},
			{
				type: 'hi',
			},
		],
	});
});

test('removes the position property from a node and all value nodes', () => {
	const node = {
		type: 'hi',
		position: {
			start: { line: 1, column: 1, offset: 1 },
			end: { line: 1, column: 1, offset: 1 },
		},
		value: [
			{
				type: 'hi',
				position: {
					start: { line: 1, column: 1, offset: 1 },
					end: { line: 1, column: 1, offset: 1 },
				},
			},
			{
				type: 'hi',
				position: {
					start: { line: 1, column: 1, offset: 1 },
					end: { line: 1, column: 1, offset: 1 },
				},
			},
		],
	};

	expect(clean_positions(node)).toEqual({
		type: 'hi',
		value: [
			{
				type: 'hi',
			},
			{
				type: 'hi',
			},
		],
	});
});

test('does not fail if value is not an array of node', () => {
	const node = {
		type: 'hi',
		position: {
			start: { line: 1, column: 1, offset: 1 },
			end: { line: 1, column: 1, offset: 1 },
		},
		value: 'hi',
	};

	expect(clean_positions(node)).toEqual({
		type: 'hi',
		value: 'hi',
	});
});

test('removes the position property from a node and all modifier nodes', () => {
	const node = {
		type: 'hi',
		position: {
			start: { line: 1, column: 1, offset: 1 },
			end: { line: 1, column: 1, offset: 1 },
		},
		modifiers: [
			{
				type: 'hi',
				position: {
					start: { line: 1, column: 1, offset: 1 },
					end: { line: 1, column: 1, offset: 1 },
				},
			},
			{
				type: 'hi',
				position: {
					start: { line: 1, column: 1, offset: 1 },
					end: { line: 1, column: 1, offset: 1 },
				},
			},
		],
	};

	expect(clean_positions(node)).toEqual({
		type: 'hi',
		modifiers: [
			{
				type: 'hi',
			},
			{
				type: 'hi',
			},
		],
	});
});

test('removes the position property from a node and all branch nodes', () => {
	const node = {
		type: 'hi',
		position: {
			start: { line: 1, column: 1, offset: 1 },
			end: { line: 1, column: 1, offset: 1 },
		},
		branches: [
			{
				type: 'hi',
				position: {
					start: { line: 1, column: 1, offset: 1 },
					end: { line: 1, column: 1, offset: 1 },
				},
			},
			{
				type: 'hi',
				position: {
					start: { line: 1, column: 1, offset: 1 },
					end: { line: 1, column: 1, offset: 1 },
				},
			},
		],
	};

	expect(clean_positions(node)).toEqual({
		type: 'hi',
		branches: [
			{
				type: 'hi',
			},
			{
				type: 'hi',
			},
		],
	});
});

test('removes the position property from a node and all branch nodes', () => {
	const node = {
		type: 'hi',
		position: {
			start: { line: 1, column: 1, offset: 1 },
			end: { line: 1, column: 1, offset: 1 },
		},
		expression: {
			type: 'hi',
			position: {
				start: { line: 1, column: 1, offset: 1 },
				end: { line: 1, column: 1, offset: 1 },
			},
		},
	};

	expect(clean_positions(node)).toEqual({
		type: 'hi',
		expression: {
			type: 'hi',
		},
	});
});

test('removes the position properties from a complex node', () => {
	expect(clean_positions(table_with_positions)).toEqual(
		table_without_positions
	);
});
