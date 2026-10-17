import { check_args, content_of } from './node_view.js';
import type { NodeView, Position } from './node_view.js';
import type { Json } from './plugin_data.js';
import { NodeKind, string_to_kind, type NodeBuffer } from './utils.js';

const NONE = 0xffffffff;

/** where a node is, for a message */
function at(position: Position | undefined): string {
	return position === undefined
		? ''
		: ` at line ${position.start.line}, column ${position.start.column}`;
}

/**
 * a plugin started async work where nothing can wait for it, ctx.defer or a
 * document hook that returned a promise in a parse that is synchronous
 */
export class PluginAsyncError extends Error {
	/** the name of the plugin, undefined for one without */
	plugin: string | undefined;
	/** what it did, defer for ctx.defer and document for a hook that returned a promise */
	kind: 'defer' | 'document';
	/** where the node it deferred on is, undefined over the wire and for a hook */
	position: Position | undefined;

	constructor(
		plugin: string | undefined,
		kind: 'defer' | 'document',
		position: Position | undefined,
		hint: string
	) {
		const who = plugin === undefined ? 'a plugin' : `plugin "${plugin}"`;
		super(
			(kind === 'defer'
				? `${who} called ctx.defer${at(position)}`
				: `the document hook of ${who} returned a promise`) +
				', and this parse can not wait for async work' +
				(hint === '' ? '' : `, ${hint}`)
		);
		this.name = 'PluginAsyncError';
		this.plugin = plugin;
		this.kind = kind;
		this.position = position;
	}
}

/** a deferred task rejected, the error it rejected with is the cause */
export class PluginTaskError extends Error {
	/** the name of the plugin, undefined for one without */
	plugin: string | undefined;
	/** where the node the task was deferred on is, undefined over the wire */
	position: Position | undefined;
	/** what the task rejected with */
	cause: unknown;

	constructor(
		plugin: string | undefined,
		type: string,
		position: Position | undefined,
		cause: unknown
	) {
		const who = plugin === undefined ? 'a plugin' : `plugin "${plugin}"`;
		const why =
			cause instanceof Error ? cause.message : String(cause as unknown);
		super(
			`a task ${who} deferred on the ${type} node${at(position)} failed: ${why}`
		);
		this.name = 'PluginTaskError';
		this.cause = cause;
		this.plugin = plugin;
		this.position = position;
	}
}

/** what a task did, kept until it applies, a ref is a buffer index or ~ the index of a draft */
export const enum OpKind {
	Attr,
	Unset,
	Type,
	Append,
	Prepend,
	WrapInner,
	Remove,
	Data,
	Warn,
}

export type Op =
	| { kind: OpKind.Attr; ref: number; key: string; value: unknown }
	| { kind: OpKind.Unset; ref: number; key: string }
	| { kind: OpKind.Type; ref: number; type: string }
	| {
			kind: OpKind.Append | OpKind.Prepend | OpKind.WrapInner;
			ref: number;
			type: string;
			given: Record<string, any> | string | undefined;
			/** the draft the new node fills */
			made: number;
	  }
	| { kind: OpKind.Remove; ref: number }
	| { kind: OpKind.Data; key: string; value: Json; list: boolean }
	| {
			kind: OpKind.Warn;
			code: string;
			message: string;
			/** the node it points at, NONE for none */
			ref: number;
	  };

/** the state of a task */
export const enum TaskState {
	Running,
	Done,
	Failed,
}

/** what a task needs from the dispatcher while it runs */
export interface TaskHost {
	/** the buffer of the document, throws once the document is gone */
	buffer(task: Task): NodeBuffer;
	/** the view of a node for a task to read */
	real(task: Task, index: number): NodeView;
}

