import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { Node } from 'svast';
import { clean_positions } from '../src/clean_positions';
import { table_with_positions } from './fixtures/table_with_positions';
import { table_without_positions } from './fixtures/table_without_positions';

const clean = suite('clean-positions');

clean('removes the position property from a simple node', () => {
	const node = {
		type: 'hi',
		position: {
			start: { line: 1, column: 1, offset: 1 },
			end: { line: 1, column: 1, offset: 1 },
		},
	};

	assert.equal(clean_positions(node), { type: 'hi' });
});

clean(
	'removes the position property from a node and all children nodes',
	() => {
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

		assert.equal(clean_positions(node), {
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
	}
);

clean(
	'removes the position property from a node and all property nodes',
	() => {
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

		assert.equal(clean_positions(node), {
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
	}
);

clean('removes the position property from a node and all value nodes', () => {
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

	assert.equal(clean_positions(node), {
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

clean('does not fail if value is not an array of node', () => {
	const node = {
		type: 'hi',
		position: {
			start: { line: 1, column: 1, offset: 1 },
			end: { line: 1, column: 1, offset: 1 },
		},
		value: 'hi',
	};

	assert.equal(clean_positions(node), {
		type: 'hi',
		value: 'hi',
	});
});

clean(
	'removes the position property from a node and all modifier nodes',
	() => {
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

		assert.equal(clean_positions(node), {
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
	}
);

clean('removes the position property from a node and all branch nodes', () => {
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

	assert.equal(clean_positions(node), {
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

clean('removes the position property from a node and all branch nodes', () => {
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

	assert.equal(clean_positions(node), {
		type: 'hi',
		expression: {
			type: 'hi',
		},
	});
});

clean('removes the position properties from a complex node', () => {
	assert.equal(clean_positions(table_with_positions), table_without_positions);
});

clean.run();
