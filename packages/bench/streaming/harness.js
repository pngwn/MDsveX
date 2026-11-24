// runs in the page, replays a document through one adapter and times each
// update to the end of the frame that shows it

const WARMUP =
	'# Warmup\n\nSome **strong** text, `code` and a [link](/warmup).\n\n' +
	'- one\n- two\n\n> a quote\n\n```js\nconst warm = 1;\n```\n\n' +
	'| a | b |\n| --- | --- |\n| 1 | 2 |\n\nDone.\n';

const host = document.getElementById('host');
const channel = new MessageChannel();
const now = () => performance.now();

/** chunk ends in utf16 units, a surrogate pair stays whole */
export function chunk_ends(source, size) {
	const ends = [];
	for (let end = 0; end < source.length; ) {
		end = Math.min(end + size, source.length);
		const code = source.charCodeAt(end - 1);
		if (code >= 0xd800 && code <= 0xdbff && end < source.length) end++;
		ends.push(end);
	}
	return ends;
}

// the gap between animation frames, read in prepare
let frame_ms = 1000 / 60;
// whether to keep the cpu busy between frames
let spin = true;

/**
 * one update in one frame, a task posted from the animation frame callback
 * runs after the style, layout, paint and commit of that frame
 * the busy wait keeps the cpu from slowing down between frames
 */
function frame(write, root, last_frame) {
	return new Promise((resolve) => {
		requestAnimationFrame((start) => {
			const t0 = now();
			write();
			const t1 = now();
			// style and layout of what was written, the frame would do it next anyway
			root.offsetHeight;
			const t2 = now();
			channel.port1.onmessage = () => {
				const t3 = now();
				resolve([t1 - t0, t2 - t1, t3 - t2, start]);
			};
			channel.port2.postMessage(0);
		});
		if (spin && last_frame !== 0) {
			// up to a little before the next frame is due
			const until = last_frame + frame_ms - 1;
			while (now() < until);
		}
	});
}

const next_task = () =>
	new Promise((resolve) => {
		channel.port1.onmessage = resolve;
		channel.port2.postMessage(0);
	});

const idle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function make_root() {
	const root = document.createElement('article');
	root.className = 'doc';
	host.append(root);
	return root;
}

/** text without whitespace, renderers differ in the whitespace between blocks */
function text_of(root) {
	return root.textContent.replace(/\s+/g, '');
}

function hash(text) {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++)
		h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
	return h.toString(16);
}

/** where two strings part, for a report */
function describe(want, have) {
	let i = 0;
	while (i < want.length && want[i] === have[i]) i++;
	const from = Math.max(0, i - 60);
	return `want ${JSON.stringify(want.slice(from, i + 60))} have ${JSON.stringify(have.slice(from, i + 60))}`;
}

function count_nodes(node) {
	let n = 1;
	for (let child = node.firstChild; child !== null; child = child.nextSibling)
		n += count_nodes(child);
	return n;
}

