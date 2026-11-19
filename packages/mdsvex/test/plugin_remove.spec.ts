import { describe, expect, test } from 'vitest';

import { compile } from '../src/main';
import type { ParsePlugin } from '../src/main';

describe('a node a plugin removed', () => {
	const no_comments: ParsePlugin = {
		html_comment: {
			parse(node) {
				return () => node.remove();
			},
		},
	};

	test('is not rendered', () => {
		const source = 'a <!-- todo --> b\n\n<!-- a block -->\n\nc\n';
		expect(compile(source).code).toContain('<!-- todo -->');
		for (const sourcemap of [false, true]) {
			const { code } = compile(source, {
				parse_plugins: [no_comments],
				sourcemap,
			});
			expect(code).toBe('<p>a  b</p><p>c</p>');
		}
	});

	test('takes no heading id when it goes in the fused pass', () => {
		const drafts: ParsePlugin = {
			heading: {
				parse(node) {
					return () => {
						if (node.text_content.endsWith('(draft)')) node.remove();
					};
				},
			},
		};
		const { code } = compile('# Setup (draft)\n\n# Setup\n\n# Setup\n', {
			parse_plugins: [drafts],
			heading_ids: true,
		});
		expect(code).toBe('<h1 id="setup">Setup</h1><h1 id="setup-1">Setup</h1>');
	});

	test('goes in a sequential pass, with what it holds', () => {
		const no_notes: ParsePlugin = {
			sequential: true,
			directive_container: {
				parse(node) {
					if (node.attrs.name === 'note') node.remove();
				},
			},
		};
		const { code } = compile(
			'before\n\n:::note\nhidden _text_\n:::\n\nafter\n',
			{
				parse_plugins: [no_notes],
			}
		);
		expect(code).toBe('<p>before</p><p>after</p>');
	});
});
