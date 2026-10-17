import type { Position } from './node_view.js';

/** a value ctx.set and ctx.add take, what json can hold, a key that holds undefined is left out */
export type Json =
	| null
	| boolean
	| number
	| string
	| readonly Json[]
	| { readonly [key: string]: Json | undefined };

/** one change to the data of a plugin, the value of the key after it, undefined once it has none */
export interface DataChange {
	plugin: string;
	key: string;
	value: Json | undefined;
}

/** the owner of a write from no node, a sequential pass, it sorts after every node */
export const NO_OWNER = 0xffffffff;

/** a plugin wrote a value with ctx.set or ctx.add that json can not hold */
export class PluginDataError extends Error {
	plugin: string;
	key: string;
	/** where the value is under the key, headings[2].id */
	path: string;
	/**
	 * where the node whose handler wrote it is, undefined over the wire, for a
	 * node a plugin made, and for a write from no node
	 */
	position: Position | undefined;

	constructor(
		plugin: string,
		key: string,
		path: string,
		found: string,
		position: Position | undefined
	) {
		const at =
			position === undefined
				? ''
				: ` (line ${position.start.line}, column ${position.start.column})`;
		super(
			`plugin ${JSON.stringify(plugin)} wrote ${found} at ${path} of its data${at}, ` +
				'which is kept as json: plain objects, arrays, strings, finite numbers, booleans and null'
		);
		this.name = 'PluginDataError';
		this.plugin = plugin;
		this.key = key;
		this.path = path;
		this.position = position;
	}
}

const IDENT = /^[A-Za-z_$][\w$]*$/;
const get_proto = Object.getPrototypeOf;
const object_proto = Object.prototype;
const freeze = Object.freeze;

/** what a value that is not json is called in the error */
function found_of(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'object') {
		const name = get_proto(value)?.constructor?.name;
		return typeof name === 'string' && name !== ''
			? `a ${name}`
			: 'an object with a prototype';
	}
	return `a ${typeof value}`;
}

/** the first value json can not hold, thrown out of copy */
class Bad {
	path: string;
	found: string;

	constructor(path: string, found: string) {
		this.path = path;
		this.found = found;
	}
}

function copy(value: unknown, path: string, open: unknown[]): Json {
	if (value === null) return null;
	const type = typeof value;
	if (type === 'string' || type === 'boolean') return value as Json;
	if (type === 'number') {
		if (Number.isFinite(value)) return value as number;
		throw new Bad(path, found_of(value));
	}
	if (type !== 'object') throw new Bad(path, found_of(value));
	if (open.includes(value))
		throw new Bad(path, 'a reference to an object it is in');
	if (Array.isArray(value)) {
		open.push(value);
		const out: Json[] = [];
		// by index, a hole reads as undefined
		for (let i = 0; i < value.length; i++) {
			out.push(copy(value[i], `${path}[${i}]`, open));
		}
		open.pop();
		return freeze(out);
	}
	const proto = get_proto(value);
	if (proto !== null && proto !== object_proto)
		throw new Bad(path, found_of(value));
	if (Object.getOwnPropertySymbols(value).length !== 0)
		throw new Bad(path, 'a symbol key');
	open.push(value);
	const object = value as Record<string, unknown>;
	const out: Record<string, Json> = {};
	for (const key of Object.keys(object)) {
		const member = object[key];
		// json leaves the key out, which reads the same
		if (member === undefined) continue;
		out[key] = copy(
			member,
			IDENT.test(key) ? path + '.' + key : `${path}[${JSON.stringify(key)}]`,
			open
		);
	}
	open.pop();
	return freeze(out);
}

/** the copy of a value, frozen, a PluginDataError for one json can not hold */
export function json_copy(
	value: unknown,
	plugin: string,
	key: string,
	position: () => Position | undefined
): Json {
	try {
		return copy(value, IDENT.test(key) ? key : `[${JSON.stringify(key)}]`, []);
	} catch (e) {
		if (!(e instanceof Bad)) throw e;
		throw new PluginDataError(plugin, key, e.path, e.found, position());
	}
}

/**
 * the writes to one key, by owner, an owner is the buffer index of the node
 * whose handler wrote, so the order of owners is the order of the document
 */
class Slot {
	/** true for ctx.add, a list in document order, false for ctx.set */
	readonly list: boolean;
	/** ascending, an owner of a set has one entry */
	owners: number[] = [];
	values: Json[] = [];
	/** the frozen list as it stands, null when a change made it stale */
	snapshot: readonly Json[] | null = null;

	constructor(list: boolean) {
		this.list = list;
	}

