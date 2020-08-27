import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { parseNode } from '../src/main';

const element = suite('parse-element');

element('parses a simple tag', () => {
	const { parsed } = parseNode({ value: `<input />` });

	assert.equal(parsed, {
		type: 'svelteElement',
		tagName: 'input',
		selfClosing: true,
		children: [],
		properties: [],
	});
});

element.run();
