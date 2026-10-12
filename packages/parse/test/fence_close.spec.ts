import { describe, expect, test } from 'vitest';

import { every_path, lines } from './stream_shape';

describe('a closing fence', () => {
	test.each([
		['```\na\n``` b\nc\n', '"a\\n``` b\\nc\\n"'],
		['```\na\n```b\nc\n', '"a\\n```b\\nc\\n"'],
		['```\na\n```` b\n', '"a\\n```` b\\n"'],
		['```\na\n``` `\n', '"a\\n``` `\\n"'],
		['```md\n```js\nb\n```\n', 'info="md" "```js\\nb"'],
		['````\na\n``` b\n````\n', '"a\\n``` b"'],
	])(
		'%j holds the line with text after its backticks as code',
		(source, fence) => {
			expect(every_path(source)).toBe(lines('root', `  code_fence ${fence}`));
		}
	);

	test.each([
		'```\na\n```\nc\n',
		'```\na\n``` \t\nc\n',
		'```\na\n  ````  \nc\n',
	])('%j closes at a line of only backticks and spaces', (source) => {
		expect(every_path(source)).toContain('  code_fence "a"\n');
		expect(every_path(source)).toContain('  paragraph\n    text "c"');
	});

	test('closes after a line that is not its close', () => {
		expect(every_path('```\na\n``` b\n```\nc\n')).toBe(
			lines(
				'root',
				'  code_fence "a\\n``` b"',
				'  paragraph',
				'    text "c"',
				'  line_break'
			)
		);
	});

	test.each([
		['> ```\n> a\n> ``` b\n> c\n', 'block_quote'],
		['- ```\n  a\n  ``` b\n  c\n', 'list'],
	])('%j is the same in a container', (source, container) => {
		const tree = every_path(source);
		expect(tree).toContain(container);
		expect(tree).toContain('code_fence "a\\n``` b\\nc\\n"');
		expect(tree).not.toContain('paragraph');
	});

	test.each([
		'<div>\n\n```\na\n``` b\n```\n\n</div>\n',
		'{#if x}\n```\na\n``` b\n```\n{/if}\n',
		':::note\n```\na\n``` b\n```\n:::\n',
	])(
		'%j keeps the line as code in an element, a block and a directive',
		(source) => {
			expect(every_path(source)).toContain('code_fence "a\\n``` b"');
		}
	);
});
