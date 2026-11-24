// the documented live view, the parser fed deltas, the wire, PluginStream,
// ComponentRenderer and the Node component

import { flushSync, mount, unmount } from 'svelte';
import { PFMParser, WireEmitter } from '@mdsvex/parse';
import { ComponentRenderer } from '@mdsvex/render/component';
import { PluginStream } from '@mdsvex/render/stream';
import View from './MdsvexView.svelte';

export const api = 'delta';

export function create(root) {
	const view = mount(View, { target: root });
	const renderer = new ComponentRenderer();
	const stream = new PluginStream();
	stream.renderers.push(renderer);
	stream.on_change(() => {
		// the renderer bumps v in place, a keyed each needs new entries to see it
		const blocks = renderer.update(stream.buffer, '');
		const next = new Array(blocks.length);
		for (let i = 0; i < blocks.length; i++)
			next[i] = { idx: blocks[i].idx, v: blocks[i].v };
		view.set(stream.buffer, next);
	});
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	parser.init();
	flushSync();
	return {
		write(full, delta) {
			emitter.set_source(full);
			parser.feed(delta);
			stream.apply(emitter.flush());
			flushSync();
		},
		end(full) {
			emitter.set_source(full);
			parser.finish();
			stream.apply(emitter.flush());
			stream.end();
			flushSync();
		},
		destroy() {
			stream.stop();
			unmount(view);
		},
	};
}
