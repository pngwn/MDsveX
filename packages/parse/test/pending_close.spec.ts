import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PFMParser, WireEmitter } from '../src/main';
import type { Emitter } from '../src/opcodes';
import { NodeKind, kind_to_string } from '../src/utils';

const HERE = dirname(fileURLToPath(import.meta.url));

const enum Pending {
	no,
	open,
	/** closed by close, final unless a paragraph */
	closed,
	/** closed by close_pending, its revoke follows */
	held,
	paragraph,
	committed,
}

/**
 * what a builder relies on to drop the plugin undo log of a pending node,
 * a close is final, a close_pending is revoked later, a pending paragraph
 * gets a commit or a revoke
 */
class Contract implements Emitter {
	private kinds: NodeKind[] = [NodeKind.root];
	private state: Pending[] = [Pending.no];
	private revoked: boolean[] = [];
	broken: string[] = [];

	private fail(what: string, id: number): void {
		this.broken.push(`${what}: ${kind_to_string(this.kinds[id])} ${id}`);
	}

	open(
		id: number,
		kind: NodeKind,
		_start: number,
		_parent: number,
		_extra: number,
		pending: boolean
	): void {
		this.kinds[id] = kind;
		this.state[id] = pending ? Pending.open : Pending.no;
	}
	leaf(id: number, kind: NodeKind): void {
		this.kinds[id] = kind;
		this.state[id] = Pending.no;
	}
	close(id: number): void {
		if (this.state[id] !== Pending.open) return;
		this.state[id] =
			this.kinds[id] === NodeKind.paragraph
				? Pending.paragraph
				: Pending.closed;
	}
	close_pending(id: number): void {
		if (this.state[id] !== Pending.open) this.fail('held but not pending', id);
		this.state[id] = Pending.held;
	}
	revoke(id: number): void {
		if (this.revoked[id]) this.fail('revoked twice', id);
		this.revoked[id] = true;
		if (this.state[id] === Pending.closed)
			this.fail('revoked after a close', id);
		if (this.state[id] === Pending.committed) {
			this.fail('revoked after a commit', id);
		}
		this.state[id] = Pending.no;
	}
	commit(id: number): void {
		this.state[id] = Pending.committed;
	}
	text(): void {}
	attr(): void {}
	set_value_start(): void {}
	set_value_end(): void {}
	cursor(): void {}

	finish(): string[] {
		for (let id = 0; id < this.state.length; id++) {
			if (this.state[id] === Pending.held)
				this.fail('held and never revoked', id);
			if (this.state[id] === Pending.paragraph) {
				this.fail('paragraph never settled', id);
			}
		}
		return this.broken;
	}
}

function broken(source: string, chunk: number): string[] {
	const contract = new Contract();
	const parser = new PFMParser(contract);
	if (chunk === 0) parser.parse(source);
	else {
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			parser.feed(source.slice(i, i + chunk));
		}
		parser.finish();
	}
	return contract.finish();
}

function fixtures(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) fixtures(path, out);
		else if (/\.(md|svx|svelte)$/.test(name)) out.push(path);
	}
	return out;
}

const PIECES = [
	'*',
	'**',
	'_',
	'~~',
	'~',
	'^',
	'[',
	']',
	'](u)',
	'![',
	'<div>',
	'</div>',
	'<span>',
	'</span>',
	'<b',
	'>',
	'`',
	'\n',
	'\n\n',
	'> ',
	'- ',
	'  ',
	'1. ',
	'# ',
	':::x[]\n',
	':::\n',
	':y[',
	'::z[',
	'{#if a}',
	'{/if}',
	'{x}',
	'a',
	'b c',
	' ',
	'---\n',
	'```\n',
	'<!--',
	'-->',
	'\\',
	'<img src="i.png">',
	'| ',
	' |',
	'|-|',
];

function random(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe('pending nodes: what a close means', () => {
	it('holds for every fixture, whole and fed', () => {
		const files = fixtures(resolve(HERE, 'fixtures'));
		expect(files.length).toBeGreaterThan(500);
		for (const file of files) {
			const source = readFileSync(file, 'utf8');
			for (const chunk of [0, 1, 7]) {
				expect(broken(source, chunk), `${file} fed ${chunk}`).toEqual([]);
			}
		}
	});

	it('holds for random documents', () => {
		const rand = random(1);
		for (let i = 0; i < 4000; i++) {
			let source = '';
			const length = 2 + Math.floor(rand() * 40);
			for (let k = 0; k < length; k++) {
				source += PIECES[Math.floor(rand() * PIECES.length)];
			}
			for (const chunk of [0, 3]) {
				expect(
					broken(source, chunk),
					`${JSON.stringify(source)} fed ${chunk}`
				).toEqual([]);
			}
		}
	});

	/** the opens, closes, commits and revokes of pending nodes, as the parser sends them */
	function pending_ops(source: string, with_close_pending: boolean): string[] {
		const ops: string[] = [];
		const pending = new Set<number>();
		const log = (name: string) => (id: number) => {
			if (pending.has(id)) ops.push(`${name} ${id}`);
		};
		const emitter: Emitter = {
			open(id, kind, _start, _parent, _extra, is_pending) {
				if (!is_pending) return;
				pending.add(id);
				ops.push(`open ${kind_to_string(kind)} ${id}`);
			},
			close: log('close'),
			revoke: log('revoke'),
			commit: log('commit'),
			text() {},
			attr() {},
			set_value_start() {},
			set_value_end() {},
			cursor() {},
		};
		if (with_close_pending) emitter.close_pending = log('close_pending');
		new PFMParser(emitter).parse(source);
		return ops;
	}

	it('a delimiter with no closer is held, one with a closer is not', () => {
		expect(pending_ops('a *b* c *d\n\ne\n', true)).toEqual([
			'open strong_emphasis 3',
			'close 3',
			'open strong_emphasis 6',
			'close_pending 6',
			'revoke 6',
		]);
	});

	it('an emitter without close_pending gets a close', () => {
		expect(pending_ops('a *d\n', false)).toEqual([
			'open strong_emphasis 3',
			'close 3',
			'revoke 3',
		]);
	});

	it('a paragraph that starts with a tag is committed when it keeps its text', () => {
		expect(pending_ops('<b>x</b> text\n', true)).toEqual([
			'open paragraph 1',
			'open html 2',
			'close 2',
			'close 1',
			'commit 1',
		]);
		// only components, so the wrapper goes
		expect(pending_ops('<Foo /> <Bar />\n', true)).toEqual([
			'open paragraph 1',
			'close 1',
			'revoke 1',
		]);
	});

	it('the wire flags the close of a delimiter with no closer', () => {
		const emitter = new WireEmitter();
		const source = 'a *b* c *d\n';
		emitter.set_source(source);
		new PFMParser(emitter).parse(source);
		// 3 the strong that closed, 6 the one left open
		const ops = emitter.flush().filter((op) => op[1] === 3 || op[1] === 6);
		expect(ops.filter((op) => op[0] === 'C' || op[0] === 'R')).toEqual([
			['C', 3],
			['C', 6, 1],
			['R', 6, '*'],
		]);
	});
});
