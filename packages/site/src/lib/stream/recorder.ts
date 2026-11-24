import type { Emitter } from "@mdsvex/parse/opcodes";
import { kind_to_string } from "@mdsvex/parse/utils";

export type Op =
	| {
			op: "open";
			id: number;
			kind: string;
			start: number;
			parent: number;
			pending: boolean;
	  }
	| { op: "close"; id: number; end: number }
	| { op: "text"; parent: number; start: number; end: number }
	| { op: "attr"; id: number; key: string; value: unknown }
	| { op: "revoke"; id: number }
	| { op: "commit"; id: number };

/** keeps every opcode the parser emits, and how far it has read */
export class RecordingEmitter implements Emitter {
	ops: Op[] = [];
	/** the offset the parser has read to, what it was fed past this it is holding */
	read = 0;

	open(
		id: number,
		kind: number,
		start: number,
		parent: number,
		_extra: number,
		pending: boolean,
	): void {
		this.ops.push({
			op: "open",
			id,
			kind: kind_to_string(kind),
			start,
			parent,
			pending,
		});
	}

	close(id: number, end: number): void {
		this.ops.push({ op: "close", id, end });
	}

	text(parent: number, start: number, end: number): void {
		this.ops.push({ op: "text", parent, start, end });
	}

	attr(id: number, key: string, value: unknown): void {
		this.ops.push({ op: "attr", id, key, value });
	}

	set_value_start(id: number, pos: number): void {
		this.attr(id, "value_start", pos);
	}

	set_value_end(id: number, pos: number): void {
		this.attr(id, "value_end", pos);
	}

	cursor(pos: number): void {
		this.read = pos;
	}

	revoke(id: number): void {
		this.ops.push({ op: "revoke", id });
	}

	commit(id: number): void {
		this.ops.push({ op: "commit", id });
	}
}

export function format_op(op: Op): string {
	switch (op.op) {
		case "open":
			return `open(${op.id}, ${op.kind}${op.pending ? ", pending" : ""})`;
		case "close":
			return `close(${op.id})`;
		case "text":
			return `text(${op.parent}, ${op.start}..${op.end})`;
		case "attr":
			return `attr(${op.id}, ${op.key}, ${JSON.stringify(op.value)})`;
		case "revoke":
			return `revoke(${op.id})`;
		case "commit":
			return `commit(${op.id})`;
	}
}