/** async work deferred on a node, its changes wait until it settled and the node is committed */
export class Task {
	/** the node it was deferred on, the owner of what it writes */
	readonly node: number;
	/** the name of the plugin, undefined for one without */
	readonly plugin: string | undefined;
	/** made by the dispatcher in this order, ties of one node apply in it */
	readonly seq: number;
	readonly host: TaskHost;
	state = TaskState.Running;
	error: unknown = undefined;
	/** the node is final, no revoke can take it back */
	committed = false;
	/** the node went, or the document did, the task is forgotten */
	dropped = false;
	applied = false;
	ops: Op[] = [];
	/** resolves once the task settled, never rejects */
	done: Promise<void> = Promise.resolve();
	/** views of the document for the task, by buffer index */
	private views: Map<number, TaskView> | null = null;
	/** attrs the task wrote, by buffer index, read back before the tree */
	overlay: Map<number, Map<string, unknown>> | null = null;
	drafts = 0;

	constructor(
		node: number,
		plugin: string | undefined,
		seq: number,
		host: TaskHost
	) {
		this.node = node;
		this.plugin = plugin;
		this.seq = seq;
		this.host = host;
	}

	/** the view a task reads and writes a node of the document through */
	view(index: number): TaskView | null {
		if (index === NONE) return null;
		let views = this.views;
		if (views === null) views = this.views = new Map();
		let view = views.get(index);
		if (view === undefined) {
			view = new TaskView(this, index);
			views.set(index, view);
		}
		return view;
	}

	/** a write to a node of the document, it must be the node or inside it */
	check(index: number, what: string): void {
		if (this.dropped) return;
		const buf = this.host.buffer(this);
		for (let up = index; up !== NONE; up = buf.parent_at(up)) {
			if (up === this.node) return;
		}
		throw new TypeError(
			`${what}: a deferred task changes the node it was deferred on and what is inside it, nothing else`
		);
	}

	record(op: Op): void {
		// a task that was dropped goes on unheard
		if (!this.dropped && !this.applied) this.ops.push(op);
	}

	set_attr(index: number, key: string, value: unknown, unset: boolean): void {
		this.check(index, unset ? 'delete node.attrs' : 'node.attrs');
		if (key === 'args' && !unset && !this.dropped)
			check_args(this.host.buffer(this).kind_at(index), value);
		let overlay = this.overlay;
		if (overlay === null) overlay = this.overlay = new Map();
		let own = overlay.get(index);
		if (own === undefined) overlay.set(index, (own = new Map()));
		own.set(key, unset ? UNSET : value);
		this.record(
			unset
				? { kind: OpKind.Unset, ref: index, key }
				: { kind: OpKind.Attr, ref: index, key, value }
		);
	}
}

/**
 * the node a task adds, checked as the method of a view would check it, the
 * attrs are copied so a later change to the object is not applied
 */
function drafted(
	type: string,
	given: Record<string, any> | string | undefined
): Record<string, any> | string | undefined {
	const kind = string_to_kind(type);
	if (kind === undefined) throw new Error(`Unknown node type: ${type}`);
	content_of(kind, type, given);
	return typeof given === 'object' && given !== null ? { ...given } : given;
}

/** an attr a task deleted */
export const UNSET: unique symbol = Symbol('unset');

