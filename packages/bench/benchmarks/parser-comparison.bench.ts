import { readFileSync } from 'node:fs';
import { bench, describe } from 'vitest';

import { parse_markdown_svelte, PFMParser } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { remark } from 'remark';
import { marked } from 'marked';
import { createMarkdownExit } from 'markdown-exit';
import { parse as comark_parse, createParse as comark_createParse } from 'comark';
import { StreamParser, Renderer, MarkdownRecovery } from '@aibind/markdown';

const fixture = readFileSync(
	new URL('./fixture.md', import.meta.url),
	'utf-8',
);

const remark_processor = remark();
const mdexit = createMarkdownExit();



describe(`markdown parser comparison -- Fixture: ${fixture.length} bytes, ${fixture.split('\n').length} lines`, () => {

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

// ── Incremental parsing (5-char chunks) ──────────────────────

const CHUNK_SIZE = 5;

// Pre-split fixture into chunks
const chunks: string[] = [];
for (let i = 0; i < fixture.length; i += CHUNK_SIZE) {
	chunks.push(fixture.slice(i, Math.min(i + CHUNK_SIZE, fixture.length)));
}


describe(`incremental parsing (5-char chunks) -- Incremental: ${chunks.length} chunks of ${CHUNK_SIZE} chars`, () => {
	bench('pfm (feed)', () => {
		const tree = new TreeBuilder((fixture.length >> 3) || 128);
		const parser = new PFMParser(tree);
		parser.init();
		for (let i = 0; i < chunks.length; i++) {
			parser.feed(chunks[i]);
		}
		parser.finish();
	});



	// WARNING: This take a very long time to run

  // bench('remark (reparse)', () => {
	// 	for (let i = 0; i < chunks.length; i++) {
	// 		remark_processor.parse(chunks.slice(0, i + 1).join(''));
	// 	}
	// });

	bench('marked (reparse)', () => {
		for (let i = 0; i < chunks.length; i++) {
			marked.lexer(chunks.slice(0, i + 1).join(''));
		}
	});

	bench('markdown-exit (reparse)', () => {
		const md = createMarkdownExit();
		for (let i = 0; i < chunks.length; i++) {
			md.parse(chunks.slice(0, i + 1).join(''));
		}
	});

	bench('comark (streaming reparse)', async () => {
		const parse = comark_createParse();
		for (let i = 0; i < chunks.length; i++) {
			await parse(chunks.slice(0, i + 1).join(''), { streaming: true });
		}
	});
});


describe('PFM - incremental vs batch', () => {
  bench('pfm (feed chunks)', () => {
		const tree = new TreeBuilder((fixture.length >> 3) || 128);
		const parser = new PFMParser(tree);
		parser.init();
		for (let i = 0; i < chunks.length; i++) {
			parser.feed(chunks[i]);
		}
		parser.finish();
  });

  bench('pfm (feed whole shebang)', () => {
		const tree = new TreeBuilder((fixture.length >> 3) || 128);
		const parser = new PFMParser(tree);

    parser.init();
		parser.feed(fixture);
		parser.finish();
  });

  bench('pfm (parse_markdown_svelte)', () => {
		parse_markdown_svelte(fixture);
	});
})
