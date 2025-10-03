import { bench, describe } from 'vitest';

class MonomorphicParser {
	parseString(input) {
		return input.length;
	}
	parseNumber(input) {
		return parseFloat(input);
	}
	parseBoolean(input) {
		return input === 'true';
	}
}

class PolymorphicParser {
	parse(input, type) {
		switch (type) {
			case 'string':
				return input.length;
			case 'number':
				return parseFloat(input);
			case 'boolean':
				return input === 'true';
			default:
				return null;
		}
	}
}

const monomorphic = new MonomorphicParser();
const polymorphic = new PolymorphicParser();
const workload = Array.from({ length: 1000 }, (_, i) => [
	`test${i}`,
	i.toString(),
	(i % 2 === 0).toString(),
]);

describe('Monomorphic vs Polymorphic Call Sites', () => {
	bench('Monomorphic calls', () => {
		for (const [str, num, bool] of workload) {
			monomorphic.parseString(str);
			monomorphic.parseNumber(num);
			monomorphic.parseBoolean(bool);
		}
	});

	bench('Polymorphic dispatch', () => {
		for (const [str, num, bool] of workload) {
			polymorphic.parse(str, 'string');
			polymorphic.parse(num, 'number');
			polymorphic.parse(bool, 'boolean');
		}
	});
});