/** the attrs of a node of the document as a task sees them, with its own writes on top */
function task_attrs(task: Task, index: number): Record<string, any> {
	const real = () => task.host.real(task, index).attrs;
	const own = (key: string) => task.overlay?.get(index)?.get(key);
	return new Proxy({} as Record<string, any>, {
		get(_t, key) {
			if (typeof key !== 'string') return undefined;
			const mine = own(key);
			if (mine === UNSET) return undefined;
			return mine !== undefined ? mine : real()[key];
		},
		set(_t, key, value) {
			if (typeof key !== 'string') return false;
			task.set_attr(index, key, value, false);
			return true;
		},
		deleteProperty(_t, key) {
			if (typeof key !== 'string') return false;
			task.set_attr(index, key, undefined, true);
			return true;
		},
		has(_t, key) {
			if (typeof key !== 'string') return false;
			const mine = own(key);
			if (mine === UNSET) return false;
			return mine !== undefined || key in real();
		},
		ownKeys() {
			const keys = new Set(Object.keys(real()));
			const mine = task.overlay?.get(index);
			if (mine !== undefined) {
				for (const [key, value] of mine) {
					if (value === UNSET) keys.delete(key);
					else keys.add(key);
				}
			}
			return [...keys];
		},
		getOwnPropertyDescriptor(_t, key) {
			if (typeof key !== 'string') return undefined;
			const mine = own(key);
			if (mine === UNSET) return undefined;
			const value = mine !== undefined ? mine : real()[key];
			if (mine === undefined && !(key in real())) return undefined;
			return { value, writable: true, enumerable: true, configurable: true };
		},
	});
}

/**
 * a node of the document as a deferred task sees it, reads go to the tree,
 * writes are kept and applied once the task settled and its node is committed
 */
export class TaskView {
	/** @internal */
	readonly _task: Task;
	/** @internal buffer index of the node */
	readonly _index: number;
	private _attrs: Record<string, any> | null = null;

	constructor(task: Task, index: number) {
		this._task = task;
		this._index = index;
	}

	private get _real(): NodeView {
		return this._task.host.real(this._task, this._index);
	}

	get type(): string {
		const own = this._task.overlay?.get(this._index)?.get('\0type');
		return typeof own === 'string' ? own : this._real.type;
	}

	set type(value: string) {
		const task = this._task;
		task.check(this._index, 'node.type');
		let overlay = task.overlay;
		if (overlay === null) overlay = task.overlay = new Map();
		let own = overlay.get(this._index);
		if (own === undefined) overlay.set(this._index, (own = new Map()));
		own.set('\0type', value);
		task.record({ kind: OpKind.Type, ref: this._index, type: value });
	}

	get attrs(): Record<string, any> {
		return (this._attrs ??= task_attrs(this._task, this._index));
	}

	get parent(): TaskView | null {
		return this._task.view(
			this._task.host.buffer(this._task).parent_at(this._index)
		);
	}

	get first_child(): TaskView | null {
		const child = this._real.first_child;
		return child === null ? null : this._task.view(child._index);
	}

	get last_child(): TaskView | null {
		const child = this._real.last_child;
		return child === null ? null : this._task.view(child._index);
	}

	get next(): TaskView | null {
		const next = this._real.next;
		return next === null ? null : this._task.view(next._index);
	}

	get prev(): TaskView | null {
		const prev = this._real.prev;
		return prev === null ? null : this._task.view(prev._index);
	}

	get text_content(): string {
		return this._real.text_content;
	}

	get pending(): boolean {
		return this._real.pending;
	}

	get depth(): number | undefined {
		return this._real.depth;
	}

	get math(): boolean | undefined {
		return this._real.math;
	}

	get info(): string | undefined {
		return this._real.info;
	}

	get lang(): string | undefined {
		return this._real.lang;
	}

	get href(): string | undefined {
		return this._real.href;
	}

	get title(): string | undefined {
		return this._real.title;
	}

	get ordered(): boolean | undefined {
		return this._real.ordered;
	}

	get start(): number | undefined {
		return this._real.start;
	}

	get tight(): boolean | undefined {
		return this._real.tight;
	}

	get position(): Position | undefined {
		return this._real.position;
	}

	/** @internal */
	_span(): [number, number] {
		return this._real._span();
	}

	private add(
		kind: OpKind.Append | OpKind.Prepend | OpKind.WrapInner,
		name: string,
		type: string,
		given: Record<string, any> | string | undefined
	): DraftView {
		const task = this._task;
		task.check(this._index, name);
		const copy = drafted(type, given);
		const draft = new DraftView(task, task.drafts++, type, copy);
		task.record({
			kind,
			ref: this._index,
			type,
			given: copy,
			made: ~draft._id,
		});
		return draft;
	}

