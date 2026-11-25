// the parser fed deltas, CursorHTMLRenderer with its block cache, and the
// html of each changed block parsed again

import { PFMParser, WireEmitter } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { CursorHTMLRenderer } from '@mdsvex/render';

function same_attributes(a, b) {
	const from = a.attributes;
	const to = b.attributes;
	if (from.length !== to.length) return false;
	for (let i = 0; i < to.length; i++)
		if (a.getAttribute(to[i].name) !== to[i].value) return false;
	return true;
}

function copy_attributes(a, b) {
	for (const { name } of [...a.attributes])
		if (!b.hasAttribute(name)) a.removeAttribute(name);
	for (const { name, value } of b.attributes)
		if (a.getAttribute(name) !== value) a.setAttribute(name, value);
}

/** changes a to match b, returns the node now on the page */
export function match(a, b) {
	if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) {
		a.replaceWith(b);
		return b;
	}
	if (a.nodeType !== 1) {
		const from = a.data;
		const to = b.data;
		if (from === to) return a;
		// the browser keeps the lines before appended text
		if (to.startsWith(from)) a.appendData(to.slice(from.length));
		else a.data = to;
		return a;
	}
	if (!same_attributes(a, b)) copy_attributes(a, b);
	let from = a.firstChild;
	let to = b.firstChild;
	while (from !== null && to !== null) {
		const from_next = from.nextSibling;
		const to_next = to.nextSibling;
		// the last child is the one that grows
		if ((from_next === null && to_next === null) || !from.isEqualNode(to))
			match(from, to);
		from = from_next;
		to = to_next;
	}
	while (from !== null) {
		const next = from.nextSibling;
		from.remove();
		from = next;
	}
	while (to !== null) {
		const next = to.nextSibling;
		a.appendChild(to);
		to = next;
	}
	return a;
}

function direct() {
	const tree = new TreeBuilder(128);
	const parser = new PFMParser(tree);
	parser.init();
	let source = '';
	return {
		feed(full, delta) {
			source = full;
			tree.hide_open_text();
			parser.feed(delta);
			tree.show_open_text(full);
		},
		finish(full) {
			source = full;
			tree.hide_open_text();
			parser.finish();
		},
		buffer: () => tree.get_buffer(),
		source: () => source,
	};
}

function wire() {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const tree = new WireTreeBuilder(128);
	parser.init();
	return {
		feed(full, delta) {
			emitter.set_source(full);
			parser.feed(delta);
			tree.apply(emitter.flush());
		},
		finish(full) {
			emitter.set_source(full);
			parser.finish();
			tree.apply(emitter.flush());
			tree.end();
		},
		buffer: () => tree.get_buffer(),
		// the wire tree holds its text
		source: () => '',
	};
}

/**
 * @param {boolean} keep change the nodes of a block to match its new html, or replace them
 * @param {boolean} over_wire build the tree from the wire
 */
export function create_view(root, keep, over_wire = false) {
	const doc = over_wire ? wire() : direct();
	const renderer = new CursorHTMLRenderer();
	const template = document.createElement('template');
	// per block, the html it shows and the nodes that came from it
	const shown = [];

	function drop(entry) {
		for (const node of entry.nodes) node.remove();
	}

	function patch() {
		const blocks = renderer.update(doc.buffer(), doc.source());
		for (let i = 0; i < blocks.length; i++) {
			const html = blocks[i].html;
			const entry = shown[i];
			if (entry !== undefined && entry.html === html) continue;
			template.innerHTML = html;
			const nodes = [...template.content.childNodes];
			if (entry === undefined) {
				root.append(template.content);
				shown.push({ html, nodes });
				continue;
			}
			entry.html = html;
			const old = entry.nodes;
			const paired = keep ? Math.min(old.length, nodes.length) : 0;
			for (let j = 0; j < paired; j++) nodes[j] = match(old[j], nodes[j]);
			for (let j = paired; j < old.length; j++) old[j].remove();
			entry.nodes = nodes;
			if (paired === nodes.length) continue;
			// a block may have no node of its own
			let before = paired === 0 ? null : nodes[paired - 1].nextSibling;
			for (
				let j = i + 1;
				paired === 0 && j < shown.length && before === null;
				j++
			)
				before = shown[j].nodes[0] ?? null;
			root.insertBefore(template.content, before);
		}
		while (shown.length > blocks.length) drop(shown.pop());
	}

	return {
		write(full, delta) {
			doc.feed(full, delta);
			patch();
		},
		end(full) {
			doc.finish(full);
			patch();
		},
		/** the html the page should hold, for the census */
		expected() {
			return renderer.blocks.map((block) => block.html).join('');
		},
		destroy() {
			root.textContent = '';
		},
	};
}
