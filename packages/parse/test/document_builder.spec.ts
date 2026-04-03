import { describe, it, expect } from 'vitest';
import { PFMParser, WireEmitter, PFMDocument } from '../src/main';
import { DocumentBuilder } from '../src/document_builder';
import type { PFMNode } from '../src/pfm_document';

// ── Helpers ──────────────────────────────────────────────────

/** Parse via WireEmitter → PFMDocument (the existing path). */
function via_wire(source: string): PFMNode {
	const emitter = new WireEmitter();
	emitter.set_source(source);
	const parser = new PFMParser(emitter);
	parser.parse(source);
	const batch = emitter.flush();
	const doc = new PFMDocument();
	doc.apply(batch);
	return doc.root!;
}

/** Parse via DocumentBuilder (the new direct path). */
function via_builder(source: string): PFMNode {
	const builder = new DocumentBuilder();
	builder.set_source(source);
	const parser = new PFMParser(builder);
	parser.parse(source);
	return builder.root!;
}

/**
 * Normalize a PFMNode tree to a plain object for deep comparison.
 * Strips parent refs (circular) and other non-essential fields.
 */
function normalize(node: PFMNode): unknown {
	return {
		kind: node.kind,
		kindName: node.kindName,
		extra: node.extra,
		attrs: node.attrs,
		pending: node.pending,
		closed: node.closed,
		content: node.content.map((item) =>
			typeof item === 'string' ? item : normalize(item),
		),
	};
}

function assert_same(source: string): void {
	const wire = normalize(via_wire(source));
	const direct = normalize(via_builder(source));
	expect(direct).toEqual(wire);
}

// ── Tests ────────────────────────────────────────────────────

describe('DocumentBuilder produces same tree as WireEmitter→PFMDocument', () => {
	it('simple paragraph', () => {
		assert_same('hello world\n');
	});

	it('heading', () => {
		assert_same('# Hello\n');
	});

	it('multiple paragraphs', () => {
		assert_same('first\n\nsecond\n');
	});

	it('emphasis and strong', () => {
		assert_same('_em_ and *bold*\n');
	});

	it('nested emphasis', () => {
		assert_same('_em *strong* em_\n');
	});

	it('code span', () => {
		assert_same('use `code` here\n');
	});

	it('code fence', () => {
		assert_same('```js\nconst x = 1;\n```\n');
	});

	it('code fence without info', () => {
		assert_same('```\nhello\n```\n');
	});

	it('link', () => {
		assert_same('[click](https://example.com)\n');
	});

	it('link with title', () => {
		assert_same('[text](url "title")\n');
	});

	it('image', () => {
		assert_same('![alt](img.png)\n');
	});

	it('block quote', () => {
		assert_same('> quoted text\n');
	});

	it('unordered list', () => {
		assert_same('- one\n- two\n- three\n');
	});

	it('ordered list', () => {
		assert_same('1. one\n2. two\n');
	});

	it('thematic break', () => {
		assert_same('---\n');
	});

	it('strikethrough', () => {
		assert_same('~~deleted~~\n');
	});

	it('superscript', () => {
		assert_same('^super^\n');
	});

	it('table', () => {
		assert_same('| a | b |\n| --- | --- |\n| 1 | 2 |\n');
	});

	it('table with alignment', () => {
		assert_same('| left | center | right |\n| :--- | :---: | ---: |\n| a | b | c |\n');
	});

	it('html inline', () => {
		assert_same('text <span>inside</span> end\n');
	});

	it('html self-closing', () => {
		assert_same('text <br /> end\n');
	});

	it('html block', () => {
		assert_same('<div>\n\n# Heading\n\nParagraph.\n\n</div>\n');
	});

	it('html comment', () => {
		assert_same('text <!-- comment --> end\n');
	});

	it('mixed complex document', () => {
		assert_same(
			'# Title\n\n' +
			'A paragraph with _emphasis_ and *bold*.\n\n' +
			'> A block quote with `code`\n\n' +
			'```js\nconst x = 1;\n```\n\n' +
			'- item one\n- item two\n\n' +
			'| a | b |\n| --- | --- |\n| 1 | 2 |\n\n' +
			'[link](url) and ![img](src)\n\n' +
			'---\n',
		);
	});

	it('revoked emphasis', () => {
		assert_same('_not closed\n');
	});

	it('nested revocation', () => {
		assert_same('_open *also open\n');
	});
});
