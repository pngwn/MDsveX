/**
 * what a streaming view needs from plugins, what they wrote, live, for the
 * components that read it, and the nodes their deferred work changed
 *
 *   const stream = new PluginStream({ plugins });
 *   stream.renderers.push(renderer);
 *   stream.on_change(() => renderer.update(stream.buffer, ''));
 *   for await (const batch of batches) stream.apply(batch);
 *   await stream.end();
 *
 * a component reads the data from the context under PLUGIN_DATA, which a
 * compiled document sets too, so it reads the same in a stream and a compile
 */

import { PluginDispatcher, WireTextSource } from '@mdsvex/parse';
import type {
	DataChange,
	DirectiveTable,
	HeadingIds,
	ParsePlugin,
	PluginDocument,
} from '@mdsvex/parse';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { createSubscriber } from 'svelte/reactivity';

const NONE = 0xffffffff;

/** the context key of what plugins wrote, the same in every copy of this module */
export const PLUGIN_DATA: unique symbol = Symbol.for(
	'mdsvex.plugin_data'
) as any;

/** what plugins wrote, by plugin name, undefined while none wrote anything */
export type PluginDataValue = Readonly<
	Record<string, Readonly<Record<string, unknown>>>
>;

/** the value under PLUGIN_DATA, current is read again as it changes */
export interface PluginDataContext {
	readonly current: PluginDataValue | undefined;
}

/**
 * what plugins wrote, followed through on_data, current is a new object after
 * each change, read in a component or an effect it runs again when that comes
 */
export class LiveData implements PluginDataContext {
	#data: PluginDataValue | undefined = undefined;
	#update: (() => void) | null = null;
	#subscribe = createSubscriber((update) => {
		this.#update = update;
		return () => {
			this.#update = null;
		};
	});

	get current(): PluginDataValue | undefined {
		this.#subscribe();
		return this.#data;
	}

	/** the value of a key after a change, undefined once it holds nothing */
	change({ plugin, key, value }: DataChange): void {
		const data = this.#data;
		const own = data?.[plugin];
		const next: Record<string, unknown> = { ...own };
		if (value === undefined) delete next[key];
		else next[key] = value;
		const all: Record<string, Readonly<Record<string, unknown>>> = { ...data };
		if (Object.keys(next).length === 0) delete all[plugin];
		else all[plugin] = next;
		this.#data = Object.keys(all).length === 0 ? undefined : all;
		this.#update?.();
	}

	/** follows a dispatcher, returns what stops it */
	follow(dispatcher: PluginDispatcher): () => void {
		return dispatcher.on_data((change) => this.change(change));
	}

	/** nothing written, for the next document */
	reset(): void {
		if (this.#data === undefined) return;
		this.#data = undefined;
		this.#update?.();
	}
}

/** a renderer that caches blocks, a patched node renders its block again */
export interface PatchedBlocks {
	invalidate(buf: NodeBuffer, nodes: readonly number[]): void;
}

export interface PluginStreamOptions {
	plugins?: ParsePlugin[];
	directive_handlers?: DirectiveTable[];
	/** makes the id of each heading as it arrives, make_heading_ids in mdsvex */
	headings?: HeadingIds;
	/** what the handlers learn about the document, see set_document */
	document?: PluginDocument;
}

/**
 * a document arriving over the wire with its plugins, the builder, the
 * dispatcher, the data as it changes, and the nodes deferred tasks patch
 */
export class PluginStream {
	readonly builder: WireTreeBuilder;
	/** null for a stream with no plugin */
	readonly dispatcher: PluginDispatcher | null;
	/** what plugins wrote, for the components that read it */
	readonly data = new LiveData();
	/** renderers whose cached blocks a patch drops */
	readonly renderers: PatchedBlocks[] = [];
	private listeners: (() => void)[] = [];
	private stops: (() => void)[] = [];
	private ended = false;

	constructor(options: PluginStreamOptions = {}) {
		const { plugins, directive_handlers } = options;
		const plugged =
			(plugins !== undefined && plugins.length > 0) ||
			(directive_handlers !== undefined && directive_handlers.length > 0);
		const dispatcher = plugged
			? new PluginDispatcher(
					plugins,
					new WireTextSource([]),
					directive_handlers
				)
			: null;
		this.dispatcher = dispatcher;
		this.builder = new WireTreeBuilder(128, dispatcher ?? undefined);
		if (options.headings !== undefined)
			this.builder.set_headings(options.headings);
		if (dispatcher !== null) {
			dispatcher.set_document(options.document);
			this.stops.push(
				this.data.follow(dispatcher),
				// a task that settled applies at once, and its node renders again
				dispatcher.on_settled(() => {
					if (this.patch()) this.changed();
				})
			);
		}
	}

	/** the buffer the builder fills */
	get buffer(): NodeBuffer {
		return this.builder.get_buffer();
	}

	/** a batch of the wire, then the deferred work that is ready */
	apply(batch: unknown[][]): void {
		this.builder.apply(batch);
		this.patch();
		this.changed();
	}

	/**
	 * the stream ended, after finish of the parser, runs the sequential passes,
	 * waits for the deferred tasks still running, then runs the document hooks,
	 * a promise when any of that waits, every block renders again after it
	 */
	end(): Promise<void> | undefined {
		if (this.ended) return undefined;
		this.ended = true;
		this.builder.end();
		const dispatcher = this.dispatcher;
		if (dispatcher === null) return undefined;
		const buf = this.buffer;
		dispatcher.run_sequential(buf);
		const finished = dispatcher.finish(buf);
		this.everything();
		if (finished === undefined) return undefined;
		return finished.then(() => this.everything());
	}

	/** applies the deferred tasks that are ready, true when one patched a node */
	patch(): boolean {
		const dispatcher = this.dispatcher;
		if (dispatcher === null) return false;
		const nodes = dispatcher.apply_ready();
		if (nodes === null) return false;
		const buf = this.buffer;
		for (const renderer of this.renderers) renderer.invalidate(buf, nodes);
		return true;
	}

	/** listener runs after each batch and each patch, so a view renders again */
	on_change(listener: () => void): () => void {
		this.listeners.push(listener);
		return () => {
			const at = this.listeners.indexOf(listener);
			if (at !== -1) this.listeners.splice(at, 1);
		};
	}

	/** stops following the dispatcher, a task still running applies nowhere */
	stop(): void {
		for (const stop of this.stops) stop();
		this.stops.length = 0;
		this.listeners.length = 0;
	}

	/** the whole tree may have changed, every block renders again */
	private everything(): void {
		const buf = this.buffer;
		const blocks: number[] = [];
		let child = buf.first_child_at(0);
		while (child !== NONE && buf.parent_at(child) === 0) {
			blocks.push(child);
			child = buf.next_at(child);
		}
		if (blocks.length !== 0)
			for (const renderer of this.renderers) renderer.invalidate(buf, blocks);
		this.changed();
	}

	private changed(): void {
		for (const listener of this.listeners.slice()) listener();
	}
}