/** the frame interval of the display, the median gap of a few animation frames */
function frame_interval() {
	return new Promise((resolve) => {
		const gaps = [];
		let last = 0;
		const tick = (t) => {
			if (last !== 0) gaps.push(t - last);
			last = t;
			if (gaps.length === 11) resolve(gaps.sort((a, b) => a - b)[5]);
			else requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
}

let adapter = null;
let source = '';

/** loads the adapter and the document, then streams a short other document */
async function prepare(lib, fixture) {
	adapter = await import(`/lib/${lib}/adapter.js`);
	source = await (await fetch(`/fixtures/${fixture}`)).text();
	const root = make_root();
	const view = await adapter.create(root);
	let prev = 0;
	for (const end of chunk_ends(WARMUP, 24)) {
		view.write(WARMUP.slice(0, end), WARMUP.slice(prev, end));
		root.offsetHeight;
		prev = end;
	}
	view.end(WARMUP);
	root.offsetHeight;
	view.destroy();
	root.remove();
	await idle(300);
	return {
		isolated: crossOriginIsolated,
		chars: source.length,
		frame_ms: (frame_ms = await frame_interval()),
	};
}

/** the timed replay, the document stays mounted for the heap reading */
async function run(chunk, interval, keep_busy) {
	spin = keep_busy;
	const ends = chunk_ends(source, chunk);
	const root = make_root();
	const view = await adapter.create(root);
	const script = [];
	const layout = [];
	const paint = [];
	let prev = 0;
	let last = 0;
	const started = now();
	for (const end of ends) {
		const full = source.slice(0, end);
		const delta = source.slice(prev, end);
		prev = end;
		const [s, l, p, at] = await frame(
			() => view.write(full, delta),
			root,
			last
		);
		script.push(s);
		layout.push(l);
		paint.push(p);
		last = at;
		if (interval > 0) {
			await idle(interval);
			last = 0;
		}
	}
	const finish = (await frame(() => view.end(source), root, last)).slice(0, 3);
	const wall = now() - started;
	const text = text_of(root);
	return {
		script,
		layout,
		paint,
		finish,
		wall,
		text_chars: text.length,
		text_hash: hash(text),
		elements: root.getElementsByTagName('*').length,
	};
}

/**
 * not timed, counts the nodes each update adds and removes, and renders the
 * document in one write to compare its text with the streamed one
 */
async function census(chunk) {
	const ends = chunk_ends(source, chunk);
	const root = make_root();
	const view = await adapter.create(root);
	let added = 0;
	let removed = 0;
	const observer = new MutationObserver(() => {});
	observer.observe(root, { childList: true, subtree: true });
	// a record lists a node as it is when read, with the children it got since,
	// which have records of their own, so each node counts once for an update
	const mark = (node, seen) => {
		if (seen.has(node)) return 0;
		seen.add(node);
		let count = 1;
		for (let child = node.firstChild; child !== null; child = child.nextSibling)
			count += mark(child, seen);
		return count;
	};
	const take = () => {
		const came = new Set();
		const went = new Set();
		for (const record of observer.takeRecords()) {
			for (const node of record.addedNodes) added += mark(node, came);
			for (const node of record.removedNodes) removed += mark(node, went);
		}
	};
	let prev = 0;
	// updates after which the page shows more or less text than before
	let shown = 0;
	let text_length = 0;
	// updates after which the page is not what the adapter says it should be
	let drift = 0;
	let first_drift = '';
	const expected = document.createElement('template');
	for (const end of ends) {
		view.write(source.slice(0, end), source.slice(prev, end));
		prev = end;
		take();
		if (view.expected !== undefined) {
			expected.innerHTML = view.expected();
			if (view.tidy !== undefined) view.tidy(expected.content);
			if (expected.innerHTML !== root.innerHTML) {
				if (drift === 0)
					first_drift = describe(expected.innerHTML, root.innerHTML);
				drift++;
			}
		}
		const length = root.textContent.length;
		if (length !== text_length) shown++;
		text_length = length;
		// react reads updates that share a task as a render loop
		await next_task();
	}
	view.end(source);
	if (view.expected !== undefined) {
		expected.innerHTML = view.expected();
		if (view.tidy !== undefined) view.tidy(expected.content);
		if (expected.innerHTML !== root.innerHTML) {
			if (drift === 0)
				first_drift = describe(expected.innerHTML, root.innerHTML);
			drift++;
		}
	}
	// what the library writes after it returns counts too
	await next_task();
	await idle(50);
	take();
	observer.disconnect();
	const streamed = text_of(root);
	const nodes = count_nodes(root) - 1;
	const html = root.innerHTML;
	view.destroy();
	root.remove();

	const once_root = make_root();
	const once = await adapter.create(once_root);
	once.write(source, source);
	once.end(source);
	const whole = text_of(once_root);
	once.destroy();
	once_root.remove();

	return {
		added,
		removed,
		nodes,
		shown,
		drift,
		first_drift,
		stats: view.stats?.(),
		streamed_chars: streamed.length,
		whole_chars: whole.length,
		same_text: streamed === whole,
		html,
	};
}

window.bench = { prepare, run, census };
