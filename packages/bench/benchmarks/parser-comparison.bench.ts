import { readFileSync } from 'node:fs';
import { bench, describe } from 'vitest';

import { parse_markdown_svelte } from '@mdsvex/parse';
import { remark } from 'remark';
import { marked } from 'marked';
import { createMarkdownExit } from 'markdown-exit';
import { parse as comark_parse } from 'comark';

const fixture = readFileSync(
	new URL('./fixture.md', import.meta.url),
	'utf-8',
);

const remark_processor = remark();
const mdexit = createMarkdownExit();

console.log(`\nFixture: ${fixture.length} bytes, ${fixture.split('\n').length} lines\n`);

describe('markdown parser comparison', () => {
	bench('pfm (parse_markdown_svelte)', () => {
		parse_markdown_svelte(fixture);
	});

	bench('remark', () => {
		remark_processor.parse(fixture);
	});

	bench('marked (lexer)', () => {
		marked.lexer(fixture);
	});

	bench('markdown-exit (parse)', () => {
		mdexit.parse(fixture);
	});

	bench('comark (parse)', async () => {
		await comark_parse(fixture);
	});
});
