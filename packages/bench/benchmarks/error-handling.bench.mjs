import { bench, describe } from 'vitest';

class ParseNumberError extends Error {
	constructor(index, value) {
		super(`Invalid number at index ${index}`);
		this.name = 'ParseNumberError';
		this.index = index;
		this.value = value;
	}
}

function parseNumbersWithSentinel(numbers) {
	const results = [];
	const errorIndices = [];

	for (let i = 0; i < numbers.length; i++) {
		const parsed = Number.parseFloat(numbers[i]);
		if (Number.isNaN(parsed)) {
			errorIndices.push(i);
			continue;
		}

		results.push(parsed);
	}

	return { results, errorCount: errorIndices.length };
}

function parseNumbersWithExceptions(numbers) {
	const results = [];
	const errors = [];

	for (let i = 0; i < numbers.length; i++) {
		try {
			const parsed = parseNumberOrThrow(numbers[i], i);
			results.push(parsed);
		} catch (error) {
			errors.push(error);
		}
	}

	return { results, errorCount: errors.length };
}

function parseNumberOrThrow(raw, index) {
	const parsed = Number.parseFloat(raw);
	if (Number.isNaN(parsed)) {
		try {
			throw new ParseNumberError(index, raw);
		} catch (error) {
			// console.error(error);
		}
		// throw new ParseNumberError(index, raw);
	}
	return parsed;
}

function createInput({ size, shouldInvalidate, invalidFactory }) {
	const numbers = new Array(size);

	for (let i = 0; i < size; i++) {
		if (shouldInvalidate(i)) {
			numbers[i] = invalidFactory(i);
			continue;
		}

		numbers[i] = `${i}.${i % 10}`;
	}

	return numbers;
}

const datasetSize = 10_000;
const benchConfig = { time: 500 };

const workloads = [
	{
		label: 'Baseline (0% invalid)',
		createData: () =>
			createInput({
				size: datasetSize,
				shouldInvalidate: () => false,
				invalidFactory: () => 'never_used',
			}),
	},
	{
		label: 'Cold errors (1% invalid)',
		createData: () =>
			createInput({
				size: datasetSize,
				shouldInvalidate: (i) => i % 100 === 0,
				invalidFactory: (i) => `invalid_${i}`,
			}),
	},
	{
		label: 'Hot errors (35% invalid)',
		createData: () =>
			createInput({
				size: datasetSize,
				shouldInvalidate: (i) => i % 20 < 7,
				invalidFactory: (i) => `invalid_${i}_${'x'.repeat(i % 5)}`,
			}),
	},
];

describe('Error handling hot vs cold paths', () => {
	for (const workload of workloads) {
		describe(workload.label, () => {
			let numbers = workload.createData();

			bench(
				'collect sentinel indices',
				() => {
					parseNumbersWithSentinel(numbers);
				},
				benchConfig
			);

			bench(
				'throw and catch exceptions',
				() => {
					parseNumbersWithExceptions(numbers);
				},
				benchConfig
			);
		});
	}
});