	/** the first entry whose owner is not below owner */
	private lower(owner: number): number {
		const owners = this.owners;
		let lo = 0;
		let hi = owners.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (owners[mid] < owner) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	/** the first entry whose owner is above owner */
	private upper(owner: number): number {
		const owners = this.owners;
		const n = owners.length;
		// most writes come in document order
		if (n === 0 || owners[n - 1] <= owner) return n;
		let lo = 0;
		let hi = n;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (owners[mid] <= owner) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	write(owner: number, value: Json): void {
		const at = this.upper(owner);
		if (!this.list && at > 0 && this.owners[at - 1] === owner) {
			this.values[at - 1] = value;
			return;
		}
		if (at === this.owners.length) {
			this.owners.push(owner);
			this.values.push(value);
		} else {
			this.owners.splice(at, 0, owner);
			this.values.splice(at, 0, value);
		}
		this.snapshot = null;
	}

	/** takes back every write of an owner, false when it had none */
	revoke(owner: number): boolean {
		const from = this.lower(owner);
		const to = this.upper(owner);
		if (from === to) return false;
		this.owners.splice(from, to - from);
		this.values.splice(from, to - from);
		this.snapshot = null;
		return true;
	}

	get empty(): boolean {
		return this.owners.length === 0;
	}

	/** what the key holds, the value of the last owner for a set, the frozen list for an add */
	value(): Json {
		const values = this.values;
		if (!this.list) return values[values.length - 1];
		return (this.snapshot ??= freeze(values.slice()));
	}
}

const READ_ONLY =
	'ctx.data is read-only, write with ctx.set(key, value) or add to a list with ctx.add(key, value)';

function read_only(): never {
	throw new TypeError(READ_ONLY);
}

/** the data of one plugin name for one document */
export class Bag {
	readonly name: string;
	readonly slots: Map<string, Slot> = new Map();
	/** what ctx.data reads through, made when first read */
	private view: Record<string, Json> | null = null;

	constructor(name: string) {
		this.name = name;
	}

	/** false when the key holds the other kind of write */
	write(key: string, owner: number, value: Json, list: boolean): void {
		let slot = this.slots.get(key);
		if (slot === undefined) {
			slot = new Slot(list);
			this.slots.set(key, slot);
		} else if (slot.list !== list) {
			throw new TypeError(
				list
					? `plugin ${JSON.stringify(this.name)} has a value under ${JSON.stringify(key)} from ctx.set, ctx.add can not add to it`
					: `plugin ${JSON.stringify(this.name)} has a list under ${JSON.stringify(key)} from ctx.add, ctx.set can not replace it`
			);
		}
		slot.write(owner, value);
	}

	/** false when the owner wrote nothing under the key */
	revoke(key: string, owner: number): boolean {
		const slot = this.slots.get(key);
		if (slot === undefined || !slot.revoke(owner)) return false;
		if (slot.empty) this.slots.delete(key);
		return true;
	}

	get(key: string): Json | undefined {
		const slot = this.slots.get(key);
		return slot === undefined ? undefined : slot.value();
	}

	get empty(): boolean {
		return this.slots.size === 0;
	}

	/** a plain object of every key and its value */
	out(): Record<string, Json> {
		const out: Record<string, Json> = {};
		for (const [key, slot] of this.slots) out[key] = slot.value();
		return out;
	}

	/** a read-only view of the data as it stands, assigning to it throws */
	read(): Readonly<Record<string, Json>> {
		let view = this.view;
		if (view !== null) return view;
		const slots = this.slots;
		const descriptor = (key: string) => {
			const slot = slots.get(key);
			if (slot === undefined) return undefined;
			return {
				value: slot.value(),
				writable: false,
				enumerable: true,
				configurable: true,
			};
		};
		view = this.view = new Proxy({} as Record<string, Json>, {
			get(_target, key) {
				if (typeof key !== 'string') return undefined;
				const slot = slots.get(key);
				return slot === undefined ? undefined : slot.value();
			},
			has(_target, key) {
				return typeof key === 'string' && slots.has(key);
			},
			ownKeys() {
				return [...slots.keys()];
			},
			getOwnPropertyDescriptor(_target, key) {
				return typeof key === 'string' ? descriptor(key) : undefined;
			},
			set: read_only,
			deleteProperty: read_only,
			defineProperty: read_only,
			setPrototypeOf: read_only,
		});
		return view;
	}
}

/** a path ctx.depend takes, from the root of a file system or a drive */
export function is_absolute(path: string): boolean {
	return /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(path);
}

/**
 * what ctx.cached keeps, by plugin name and key, the host makes one and keeps
 * it as long as its compiler, a load is shared while it runs and a load that
 * rejected is not kept
 */
export class PluginCache {
	private by_plugin = new Map<string, Map<string, Promise<unknown>>>();

	get<T>(
		plugin: string,
		key: string,
		load: (key: string) => T | Promise<T>
	): Promise<T> {
		let entries = this.by_plugin.get(plugin);
		if (entries === undefined)
			this.by_plugin.set(plugin, (entries = new Map()));
		const hit = entries.get(key);
		if (hit !== undefined) return hit as Promise<T>;
		let loading: Promise<T>;
		try {
			loading = Promise.resolve(load(key));
		} catch (e) {
			loading = Promise.reject(e);
		}
		entries.set(key, loading);
		loading.catch(() => {
			// the next document tries again
			if (entries.get(key) === loading) entries.delete(key);
		});
		return loading;
	}

	/** drops every entry keyed by one of these paths, for each plugin, a key that is no path stays */
	invalidate(paths: Iterable<string>): void {
		for (const path of paths) {
			if (!is_absolute(path)) continue;
			for (const entries of this.by_plugin.values()) entries.delete(path);
		}
	}
}
