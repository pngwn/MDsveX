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

expression.run();
