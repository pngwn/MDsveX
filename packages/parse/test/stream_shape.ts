import { expect } from 'vitest';

import { PFMParser, parse_markdown_svelte } from '../src/main';
import type { Emitter } from '../src/opcodes';
import { TreeBuilder } from '../src/tree_builder';
import { NodeKind, kind_to_string } from '../src/utils';
import { print_ast } from './print';

const enum Seen {
	open,
	closed,
	revoked,
}

/** every node opened once and ended once, what a builder needs of the stream */
class Stream implements Emitter {
	private kinds: NodeKind[] = [];
	private seen: Seen[] = [];
	broken: string[] = [];

	private fail(what: string, id: number): void {
		const kind = id === undefined ? 'no' : kind_to_string(this.kinds[id]);
		this.broken.push(`${what}: ${kind} ${id}`);
	}

	private add(id: number, kind: NodeKind, parent: number, seen: Seen): void {
		if (this.seen[id] !== undefined) this.fail('opened twice', id);
		if (parent !== -1 && this.seen[parent] === undefined) {
			this.fail('opened under an unknown parent', id);
		}
		this.kinds[id] = kind;
		this.seen[id] = seen;
	}

	open(id: number, kind: NodeKind, _start: number, parent: number): void {
		this.add(id, kind, parent, Seen.open);
	}
	leaf(id: number, kind: NodeKind, _start: number, parent: number): void {
		this.add(id, kind, parent, Seen.closed);
	}
	close(id: number): void {
		if (this.seen[id] === undefined) this.fail('closed but never opened', id);
		else if (this.seen[id] === Seen.closed) this.fail('closed twice', id);
		else if (this.seen[id] === Seen.revoked)
			this.fail('closed after a revoke', id);
		this.seen[id] = Seen.closed;
	}
	revoke(id: number): void {
		if (this.seen[id] === undefined) this.fail('revoked but never opened', id);
		this.seen[id] = Seen.revoked;
	}
	commit(): void {}
	text(): void {}
	attr(): void {}
	set_value_start(): void {}
	set_value_end(): void {}
	cursor(): void {}

	finish(): string[] {
		for (let id = 0; id < this.seen.length; id++) {
			if (this.seen[id] === Seen.open) this.fail('never closed', id);
		}
		return this.broken;
	}
}

export function broken(source: string, chunk: number): string[] {
	const stream = new Stream();
	const parser = new PFMParser(stream);
	if (chunk === 0) parser.parse(source);
	else {
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			parser.feed(source.slice(i, i + chunk));
		}
		parser.finish();
	}
	return stream.finish();
}

function fed(source: string, chunk: number): string {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < source.length; i += chunk) {
		parser.feed(source.slice(i, i + chunk));
	}
	parser.finish();
	return print_ast(tree.get_buffer(), source);
}

export function checked_tree(source: string): string {
	for (const chunk of [0, 1, 2, 3]) {
		expect(broken(source, chunk), `fed ${chunk}`).toEqual([]);
	}
	const whole = print_ast(parse_markdown_svelte(source).nodes, source);
	for (const chunk of [1, 2, 3]) {
		expect(fed(source, chunk), `fed ${chunk}`).toBe(whole);
	}
	return whole;
}

export function lines(...rows: string[]): string {
	return rows.join('\n');
}

export function random(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function pick(rand: () => number, from: string[]): string {
	return from[Math.floor(rand() * from.length)];
}