	wrap_inner(type: string, attrs?: Record<string, any>): DraftView {
		return this.add(OpKind.WrapInner, 'wrap_inner', type, attrs);
	}

	prepend(type: string, given?: Record<string, any> | string): DraftView {
		return this.add(OpKind.Prepend, 'prepend', type, given);
	}

	append(type: string, given?: Record<string, any> | string): DraftView {
		return this.add(OpKind.Append, 'append', type, given);
	}

	wrap_from(): never {
		throw new TypeError(
			'wrap_from: a deferred task can not group siblings, the nodes after its node may already be rendered'
		);
	}

	remove(): void {
		const task = this._task;
		if (this._index === task.node) {
			throw new TypeError(
				'remove: a deferred task removes what is inside its node, not the node itself'
			);
		}
		task.check(this._index, 'remove');
		task.record({ kind: OpKind.Remove, ref: this._index });
	}
}

/** a node a deferred task added, it is in the tree once the task applies */
export class DraftView {
	/** @internal */
	readonly _task: Task;
	/** @internal */
	readonly _id: number;
	readonly type: string;
	/** what the task gave and wrote, the node gets it when it is made */
	readonly attrs: Record<string, any>;
	private readonly text: string;

	constructor(
		task: Task,
		id: number,
		type: string,
		given: Record<string, any> | string | undefined
	) {
		this._task = task;
		this._id = id;
		this.type = type;
		this.text = typeof given === 'string' ? given : '';
		const own: Record<string, any> =
			typeof given === 'object' && given !== null ? { ...given } : {};
		const ref = ~id;
		const kind = string_to_kind(type)!;
		this.attrs = new Proxy(own, {
			set(target, key, value) {
				if (typeof key !== 'string') return false;
				if (key === 'args') check_args(kind, value);
				target[key] = value;
				task.record({ kind: OpKind.Attr, ref, key, value });
				return true;
			},
			deleteProperty(target, key) {
				if (typeof key !== 'string') return false;
				delete target[key];
				task.record({ kind: OpKind.Unset, ref, key });
				return true;
			},
		});
	}

	get text_content(): string {
		return this.text;
	}

	get parent(): null {
		return null;
	}

	get position(): undefined {
		return undefined;
	}

	/** @internal */
	_span(): [number, number] {
		return [NONE, NONE];
	}

	private add(
		kind: OpKind.Append | OpKind.Prepend | OpKind.WrapInner,
		type: string,
		given: Record<string, any> | string | undefined
	): DraftView {
		const task = this._task;
		const copy = drafted(type, given);
		const draft = new DraftView(task, task.drafts++, type, copy);
		task.record({ kind, ref: ~this._id, type, given: copy, made: ~draft._id });
		return draft;
	}

	wrap_inner(type: string, attrs?: Record<string, any>): DraftView {
		return this.add(OpKind.WrapInner, type, attrs);
	}

	prepend(type: string, given?: Record<string, any> | string): DraftView {
		return this.add(OpKind.Prepend, type, given);
	}

	append(type: string, given?: Record<string, any> | string): DraftView {
		return this.add(OpKind.Append, type, given);
	}

	wrap_from(): never {
		throw new TypeError(
			'wrap_from: a deferred task can not group siblings, the nodes after its node may already be rendered'
		);
	}

	remove(): never {
		throw new TypeError(
			'remove: a node a deferred task added is not in the tree yet, leave it out instead'
		);
	}
}

/** true when index is node or inside it, a node taken out of the tree is in nothing */
export function within(buf: NodeBuffer, index: number, node: number): boolean {
	for (let up = index; up !== NONE; up = buf.parent_at(up)) {
		if (up === node) return true;
		if (buf.kind_at(up) === NodeKind.root) return false;
	}
	return false;
}
