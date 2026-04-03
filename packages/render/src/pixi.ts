/**
 * PFM PixiJS Renderer
 *
 * Renders a PFMDocument to a PixiJS canvas using Text and Graphics.
 * Each top-level block is a Container with positioned Text objects.
 * Closed blocks are cached — only the streaming block re-renders.
 *
 * Usage:
 *   const renderer = new PixiRenderer(app.stage, { width: 600 });
 *   // after each doc.apply(batch):
 *   renderer.update(doc);
 */

import { Container, Text, Graphics } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';
import type { PFMNode, PFMDocument } from '@mdsvex/parse';

// ── Helpers ──────────────────────────────────────────────────

function textContent(node: PFMNode): string {
	let result = '';
	for (let i = 0; i < node.content.length; i++) {
		const item = node.content[i];
		result += typeof item === 'string' ? item : textContent(item);
	}
	return result;
}

// ── Style constants ──────────────────────────────────────────

const FONT = 'Arial, Helvetica, sans-serif';
const FONT_MONO = 'Menlo, Monaco, Consolas, monospace';

const COLOR = {
	text: '#d4d4d4',
	heading: '#ededed',
	accent: '#00dc82',
	code: '#00dc82',
	code_bg: '#111111',
	code_border: '#2a2a2a',
	quote: '#999999',
	quote_border: '#00dc82',
	hr: '#333333',
	link: '#60a5fa',
	del: '#666666',
	bullet: '#00dc82',
	table_border: '#2a2a2a',
	table_header: '#1a1a1a',
};

const H_SIZES = [0, 28, 24, 20, 17, 15, 14];
const BODY = 14;
const CODE = 13;
const LH = 1.5;
const GAP = 14;
/** Extra letterSpacing prevents PixiJS glyph clipping at texture edges. */
const LS = 0.5;

// ── Shared base styles ──────────────────────────────────────

function bodyStyle(overrides: Partial<TextStyleOptions> = {}): TextStyleOptions {
	return {
		fontFamily: FONT,
		fontSize: BODY,
		fill: COLOR.text,
		wordWrap: true,
		lineHeight: BODY * LH,
		letterSpacing: LS,
		...overrides,
	};
}

function monoStyle(overrides: Partial<TextStyleOptions> = {}): TextStyleOptions {
	return {
		fontFamily: FONT_MONO,
		fontSize: CODE,
		fill: COLOR.code,
		wordWrap: true,
		lineHeight: CODE * LH,
		letterSpacing: LS,
		...overrides,
	};
}

// ── PixiRenderer ─────────────────────────────────────────────

export interface PixiRendererOptions {
	width: number;
	padding?: number;
}

export class PixiRenderer {
	private stage: Container;
	private blocks: Map<number, Container> = new Map();
	private order: number[] = [];
	private width: number;
	private pad: number;

	constructor(stage: Container, options: PixiRendererOptions) {
		this.stage = stage;
		this.width = options.width;
		this.pad = options.padding ?? 16;
	}

	update(doc: PFMDocument): void {
		if (!doc.root) { this.clear(); return; }

		const newOrder: number[] = [];
		for (let i = 0; i < doc.root.content.length; i++) {
			const item = doc.root.content[i];
			if (typeof item === 'string' || item.kindName === 'line_break') continue;
			newOrder.push(item.id);

			if (!this.blocks.has(item.id)) {
				const c = this.renderBlock(item);
				this.stage.addChild(c);
				this.blocks.set(item.id, c);
			} else if (!item.closed) {
				const old = this.blocks.get(item.id)!;
				const idx = this.stage.getChildIndex(old);
				this.stage.removeChild(old);
				old.destroy({ children: true });
				const c = this.renderBlock(item);
				this.stage.addChildAt(c, idx);
				this.blocks.set(item.id, c);
			}
		}

		for (const id of this.order) {
			if (!newOrder.includes(id)) {
				const c = this.blocks.get(id);
				if (c) { this.stage.removeChild(c); c.destroy({ children: true }); this.blocks.delete(id); }
			}
		}

		this.order = newOrder;
		this.layout();
	}

	setWidth(w: number): void { this.width = w; }
	clear(): void {
		for (const [, c] of this.blocks) { this.stage.removeChild(c); c.destroy({ children: true }); }
		this.blocks.clear(); this.order = [];
	}
	reset(): void { this.clear(); }

	private get cw(): number { return this.width - this.pad * 2; }

	private layout(): void {
		let y = this.pad;
		for (const id of this.order) {
			const c = this.blocks.get(id);
			if (!c) continue;
			c.x = this.pad;
			c.y = y;
			y += c.height + GAP;
		}
	}

	// ── Block renderers ─────────────────────────────────────

	private renderBlock(node: PFMNode): Container {
		switch (node.kindName) {
			case 'heading': return this.heading(node);
			case 'paragraph': return this.paragraph(node);
			case 'code_fence': return this.codeFence(node);
			case 'block_quote': return this.blockQuote(node);
			case 'thematic_break': return this.hr();
			case 'list': return this.list(node);
			case 'table': return this.table(node);
			default: return this.paragraph(node);
		}
	}

