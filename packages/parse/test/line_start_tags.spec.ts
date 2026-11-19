import { describe, expect, test } from 'vitest';

import { broken, fed_mismatch, pick, random } from './stream_shape';

const CONTAINERS = ['', '', '', '- ', '> ', '  '];

const STARTS = [
	'<b>',
	'<b>x</b>',
	'<span>',
	'</span>',
	'<a href="u">',
	'<br>',
	'<img src="i.png">',
	'<Chart />',
	'<Chart a={b} c="d">',
	'<Tabs>',
	'</Tabs>',
	'<div>',
	'</div>',
	'<div></div>',
	'<p>a</p>',
	'<script>',
	'</script>',
	'<!-- c -->',
	'{@html x}',
	'{x}',
	'{#if a}',
	'{:else}',
	'{/if}',
	'a',
];

const PIECES = [
	' ',
	' ',
	' ',
	'\t',
	'a',
	'`',
	'\\',
	'*',
	'[',
	'](u)',
	'![a](i.png)',
	'<i>',
	'</i>',
	'</b>',
	'</span>',
	'<div>',
	'</div>',
	'<Chart />',
	'<!-- c -->',
	'{x}',
	'{@html y}',
	// what can hold a close tag as text, or a tag the line scan counts
	'<a href="u">',
	'</a>',
	'<b>',
	'<i title="</b>">',
	'<b x="<b>">',
	'<span a={x}>',
	'{"</span>"}',
];

const ENDS = ['\n', '\n', ' \n', '\n\n', '\n---\n', '\n# h\n', ''];

function lines(rand: () => number): string {
	let source = '';
	const count = 1 + Math.floor(rand() * 3);
	for (let l = 0; l < count; l++) {
		source += pick(rand, CONTAINERS) + pick(rand, STARTS);
		const pieces = Math.floor(rand() * 4);
		for (let k = 0; k < pieces; k++) source += pick(rand, PIECES);
		source += pick(rand, ENDS);
	}
	return source;
}

describe('random lines that start at a tag, a component or an expression', () => {
	test(
		'a fed parse builds the tree of a whole parse',
		{ timeout: 30000 },
		() => {
			const rand = random(1);
			const differ: string[] = [];
			for (let i = 0; i < 3000; i++) {
				const source = lines(rand);
				const how = fed_mismatch(source);
				if (how !== '') differ.push(`${JSON.stringify(source)} ${how}`);
			}
			expect(differ).toEqual([]);
		}
	);

	test('and with unwrap_images', { timeout: 30000 }, () => {
		const rand = random(2);
		const differ: string[] = [];
		for (let i = 0; i < 1500; i++) {
			const source = lines(rand);
			const how = fed_mismatch(source, { unwrap_images: true });
			if (how !== '') differ.push(`${JSON.stringify(source)} ${how}`);
		}
		expect(differ).toEqual([]);
	});

	test('every node is opened once and ended once', () => {
		const rand = random(3);
		for (let i = 0; i < 3000; i++) {
			const source = lines(rand);
			for (const chunk of [0, 1, 3]) {
				const label = `${JSON.stringify(source)} fed ${chunk}`;
				expect(broken(source, chunk), label).toEqual([]);
			}
		}
	});
});
