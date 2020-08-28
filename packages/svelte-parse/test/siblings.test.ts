import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { SvelteElement, SvelteComponent } from 'svast';

import { parseNode } from '../src/main';
import { Result } from '../src/types_and_things';

const siblings = suite<{ parseNode_1: Result }>('parse-element');

siblings.before((ctx) => {
	ctx.parseNode_1 = parseNode({
		value:
			'<input hello:world|modifierval|modifierval2=someval /><input2 hello2:world2|modifierval2|modifierval3=someval2 />',
	});
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
		value: '<input2 hello2:world2|modifierval2|modifierval3=someval2 />',
		currentPosition: {
			line: 1,
			column: 55,
			offset: 54,
		},
	});

	assert.equal(position, {
		line: 1,
		column: 114,
		offset: 113,
		index: 59,
	});
});

siblings.run();