	private heading(node: PFMNode): Container {
		const lvl = Math.min(Math.max(node.extra, 1), 6);
		const c = new Container();
		c.addChild(new Text({
			text: textContent(node),
			style: {
				fontFamily: FONT,
				fontSize: H_SIZES[lvl],
				fontWeight: 'bold',
				fill: lvl <= 2 ? COLOR.accent : COLOR.heading,
				wordWrap: true,
				wordWrapWidth: this.cw,
				lineHeight: H_SIZES[lvl] * LH,
				letterSpacing: LS,
			},
		}));
		return c;
	}

	private paragraph(node: PFMNode): Container {
		const c = new Container();
		c.addChild(new Text({
			text: textContent(node),
			style: bodyStyle({ wordWrapWidth: this.cw }),
		}));
		return c;
	}

	private codeFence(node: PFMNode): Container {
		const c = new Container();
		const p = 12;
		const t = new Text({
			text: textContent(node),
			style: monoStyle({ wordWrapWidth: this.cw - p * 2 }),
		});
		const bg = new Graphics()
			.roundRect(0, 0, this.cw, t.height + p * 2, 4)
			.fill(COLOR.code_bg)
			.stroke({ width: 1, color: COLOR.code_border });
		t.x = p; t.y = p;
		c.addChild(bg, t);
		return c;
	}

	private blockQuote(node: PFMNode): Container {
		const c = new Container();
		const indent = 16;
		const t = new Text({
			text: textContent(node),
			style: bodyStyle({ fontStyle: 'italic', fill: COLOR.quote, wordWrapWidth: this.cw - indent }),
		});
		t.x = indent;
		c.addChild(
			new Graphics().rect(0, 0, 3, t.height).fill(COLOR.quote_border),
			t,
		);
		return c;
	}

	private hr(): Container {
		const c = new Container();
		c.addChild(new Graphics().rect(0, 4, this.cw, 1).fill(COLOR.hr));
		return c;
	}

	private list(node: PFMNode): Container {
		const c = new Container();
		const ordered = !!node.attrs.ordered;
		let y = 0, num = (node.attrs.start as number) ?? 1;
		for (let i = 0; i < node.content.length; i++) {
			const item = node.content[i];
			if (typeof item === 'string' || item.kindName !== 'list_item') continue;
			const indent = 20;
			const marker = new Text({
				text: ordered ? `${num}.` : '\u2022',
				style: monoStyle({ fill: COLOR.bullet, wordWrap: false }),
			});
			marker.x = 0; marker.y = y;
			const body = new Text({
				text: textContent(item),
				style: bodyStyle({ wordWrapWidth: this.cw - indent }),
			});
			body.x = indent; body.y = y;
			c.addChild(marker, body);
			y += body.height + 4;
			num++;
		}
		return c;
	}

	private table(node: PFMNode): Container {
		const c = new Container();
		const alignments = (node.attrs.alignments as string[]) ?? [];
		const cp = 8;

		// Extract rows
		const rows: { cells: string[]; header: boolean }[] = [];
		for (let i = 0; i < node.content.length; i++) {
			const item = node.content[i];
			if (typeof item === 'string') continue;
			if (item.kindName !== 'table_header' && item.kindName !== 'table_row') continue;
			const cells: string[] = [];
			for (let j = 0; j < item.content.length; j++) {
				const cell = item.content[j];
				if (typeof cell !== 'string' && cell.kindName === 'table_cell') cells.push(textContent(cell));
			}
			rows.push({ cells, header: item.kindName === 'table_header' });
		}
		if (!rows.length) return c;

		const cols = Math.max(...rows.map(r => r.cells.length));
		const colW: number[] = new Array(cols).fill(0);
		const texts: Text[][] = [];

		for (const row of rows) {
			const rt: Text[] = [];
			for (let col = 0; col < cols; col++) {
				const t = new Text({
					text: row.cells[col] ?? '',
					style: monoStyle({
						fontWeight: row.header ? 'bold' : 'normal',
						fill: row.header ? COLOR.heading : COLOR.text,
						wordWrap: false,
					}),
				});
				rt.push(t);
				colW[col] = Math.max(colW[col], t.width + cp * 2);
			}
			texts.push(rt);
		}

		let y = 0;
		for (let r = 0; r < rows.length; r++) {
			const rh = Math.max(...texts[r].map(t => t.height)) + cp * 2;
			let x = 0;
			if (rows[r].header) {
				c.addChild(new Graphics().rect(0, y, colW.reduce((a, b) => a + b, 0), rh).fill(COLOR.table_header));
			}
			for (let col = 0; col < cols; col++) {
				const t = texts[r][col];
				const a = alignments[col] ?? 'left';
				let tx = x + cp;
				if (a === 'center') tx = x + (colW[col] - t.width) / 2;
				else if (a === 'right') tx = x + colW[col] - cp - t.width;
				t.x = tx; t.y = y + cp;
				c.addChild(t);
				c.addChild(new Graphics().rect(x, y, colW[col], rh).stroke({ width: 1, color: COLOR.table_border }));
				x += colW[col];
			}
			y += rh;
		}
		return c;
	}
}
