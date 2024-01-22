import sirv from 'sirv';
import polka from 'polka';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import * as yootils from 'yootils';
import Stream from 'stream';
import http from 'http';
import Url from 'url';
import https from 'https';
import zlib from 'zlib';

/** @returns {void} */
function noop$1() {}

const identity = (x) => x;

/**
 * @template T
 * @template S
 * @param {T} tar
 * @param {S} src
 * @returns {T & S}
 */
function assign(tar, src) {
	// @ts-ignore
	for (const k in src) tar[k] = src[k];
	return /** @type {T & S} */ (tar);
}

function run(fn) {
	return fn();
}

function blank_object() {
	return Object.create(null);
}

/**
 * @param {Function[]} fns
 * @returns {void}
 */
function run_all(fns) {
	fns.forEach(run);
}

/** @returns {boolean} */
function safe_not_equal(a, b) {
	return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
}

function subscribe(store, ...callbacks) {
	if (store == null) {
		for (const callback of callbacks) {
			callback(undefined);
		}
		return noop$1;
	}
	const unsub = store.subscribe(...callbacks);
	return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}

function null_to_empty(value) {
	return value == null ? '' : value;
}

const is_client = typeof window !== 'undefined';

/** @type {() => number} */
let now = is_client ? () => window.performance.now() : () => Date.now();

let raf = is_client ? (cb) => requestAnimationFrame(cb) : noop$1;

const tasks = new Set();

/**
 * @param {number} now
 * @returns {void}
 */
function run_tasks(now) {
	tasks.forEach((task) => {
		if (!task.c(now)) {
			tasks.delete(task);
			task.f();
		}
	});
	if (tasks.size !== 0) raf(run_tasks);
}

/**
 * Creates a new task that runs on each raf frame
 * until it returns a falsy value or is aborted
 * @param {import('./private.js').TaskCallback} callback
 * @returns {import('./private.js').Task}
 */
function loop(callback) {
	/** @type {import('./private.js').TaskEntry} */
	let task;
	if (tasks.size === 0) raf(run_tasks);
	return {
		promise: new Promise((fulfill) => {
			tasks.add((task = { c: callback, f: fulfill }));
		}),
		abort() {
			tasks.delete(task);
		}
	};
}

/**
 * @template T
 * @param {string} type
 * @param {T} [detail]
 * @param {{ bubbles?: boolean, cancelable?: boolean }} [options]
 * @returns {CustomEvent<T>}
 */
function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
	return new CustomEvent(type, { detail, bubbles, cancelable });
}

/**
 * @typedef {Node & {
 * 	claim_order?: number;
 * 	hydrate_init?: true;
 * 	actual_end_child?: NodeEx;
 * 	childNodes: NodeListOf<NodeEx>;
 * }} NodeEx
 */

/** @typedef {ChildNode & NodeEx} ChildNodeEx */

/** @typedef {NodeEx & { claim_order: number }} NodeEx2 */

/**
 * @typedef {ChildNodeEx[] & {
 * 	claim_info?: {
 * 		last_index: number;
 * 		total_claimed: number;
 * 	};
 * }} ChildNodeArray
 */

let current_component;

/** @returns {void} */
function set_current_component(component) {
	current_component = component;
}

function get_current_component() {
	if (!current_component) throw new Error('Function called outside component initialization');
	return current_component;
}

/**
 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
 * it can be called from an external module).
 *
 * If a function is returned _synchronously_ from `onMount`, it will be called when the component is unmounted.
 *
 * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
 *
 * https://svelte.dev/docs/svelte#onmount
 * @template T
 * @param {() => import('./private.js').NotFunction<T> | Promise<import('./private.js').NotFunction<T>> | (() => any)} fn
 * @returns {void}
 */
function onMount(fn) {
	get_current_component().$$.on_mount.push(fn);
}

/**
 * Schedules a callback to run immediately after the component has been updated.
 *
 * The first time the callback runs will be after the initial `onMount`
 *
 * https://svelte.dev/docs/svelte#afterupdate
 * @param {() => any} fn
 * @returns {void}
 */
function afterUpdate(fn) {
	get_current_component().$$.after_update.push(fn);
}

/**
 * Creates an event dispatcher that can be used to dispatch [component events](/docs#template-syntax-component-directives-on-eventname).
 * Event dispatchers are functions that can take two arguments: `name` and `detail`.
 *
 * Component events created with `createEventDispatcher` create a
 * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
 * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
 * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
 * property and can contain any type of data.
 *
 * The event dispatcher can be typed to narrow the allowed event names and the type of the `detail` argument:
 * ```ts
 * const dispatch = createEventDispatcher<{
 *  loaded: never; // does not take a detail argument
 *  change: string; // takes a detail argument of type string, which is required
 *  optional: number | null; // takes an optional detail argument of type number
 * }>();
 * ```
 *
 * https://svelte.dev/docs/svelte#createeventdispatcher
 * @template {Record<string, any>} [EventMap=any]
 * @returns {import('./public.js').EventDispatcher<EventMap>}
 */
function createEventDispatcher() {
	const component = get_current_component();
	return (type, detail, { cancelable = false } = {}) => {
		const callbacks = component.$$.callbacks[type];
		if (callbacks) {
			// TODO are there situations where events could be dispatched
			// in a server (non-DOM) environment?
			const event = custom_event(/** @type {string} */ (type), detail, { cancelable });
			callbacks.slice().forEach((fn) => {
				fn.call(component, event);
			});
			return !event.defaultPrevented;
		}
		return true;
	};
}

/**
 * Associates an arbitrary `context` object with the current component and the specified `key`
 * and returns that object. The context is then available to children of the component
 * (including slotted content) with `getContext`.
 *
 * Like lifecycle functions, this must be called during component initialisation.
 *
 * https://svelte.dev/docs/svelte#setcontext
 * @template T
 * @param {any} key
 * @param {T} context
 * @returns {T}
 */
function setContext(key, context) {
	get_current_component().$$.context.set(key, context);
	return context;
}

/**
 * Retrieves the context that belongs to the closest parent component with the specified `key`.
 * Must be called during component initialisation.
 *
 * https://svelte.dev/docs/svelte#getcontext
 * @template T
 * @param {any} key
 * @returns {T}
 */
function getContext(key) {
	return get_current_component().$$.context.get(key);
}

// general each functions:

function ensure_array_like(array_like_or_iterator) {
	return array_like_or_iterator?.length !== undefined
		? array_like_or_iterator
		: Array.from(array_like_or_iterator);
}

const ATTR_REGEX = /[&"]/g;
const CONTENT_REGEX = /[&<]/g;

/**
 * Note: this method is performance sensitive and has been optimized
 * https://github.com/sveltejs/svelte/pull/5701
 * @param {unknown} value
 * @returns {string}
 */
function escape(value, is_attr = false) {
	const str = String(value);
	const pattern = is_attr ? ATTR_REGEX : CONTENT_REGEX;
	pattern.lastIndex = 0;
	let escaped = '';
	let last = 0;
	while (pattern.test(str)) {
		const i = pattern.lastIndex - 1;
		const ch = str[i];
		escaped += str.substring(last, i) + (ch === '&' ? '&amp;' : ch === '"' ? '&quot;' : '&lt;');
		last = i + 1;
	}
	return escaped + str.substring(last);
}

/** @returns {string} */
function each(items, fn) {
	items = ensure_array_like(items);
	let str = '';
	for (let i = 0; i < items.length; i += 1) {
		str += fn(items[i], i);
	}
	return str;
}

const missing_component = {
	$$render: () => ''
};

function validate_component(component, name) {
	if (!component || !component.$$render) {
		if (name === 'svelte:component') name += ' this={...}';
		throw new Error(
			`<${name}> is not a valid SSR component. You may need to review your build config to ensure that dependencies are compiled, rather than imported as pre-compiled modules. Otherwise you may need to fix a <${name}>.`
		);
	}
	return component;
}

let on_destroy;

/** @returns {{ render: (props?: {}, { $$slots, context }?: { $$slots?: {}; context?: Map<any, any>; }) => { html: any; css: { code: string; map: any; }; head: string; }; $$render: (result: any, props: any, bindings: any, slots: any, context: any) => any; }} */
function create_ssr_component(fn) {
	function $$render(result, props, bindings, slots, context) {
		const parent_component = current_component;
		const $$ = {
			on_destroy,
			context: new Map(context || (parent_component ? parent_component.$$.context : [])),
			// these will be immediately discarded
			on_mount: [],
			before_update: [],
			after_update: [],
			callbacks: blank_object()
		};
		set_current_component({ $$ });
		const html = fn(result, props, bindings, slots);
		set_current_component(parent_component);
		return html;
	}
	return {
		render: (props = {}, { $$slots = {}, context = new Map() } = {}) => {
			on_destroy = [];
			const result = { title: '', head: '', css: new Set() };
			const html = $$render(result, props, {}, $$slots, context);
			run_all(on_destroy);
			return {
				html,
				css: {
					code: Array.from(result.css)
						.map((css) => css.code)
						.join('\n'),
					map: null // TODO
				},
				head: result.title + result.head
			};
		},
		$$render
	};
}

/** @returns {string} */
function add_attribute(name, value, boolean) {
	if (value == null || (boolean && !value)) return '';
	const assignment = boolean && value === true ? '' : `="${escape(value, true)}"`;
	return ` ${name}${assignment}`;
}

/* src/components/Input.svelte generated by Svelte v4.0.0 */

const css$f = {
	code: ".container.svelte-1fustul.svelte-1fustul{width:100%;max-width:50rem;height:25rem;margin:auto;background:#222;font-family:\"fira-sub\";padding:6rem 1.5rem 1.5rem 1.5rem;font-size:1.8rem;line-height:5rem;border-radius:3px;box-shadow:0 0 10px 3px rgba(0, 0, 0, 0.2);position:relative}.dots.svelte-1fustul.svelte-1fustul{position:absolute;left:10px;top:5px;width:80px;height:30px;display:flex;justify-content:flex-start;align-items:center}.dots.svelte-1fustul>span.svelte-1fustul{width:12px;height:12px;background:#eee;margin:0 5px;border-radius:50%}@media(max-width: 500px){.container.svelte-1fustul.svelte-1fustul{margin:0 5%;width:90%}}",
	map: "{\"version\":3,\"file\":\"Input.svelte\",\"sources\":[\"Input.svelte\"],\"sourcesContent\":[\"<script>\\n  import { typewriter } from \\\"./typewriter.js\\\";\\n\\n  export let input = [];\\n\\n  const colors = {\\n    yellow: \\\"#fdfd96\\\",\\n    teal: \\\"teal\\\",\\n    blue: \\\"cyan\\\",\\n    green: \\\"#98fb98\\\",\\n    grey: \\\"#fafafa\\\",\\n    red: \\\"#fa8072\\\",\\n    orange: \\\"darkorange\\\"\\n  };\\n\\n  const dots = [\\\"#fe5f56\\\", \\\"#ffbd2f\\\", \\\"#28c93f\\\"];\\n</script>\\n\\n<style>\\n  .container {\\n    width: 100%;\\n    max-width: 50rem;\\n    height: 25rem;\\n    margin: auto;\\n    background: #222;\\n    font-family: \\\"fira-sub\\\";\\n    padding: 6rem 1.5rem 1.5rem 1.5rem;\\n    font-size: 1.8rem;\\n    line-height: 5rem;\\n    border-radius: 3px;\\n    box-shadow: 0 0 10px 3px rgba(0, 0, 0, 0.2);\\n    position: relative;\\n  }\\n\\n  .dots {\\n    position: absolute;\\n    left: 10px;\\n    top: 5px;\\n    width: 80px;\\n    height: 30px;\\n    display: flex;\\n    justify-content: flex-start;\\n    align-items: center;\\n  }\\n\\n  .dots > span {\\n    width: 12px;\\n    height: 12px;\\n    background: #eee;\\n    margin: 0 5px;\\n    border-radius: 50%;\\n  }\\n\\n  @media (max-width: 500px) {\\n    .container {\\n      margin: 0 5%;\\n      width: 90%;\\n    }\\n  }\\n</style>\\n\\n<div class=\\\"container\\\">\\n  <div class=\\\"dots\\\">\\n    {#each dots as color}\\n      <span style=\\\"background:{color}\\\" />\\n    {/each}\\n  </div>\\n  {#if input.length}\\n    {#each input as line, i}\\n      <div class=\\\"line\\\" style=\\\"font-weight:{i === 0 ? 'bold' : 100};\\\">\\n        {#each line as { text, color, l } (text)}\\n          <span\\n            in:typewriter={{ delay: l * 100, speed: 100 }}\\n            style=\\\"color: {colors[color]};\\\">\\n            {text}\\n          </span>\\n        {/each}\\n      </div>\\n    {/each}\\n  {/if}\\n</div>\\n\"],\"names\":[],\"mappings\":\"AAmBE,wCAAW,CACT,KAAK,CAAE,IAAI,CACX,SAAS,CAAE,KAAK,CAChB,MAAM,CAAE,KAAK,CACb,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,IAAI,CAChB,WAAW,CAAE,UAAU,CACvB,OAAO,CAAE,IAAI,CAAC,MAAM,CAAC,MAAM,CAAC,MAAM,CAClC,SAAS,CAAE,MAAM,CACjB,WAAW,CAAE,IAAI,CACjB,aAAa,CAAE,GAAG,CAClB,UAAU,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,GAAG,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,GAAG,CAAC,CAC3C,QAAQ,CAAE,QACZ,CAEA,mCAAM,CACJ,QAAQ,CAAE,QAAQ,CAClB,IAAI,CAAE,IAAI,CACV,GAAG,CAAE,GAAG,CACR,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,OAAO,CAAE,IAAI,CACb,eAAe,CAAE,UAAU,CAC3B,WAAW,CAAE,MACf,CAEA,oBAAK,CAAG,mBAAK,CACX,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,IAAI,CAChB,MAAM,CAAE,CAAC,CAAC,GAAG,CACb,aAAa,CAAE,GACjB,CAEA,MAAO,YAAY,KAAK,CAAE,CACxB,wCAAW,CACT,MAAM,CAAE,CAAC,CAAC,EAAE,CACZ,KAAK,CAAE,GACT,CACF\"}"
};

const Input = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let { input = [] } = $$props;

	const colors = {
		yellow: "#fdfd96",
		teal: "teal",
		blue: "cyan",
		green: "#98fb98",
		grey: "#fafafa",
		red: "#fa8072",
		orange: "darkorange"
	};

	const dots = ["#fe5f56", "#ffbd2f", "#28c93f"];
	if ($$props.input === void 0 && $$bindings.input && input !== void 0) $$bindings.input(input);
	$$result.css.add(css$f);

	return `<div class="container svelte-1fustul"><div class="dots svelte-1fustul">${each(dots, color => {
		return `<span style="${"background:" + escape(color, true)}" class="svelte-1fustul"></span>`;
	})}</div> ${input.length
	? `${each(input, (line, i) => {
			return `<div class="line" style="${"font-weight:" + escape(i === 0 ? 'bold' : 100, true) + ";"}">${each(line, ({ text, color, l }) => {
				return `<span style="${"color: " + escape(colors[color], true) + ";"}">${escape(text)} </span>`;
			})} </div>`;
		})}`
	: ``}</div>`;
});

const subscriber_queue = [];

/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 *
 * https://svelte.dev/docs/svelte-store#writable
 * @template T
 * @param {T} [value] initial value
 * @param {import('./public.js').StartStopNotifier<T>} [start]
 * @returns {import('./public.js').Writable<T>}
 */
function writable(value, start = noop$1) {
	/** @type {import('./public.js').Unsubscriber} */
	let stop;
	/** @type {Set<import('./private.js').SubscribeInvalidateTuple<T>>} */
	const subscribers = new Set();
	/** @param {T} new_value
	 * @returns {void}
	 */
	function set(new_value) {
		if (safe_not_equal(value, new_value)) {
			value = new_value;
			if (stop) {
				// store is ready
				const run_queue = !subscriber_queue.length;
				for (const subscriber of subscribers) {
					subscriber[1]();
					subscriber_queue.push(subscriber, value);
				}
				if (run_queue) {
					for (let i = 0; i < subscriber_queue.length; i += 2) {
						subscriber_queue[i][0](subscriber_queue[i + 1]);
					}
					subscriber_queue.length = 0;
				}
			}
		}
	}

	/**
	 * @param {import('./public.js').Updater<T>} fn
	 * @returns {void}
	 */
	function update(fn) {
		set(fn(value));
	}

	/**
	 * @param {import('./public.js').Subscriber<T>} run
	 * @param {import('./private.js').Invalidator<T>} [invalidate]
	 * @returns {import('./public.js').Unsubscriber}
	 */
	function subscribe(run, invalidate = noop$1) {
		/** @type {import('./private.js').SubscribeInvalidateTuple<T>} */
		const subscriber = [run, invalidate];
		subscribers.add(subscriber);
		if (subscribers.size === 1) {
			stop = start(set, update) || noop$1;
		}
		run(value);
		return () => {
			subscribers.delete(subscriber);
			if (subscribers.size === 0 && stop) {
				stop();
				stop = null;
			}
		};
	}
	return { set, update, subscribe };
}

/**
 * @param {any} obj
 * @returns {boolean}
 */
function is_date(obj) {
	return Object.prototype.toString.call(obj) === '[object Date]';
}

/** @returns {(t: any) => any} */
function get_interpolator(a, b) {
	if (a === b || a !== a) return () => a;
	const type = typeof a;
	if (type !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
		throw new Error('Cannot interpolate values of different type');
	}
	if (Array.isArray(a)) {
		const arr = b.map((bi, i) => {
			return get_interpolator(a[i], bi);
		});
		return (t) => arr.map((fn) => fn(t));
	}
	if (type === 'object') {
		if (!a || !b) throw new Error('Object cannot be null');
		if (is_date(a) && is_date(b)) {
			a = a.getTime();
			b = b.getTime();
			const delta = b - a;
			return (t) => new Date(a + t * delta);
		}
		const keys = Object.keys(b);
		const interpolators = {};
		keys.forEach((key) => {
			interpolators[key] = get_interpolator(a[key], b[key]);
		});
		return (t) => {
			const result = {};
			keys.forEach((key) => {
				result[key] = interpolators[key](t);
			});
			return result;
		};
	}
	if (type === 'number') {
		const delta = b - a;
		return (t) => a + t * delta;
	}
	throw new Error(`Cannot interpolate ${type} values`);
}

/**
 * A tweened store in Svelte is a special type of store that provides smooth transitions between state values over time.
 *
 * https://svelte.dev/docs/svelte-motion#tweened
 * @template T
 * @param {T} [value]
 * @param {import('./private.js').TweenedOptions<T>} [defaults]
 * @returns {import('./public.js').Tweened<T>}
 */
function tweened(value, defaults = {}) {
	const store = writable(value);
	/** @type {import('../internal/private.js').Task} */
	let task;
	let target_value = value;
	/**
	 * @param {T} new_value
	 * @param {import('./private.js').TweenedOptions<T>} [opts]
	 */
	function set(new_value, opts) {
		if (value == null) {
			store.set((value = new_value));
			return Promise.resolve();
		}
		target_value = new_value;
		let previous_task = task;
		let started = false;
		let {
			delay = 0,
			duration = 400,
			easing = identity,
			interpolate = get_interpolator
		} = assign(assign({}, defaults), opts);
		if (duration === 0) {
			if (previous_task) {
				previous_task.abort();
				previous_task = null;
			}
			store.set((value = target_value));
			return Promise.resolve();
		}
		const start = now() + delay;
		let fn;
		task = loop((now) => {
			if (now < start) return true;
			if (!started) {
				fn = interpolate(value, new_value);
				if (typeof duration === 'function') duration = duration(value, new_value);
				started = true;
			}
			if (previous_task) {
				previous_task.abort();
				previous_task = null;
			}
			const elapsed = now - start;
			if (elapsed > /** @type {number} */ (duration)) {
				store.set((value = new_value));
				return false;
			}
			// @ts-ignore
			store.set((value = fn(easing(elapsed / duration))));
			return true;
		});
		return task.promise;
	}
	return {
		set,
		update: (fn, opts) => set(fn(target_value, value), opts),
		subscribe: store.subscribe
	};
}

/* src/components/Penguin.svelte generated by Svelte v4.0.0 */

const css$e = {
	code: ".one.svelte-7moaqf{margin-top:80px;width:64px;height:70px;margin:88px auto 0 auto}@media(max-width: 930px){.one.svelte-7moaqf{margin-top:63px}}",
	map: "{\"version\":3,\"file\":\"Penguin.svelte\",\"sources\":[\"Penguin.svelte\"],\"sourcesContent\":[\"<script>\\n  import { tweened } from \\\"svelte/motion\\\";\\n  import { onMount } from \\\"svelte\\\";\\n\\n  export let walk = false;\\n\\n  let pos = tweened(0);\\n  let flip;\\n  let walking = false;\\n  let innerWidth;\\n\\n  const make_duration = (a, b, d) => Math.abs(a - b) * d;\\n\\n  function start_walk() {\\n    walking = true;\\n    pos.set(to, { duration: make_duration($pos, from, 10) });\\n  }\\n\\n  function stop_walk() {\\n    walking = false;\\n    pos.set($pos, { duration: 0 });\\n  }\\n\\n  function correct_walk() {\\n    if (!walking) return;\\n\\n    const duration = flip\\n      ? make_duration($pos, from, 10)\\n      : make_duration($pos, to, 10);\\n\\n    pos.set(flip ? from : to, { duration });\\n  }\\n\\n  $: to = innerWidth > 500 ? 218 : (innerWidth * 0.9) / 2 - 32;\\n  $: from = innerWidth > 500 ? -218 : ((innerWidth * 0.9) / 2 - 32) * -1;\\n\\n  $: innerWidth && correct_walk();\\n\\n  $: walk && !walking && start_walk();\\n  $: !walk && walking && stop_walk();\\n\\n  $: $pos >= to &&\\n    (flip = true) &&\\n    pos.set(from, { duration: make_duration($pos, from, 10) });\\n\\n  $: $pos <= from &&\\n    !(flip = false) &&\\n    pos.set(to, { duration: make_duration($pos, to, 10) });\\n</script>\\n\\n<style>\\n  .one {\\n    margin-top: 80px;\\n    width: 64px;\\n    height: 70px;\\n    margin: 88px auto 0 auto;\\n  }\\n\\n  @media (max-width: 930px) {\\n    .one {\\n      margin-top: 63px;\\n    }\\n  }\\n</style>\\n\\n<svelte:window bind:innerWidth />\\n\\n<div\\n  class=\\\"one\\\"\\n  style=\\\"transform: translateX({$pos}px) rotateY({flip ? 180 : 0}deg);\\\">\\n\\n  <img alt=\\\"a penguing walking\\\" src=\\\"/penguin{walk ? '' : '_static'}.gif\\\" />\\n</div>\\n\"],\"names\":[],\"mappings\":\"AAmDE,kBAAK,CACH,UAAU,CAAE,IAAI,CAChB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,MAAM,CAAE,IAAI,CAAC,IAAI,CAAC,CAAC,CAAC,IACtB,CAEA,MAAO,YAAY,KAAK,CAAE,CACxB,kBAAK,CACH,UAAU,CAAE,IACd,CACF\"}"
};

const Penguin = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let to;
	let from;
	let $pos, $$unsubscribe_pos;
	let { walk = false } = $$props;
	let pos = tweened(0);
	$$unsubscribe_pos = subscribe(pos, value => $pos = value);
	let flip;
	let walking = false;
	let innerWidth;
	const make_duration = (a, b, d) => Math.abs(a - b) * d;

	function start_walk() {
		walking = true;
		pos.set(to, { duration: make_duration($pos, from, 10) });
	}

	function stop_walk() {
		walking = false;
		pos.set($pos, { duration: 0 });
	}

	if ($$props.walk === void 0 && $$bindings.walk && walk !== void 0) $$bindings.walk(walk);
	$$result.css.add(css$e);
	to = innerWidth * 0.9 / 2 - 32;

	from = (innerWidth * 0.9 / 2 - 32) * -1;
	walk && !walking && start_walk();
	!walk && walking && stop_walk();
	$pos >= to && (flip = true) && pos.set(from, { duration: make_duration($pos, from, 10) });
	$pos <= from && !(flip = false) && pos.set(to, { duration: make_duration($pos, to, 10) });
	$$unsubscribe_pos();
	return ` <div class="one svelte-7moaqf" style="${"transform: translateX(" + escape($pos, true) + "px) rotateY(" + escape(flip ? 180 : 0, true) + "deg);"}"><img alt="a penguing walking" src="${"/penguin" + escape(walk ? '' : '_static', true) + ".gif"}"></div>`;
});

/* src/components/Output.svelte generated by Svelte v4.0.0 */

const css$d = {
	code: ".container.svelte-17rekr8{text-align:center;font-family:sans-serif;height:30rem;margin-top:10rem}h1.svelte-17rekr8{font-weight:100;font-size:8rem;margin-bottom:0;margin:0;font-family:\"roboto-sub\";color:#333}p.svelte-17rekr8{margin:1rem 0;font-size:2.5rem;font-family:\"cat-sub\"}@media(max-width: 930px){.container.svelte-17rekr8{height:25rem}h1.svelte-17rekr8{font-size:6rem}}",
	map: "{\"version\":3,\"file\":\"Output.svelte\",\"sources\":[\"Output.svelte\"],\"sourcesContent\":[\"<script>\\n  import { typewriter } from \\\"./typewriter.js\\\";\\n\\n  import Penguin from \\\"./Penguin.svelte\\\";\\n  export let heading;\\n  export let paragraph;\\n  export let penguin;\\n  export let walk;\\n</script>\\n\\n<style>\\n  .container {\\n    text-align: center;\\n    font-family: sans-serif;\\n    height: 30rem;\\n    margin-top: 10rem;\\n  }\\n\\n  h1 {\\n    font-weight: 100;\\n    font-size: 8rem;\\n    margin-bottom: 0;\\n    margin: 0;\\n    font-family: \\\"roboto-sub\\\";\\n    color: #333;\\n  }\\n\\n  p {\\n    margin: 1rem 0;\\n    font-size: 2.5rem;\\n    font-family: \\\"cat-sub\\\";\\n  }\\n\\n  @media (max-width: 930px) {\\n    .container {\\n      height: 25rem;\\n    }\\n\\n    h1 {\\n      font-size: 6rem;\\n    }\\n  }\\n</style>\\n\\n<div class=\\\"container\\\">\\n  {#if heading.value}\\n    <h1 in:typewriter={{ delay: heading.l * 100, speed: 100 }}>\\n      {heading.value}\\n    </h1>\\n  {/if}\\n\\n  {#if paragraph.value}\\n    <p in:typewriter={{ delay: paragraph.l * 100, speed: 100 }}>\\n      {paragraph.value}\\n    </p>\\n  {/if}\\n\\n  {#if penguin}\\n    <Penguin {walk} />\\n  {/if}\\n</div>\\n\"],\"names\":[],\"mappings\":\"AAWE,yBAAW,CACT,UAAU,CAAE,MAAM,CAClB,WAAW,CAAE,UAAU,CACvB,MAAM,CAAE,KAAK,CACb,UAAU,CAAE,KACd,CAEA,iBAAG,CACD,WAAW,CAAE,GAAG,CAChB,SAAS,CAAE,IAAI,CACf,aAAa,CAAE,CAAC,CAChB,MAAM,CAAE,CAAC,CACT,WAAW,CAAE,YAAY,CACzB,KAAK,CAAE,IACT,CAEA,gBAAE,CACA,MAAM,CAAE,IAAI,CAAC,CAAC,CACd,SAAS,CAAE,MAAM,CACjB,WAAW,CAAE,SACf,CAEA,MAAO,YAAY,KAAK,CAAE,CACxB,yBAAW,CACT,MAAM,CAAE,KACV,CAEA,iBAAG,CACD,SAAS,CAAE,IACb,CACF\"}"
};

const Output$1 = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let { heading } = $$props;
	let { paragraph } = $$props;
	let { penguin } = $$props;
	let { walk } = $$props;
	if ($$props.heading === void 0 && $$bindings.heading && heading !== void 0) $$bindings.heading(heading);
	if ($$props.paragraph === void 0 && $$bindings.paragraph && paragraph !== void 0) $$bindings.paragraph(paragraph);
	if ($$props.penguin === void 0 && $$bindings.penguin && penguin !== void 0) $$bindings.penguin(penguin);
	if ($$props.walk === void 0 && $$bindings.walk && walk !== void 0) $$bindings.walk(walk);
	$$result.css.add(css$d);

	return `<div class="container svelte-17rekr8">${heading.value
	? `<h1 class="svelte-17rekr8">${escape(heading.value)}</h1>`
	: ``} ${paragraph.value
	? `<p class="svelte-17rekr8">${escape(paragraph.value)}</p>`
	: ``} ${penguin
	? `${validate_component(Penguin, "Penguin").$$render($$result, { walk }, {}, {})}`
	: ``}</div>`;
});

/* src/routes/index.svelte generated by Svelte v4.0.0 */
const _heading = "mdsvex";
const _paragraph = "svelte in markdown";

const Routes = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	const _input = [
		[
			{ color: "green", text: "#", l: 0 },
			{ color: "green", text: " mdsvex", l: 1 }
		],
		[
			{
				color: "grey",
				text: "svelte in markdown ",
				l: 0
			}
		],
		[
			{ color: "teal", text: "<", l: 0 },
			{ color: "blue", text: "Penguin", l: 1 },
			{ color: "teal", text: " />", l: 8 }
		]
	];

	let input = [];
	let heading = { value: "", l: 2 };
	let paragraph = { value: "", l: 0 };
	let penguin = false;
	let walk = false;
	const wait = t => new Promise(res => setTimeout(res, t));

	onMount(async () => {
		await wait(1000);
		input = [...input, _input[0]];
		heading.value = _heading;
		await wait(1000);
		input = [...input, _input[1]];
		paragraph.value = _paragraph;
		await wait(2500);
		input = [...input, _input[2]];
		await wait(1100);
		penguin = true;
		await wait(100);

		input[2] = [
			input[2][0],
			input[2][1],
			{ color: "yellow", text: " walk", l: 8 },
			{ color: "red", text: "=", l: 13 },
			{ color: "teal", text: "{", l: 14 },
			{ color: "orange", text: "true", l: 20 },
			{ color: "teal", text: "}", l: 15 },
			{ color: "teal", text: " />", l: 8 }
		];

		await wait(3000);
		walk = true;
	});

	return `${($$result.head += `<link rel="preload" as="font" crossorigin href="/fonts/roboto-thin-webfont.woff2">${($$result.title = `<title>mdsvex - markdown in svelte!</title>`, "")}`, "")} <main>${validate_component(Output$1, "Output").$$render($$result, { heading, paragraph, penguin, walk }, {}, {})} ${validate_component(Input, "Input").$$render($$result, { input }, {}, {})}</main>`;
});

var component_0 = /*#__PURE__*/Object.freeze({
	__proto__: null,
	'default': Routes
});

/* src/components/Repl/SplitPane.svelte generated by Svelte v4.0.0 */

const css$c = {
	code: ".container.svelte-oir88r{position:relative;width:100%;height:100%}.pane.svelte-oir88r{position:relative;float:left;width:100%;height:100%;overflow:auto}.mousecatcher.svelte-oir88r{position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(255, 255, 255, 0.01)}.divider.svelte-oir88r{position:absolute;z-index:10;display:none}.divider.svelte-oir88r::after{content:\"\";position:absolute;background-color:#eee}.horizontal.svelte-oir88r{padding:0 8px;width:0;height:100%;cursor:ew-resize}.horizontal.svelte-oir88r::after{left:8px;top:0;width:1px;height:100%}.vertical.svelte-oir88r{padding:8px 0;width:100%;height:0;cursor:ns-resize}.vertical.svelte-oir88r::after{top:8px;left:0;width:100%;height:1px}.left.svelte-oir88r,.right.svelte-oir88r,.divider.svelte-oir88r{display:block}.left.svelte-oir88r,.right.svelte-oir88r{height:100%;float:left}.top.svelte-oir88r,.bottom.svelte-oir88r{position:absolute;width:100%}.top.svelte-oir88r{top:0}.bottom.svelte-oir88r{bottom:0}",
	map: "{\"version\":3,\"file\":\"SplitPane.svelte\",\"sources\":[\"SplitPane.svelte\"],\"sourcesContent\":[\"<script>\\n  import * as yootils from \\\"yootils\\\";\\n  import { createEventDispatcher } from \\\"svelte\\\";\\n\\n  const dispatch = createEventDispatcher();\\n\\n  export let type;\\n  export let pos = 50;\\n  export let fixed = false;\\n  export let buffer = 40;\\n  export let min;\\n  export let max;\\n\\n  let w;\\n  let h;\\n  $: size = type === \\\"vertical\\\" ? h : w;\\n\\n  $: min = 100 * (buffer / size);\\n  $: max = 100 - min;\\n  $: pos = yootils.clamp(pos, min, max);\\n\\n  const refs = {};\\n\\n  let dragging = false;\\n\\n  function setPos(event) {\\n    const { top, left } = refs.container.getBoundingClientRect();\\n\\n    const px = type === \\\"vertical\\\" ? event.clientY - top : event.clientX - left;\\n\\n    pos = (100 * px) / size;\\n    dispatch(\\\"change\\\");\\n  }\\n\\n  function drag(node, callback) {\\n    const mousedown = event => {\\n      if (event.which !== 1) return;\\n\\n      event.preventDefault();\\n\\n      dragging = true;\\n\\n      const onmouseup = () => {\\n        dragging = false;\\n\\n        window.removeEventListener(\\\"mousemove\\\", callback, false);\\n        window.removeEventListener(\\\"mouseup\\\", onmouseup, false);\\n      };\\n\\n      window.addEventListener(\\\"mousemove\\\", callback, false);\\n      window.addEventListener(\\\"mouseup\\\", onmouseup, false);\\n    };\\n\\n    node.addEventListener(\\\"mousedown\\\", mousedown, false);\\n\\n    return {\\n      destroy() {\\n        node.removeEventListener(\\\"mousedown\\\", onmousedown, false);\\n      }\\n    };\\n  }\\n\\n  $: side = type === \\\"horizontal\\\" ? \\\"left\\\" : \\\"top\\\";\\n  $: dimension = type === \\\"horizontal\\\" ? \\\"width\\\" : \\\"height\\\";\\n</script>\\n\\n<style>\\n  .container {\\n    position: relative;\\n    width: 100%;\\n    height: 100%;\\n  }\\n\\n  .pane {\\n    position: relative;\\n    float: left;\\n    width: 100%;\\n    height: 100%;\\n    overflow: auto;\\n  }\\n\\n  .mousecatcher {\\n    position: absolute;\\n    left: 0;\\n    top: 0;\\n    width: 100%;\\n    height: 100%;\\n    background: rgba(255, 255, 255, 0.01);\\n  }\\n\\n  .divider {\\n    position: absolute;\\n    z-index: 10;\\n    display: none;\\n  }\\n\\n  .divider::after {\\n    content: \\\"\\\";\\n    position: absolute;\\n    background-color: #eee;\\n  }\\n\\n  .horizontal {\\n    padding: 0 8px;\\n    width: 0;\\n    height: 100%;\\n    cursor: ew-resize;\\n  }\\n\\n  .horizontal::after {\\n    left: 8px;\\n    top: 0;\\n    width: 1px;\\n    height: 100%;\\n  }\\n\\n  .vertical {\\n    padding: 8px 0;\\n    width: 100%;\\n    height: 0;\\n    cursor: ns-resize;\\n  }\\n\\n  .vertical::after {\\n    top: 8px;\\n    left: 0;\\n    width: 100%;\\n    height: 1px;\\n  }\\n\\n  .left,\\n  .right,\\n  .divider {\\n    display: block;\\n  }\\n\\n  .left,\\n  .right {\\n    height: 100%;\\n    float: left;\\n  }\\n\\n  .top,\\n  .bottom {\\n    position: absolute;\\n    width: 100%;\\n  }\\n\\n  .top {\\n    top: 0;\\n  }\\n  .bottom {\\n    bottom: 0;\\n  }\\n</style>\\n\\n<div\\n  class=\\\"container\\\"\\n  bind:this={refs.container}\\n  bind:clientWidth={w}\\n  bind:clientHeight={h}>\\n  <div class=\\\"pane\\\" style=\\\"{dimension}: {pos}%;\\\">\\n    <slot name=\\\"a\\\" />\\n  </div>\\n\\n  <div class=\\\"pane\\\" style=\\\"{dimension}: {100 - pos}%;\\\">\\n    <slot name=\\\"b\\\" />\\n  </div>\\n\\n  {#if !fixed}\\n    <div\\n      class=\\\"{type} divider\\\"\\n      style=\\\"{side}: calc({pos}% - 8px)\\\"\\n      use:drag={setPos} />\\n  {/if}\\n</div>\\n\\n{#if dragging}\\n  <div class=\\\"mousecatcher\\\" />\\n{/if}\\n\"],\"names\":[],\"mappings\":\"AAmEE,wBAAW,CACT,QAAQ,CAAE,QAAQ,CAClB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IACV,CAEA,mBAAM,CACJ,QAAQ,CAAE,QAAQ,CAClB,KAAK,CAAE,IAAI,CACX,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,QAAQ,CAAE,IACZ,CAEA,2BAAc,CACZ,QAAQ,CAAE,QAAQ,CAClB,IAAI,CAAE,CAAC,CACP,GAAG,CAAE,CAAC,CACN,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,IAAI,CACtC,CAEA,sBAAS,CACP,QAAQ,CAAE,QAAQ,CAClB,OAAO,CAAE,EAAE,CACX,OAAO,CAAE,IACX,CAEA,sBAAQ,OAAQ,CACd,OAAO,CAAE,EAAE,CACX,QAAQ,CAAE,QAAQ,CAClB,gBAAgB,CAAE,IACpB,CAEA,yBAAY,CACV,OAAO,CAAE,CAAC,CAAC,GAAG,CACd,KAAK,CAAE,CAAC,CACR,MAAM,CAAE,IAAI,CACZ,MAAM,CAAE,SACV,CAEA,yBAAW,OAAQ,CACjB,IAAI,CAAE,GAAG,CACT,GAAG,CAAE,CAAC,CACN,KAAK,CAAE,GAAG,CACV,MAAM,CAAE,IACV,CAEA,uBAAU,CACR,OAAO,CAAE,GAAG,CAAC,CAAC,CACd,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,CAAC,CACT,MAAM,CAAE,SACV,CAEA,uBAAS,OAAQ,CACf,GAAG,CAAE,GAAG,CACR,IAAI,CAAE,CAAC,CACP,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,GACV,CAEA,mBAAK,CACL,oBAAM,CACN,sBAAS,CACP,OAAO,CAAE,KACX,CAEA,mBAAK,CACL,oBAAO,CACL,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,IACT,CAEA,kBAAI,CACJ,qBAAQ,CACN,QAAQ,CAAE,QAAQ,CAClB,KAAK,CAAE,IACT,CAEA,kBAAK,CACH,GAAG,CAAE,CACP,CACA,qBAAQ,CACN,MAAM,CAAE,CACV\"}"
};

const SplitPane = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let size;
	let side;
	let dimension;
	createEventDispatcher();
	let { type } = $$props;
	let { pos = 50 } = $$props;
	let { fixed = false } = $$props;
	let { buffer = 40 } = $$props;
	let { min } = $$props;
	let { max } = $$props;
	let w;
	let h;
	const refs = {};

	if ($$props.type === void 0 && $$bindings.type && type !== void 0) $$bindings.type(type);
	if ($$props.pos === void 0 && $$bindings.pos && pos !== void 0) $$bindings.pos(pos);
	if ($$props.fixed === void 0 && $$bindings.fixed && fixed !== void 0) $$bindings.fixed(fixed);
	if ($$props.buffer === void 0 && $$bindings.buffer && buffer !== void 0) $$bindings.buffer(buffer);
	if ($$props.min === void 0 && $$bindings.min && min !== void 0) $$bindings.min(min);
	if ($$props.max === void 0 && $$bindings.max && max !== void 0) $$bindings.max(max);
	$$result.css.add(css$c);
	size = type === "vertical" ? h : w;
	min = 100 * (buffer / size);
	max = 100 - min;
	pos = yootils.clamp(pos, min, max);
	side = type === "horizontal" ? "left" : "top";
	dimension = type === "horizontal" ? "width" : "height";

	return `<div class="container svelte-oir88r"${add_attribute("this", refs.container, 0)}><div class="pane svelte-oir88r" style="${escape(dimension, true) + ": " + escape(pos, true) + "%;"}">${slots.a ? slots.a({}) : ``}</div> <div class="pane svelte-oir88r" style="${escape(dimension, true) + ": " + escape(100 - pos, true) + "%;"}">${slots.b ? slots.b({}) : ``}</div> ${!fixed
	? `<div class="${escape(type, true) + " divider" + " svelte-oir88r"}" style="${escape(side, true) + ": calc(" + escape(pos, true) + "% - 8px)"}"></div>`
	: ``}</div> ${``}`;
});

/* src/components/Repl/Input/ComponentSelector.svelte generated by Svelte v4.0.0 */

const css$b = {
	code: ".component-selector.svelte-1np0xcs.svelte-1np0xcs{position:relative;overflow:hidden}.file-tabs.svelte-1np0xcs.svelte-1np0xcs{border:none;margin:0;white-space:nowrap;overflow-x:auto;overflow-y:hidden;padding:10px 15px}.file-tabs.svelte-1np0xcs .button.svelte-1np0xcs,.file-tabs.svelte-1np0xcs button.svelte-1np0xcs{position:relative;display:inline-block;font:400 12px/1.5 var(--font);font-size:1.5rem;border:none;padding:12px 34px 8px 8px;margin:0;border-radius:0}.file-tabs.svelte-1np0xcs .button.svelte-1np0xcs:first-child{padding-left:12px}.file-tabs.svelte-1np0xcs .button.active.svelte-1np0xcs{font-size:1.6rem;font-weight:bold}.editable.svelte-1np0xcs.svelte-1np0xcs,.uneditable.svelte-1np0xcs.svelte-1np0xcs,.input-sizer.svelte-1np0xcs.svelte-1np0xcs,input.svelte-1np0xcs.svelte-1np0xcs{display:inline-block;position:relative;line-height:1}.input-sizer.svelte-1np0xcs.svelte-1np0xcs{color:#ccc}input.svelte-1np0xcs.svelte-1np0xcs{position:absolute;width:100%;left:8px;top:12px;font:400 12px/1.5 var(--font);border:none;color:var(--flash);outline:none;background-color:transparent}.remove.svelte-1np0xcs.svelte-1np0xcs{position:absolute;display:none;right:1px;top:4px;width:16px;text-align:right;padding:12px 0 12px 5px;font-size:8px;cursor:pointer}.remove.svelte-1np0xcs.svelte-1np0xcs:hover{color:var(--flash)}.file-tabs.svelte-1np0xcs .button.active .editable.svelte-1np0xcs{cursor:text}.file-tabs.svelte-1np0xcs .button.active .remove.svelte-1np0xcs{display:block}.add-new.svelte-1np0xcs.svelte-1np0xcs{position:absolute;left:0;top:0;padding:12px 10px 8px 0 !important;height:40px;text-align:center}.add-new.svelte-1np0xcs.svelte-1np0xcs:hover{color:var(--flash) !important}svg.svelte-1np0xcs.svelte-1np0xcs{position:relative;overflow:hidden;vertical-align:middle;-o-object-fit:contain;object-fit:contain;-webkit-transform-origin:center center;transform-origin:center center;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none;transform:translate(-12px, 3px)}.file-tabs.funky.svelte-1np0xcs.svelte-1np0xcs{display:flex;justify-content:center;background:#fafafa}.file-tabs.svelte-1np0xcs .button.funky.svelte-1np0xcs,.file-tabs.svelte-1np0xcs .button.funky.active.svelte-1np0xcs{border-left:1px solid #ddd;border-bottom:none;background:transparent}.button.funky.svelte-1np0xcs.svelte-1np0xcs:last-child{border-left:1px solid #ddd;border-right:1px solid #ddd}",
	map: "{\"version\":3,\"file\":\"ComponentSelector.svelte\",\"sources\":[\"ComponentSelector.svelte\"],\"sourcesContent\":[\"<script>\\n  import { getContext } from \\\"svelte\\\";\\n\\n  export let handle_select;\\n  export let funky;\\n\\n  let { components, selected, request_focus, rebundle } = getContext(\\\"REPL\\\");\\n\\n  let editing = null;\\n\\n  function selectComponent(component) {\\n    if ($selected !== component) {\\n      editing = null;\\n      handle_select(component);\\n    }\\n  }\\n\\n  function editTab(component) {\\n    if ($selected === component) {\\n      editing = $selected;\\n    }\\n  }\\n\\n  function closeEdit() {\\n    const match = /(.+)\\\\.(svelte|svx|js)$/.exec($selected.name);\\n    $selected.name = match ? match[1] : $selected.name;\\n    if (isComponentNameUsed($selected)) {\\n      $selected.name = $selected.name + \\\"_1\\\";\\n    }\\n    if (match && match[2]) $selected.type = match[2];\\n\\n    editing = null;\\n\\n    // re-select, in case the type changed\\n    handle_select($selected);\\n\\n    components = components; // TODO necessary?\\n\\n    // focus the editor, but wait a beat (so key events aren't misdirected)\\n    setTimeout(request_focus);\\n\\n    rebundle();\\n  }\\n\\n  function remove(component) {\\n    let result = confirm(\\n      `Are you sure you want to delete ${component.name}.${component.type}?`\\n    );\\n\\n    if (result) {\\n      const index = $components.indexOf(component);\\n\\n      if (~index) {\\n        components.set(\\n          $components.slice(0, index).concat($components.slice(index + 1))\\n        );\\n      } else {\\n        console.error(`Could not find component! That's... odd`);\\n      }\\n\\n      handle_select($components[index] || $components[$components.length - 1]);\\n    }\\n  }\\n\\n  function selectInput(event) {\\n    setTimeout(() => {\\n      event.target.select();\\n    });\\n  }\\n\\n  let uid = 1;\\n\\n  function addNew() {\\n    const component = {\\n      name: uid++ ? `Component${uid}` : \\\"Component1\\\",\\n      type: \\\"svelte\\\",\\n      source: \\\"\\\",\\n    };\\n\\n    editing = component;\\n\\n    setTimeout(() => {\\n      // TODO we can do this without IDs\\n      document.getElementById(component.name).scrollIntoView(false);\\n    });\\n\\n    components.update((components) => components.concat(component));\\n    handle_select(component);\\n  }\\n\\n  function isComponentNameUsed(editing) {\\n    return $components.find(\\n      (component) => component !== editing && component.name === editing.name\\n    );\\n  }\\n</script>\\n\\n<style>\\n  .component-selector {\\n    position: relative;\\n    overflow: hidden;\\n  }\\n\\n  .file-tabs {\\n    border: none;\\n    margin: 0;\\n    white-space: nowrap;\\n    overflow-x: auto;\\n    overflow-y: hidden;\\n    padding: 10px 15px;\\n  }\\n\\n  .file-tabs .button,\\n  .file-tabs button {\\n    position: relative;\\n    display: inline-block;\\n    font: 400 12px/1.5 var(--font);\\n    font-size: 1.5rem;\\n    border: none;\\n    padding: 12px 34px 8px 8px;\\n    margin: 0;\\n    border-radius: 0;\\n  }\\n\\n  .file-tabs .button:first-child {\\n    padding-left: 12px;\\n  }\\n\\n  .file-tabs .button.active {\\n    font-size: 1.6rem;\\n    font-weight: bold;\\n  }\\n\\n  .editable,\\n  .uneditable,\\n  .input-sizer,\\n  input {\\n    display: inline-block;\\n    position: relative;\\n    line-height: 1;\\n  }\\n\\n  .input-sizer {\\n    color: #ccc;\\n  }\\n\\n  input {\\n    position: absolute;\\n    width: 100%;\\n    left: 8px;\\n    top: 12px;\\n    font: 400 12px/1.5 var(--font);\\n    border: none;\\n    color: var(--flash);\\n    outline: none;\\n    background-color: transparent;\\n  }\\n\\n  .remove {\\n    position: absolute;\\n    display: none;\\n    right: 1px;\\n    top: 4px;\\n    width: 16px;\\n    text-align: right;\\n    padding: 12px 0 12px 5px;\\n    font-size: 8px;\\n    cursor: pointer;\\n  }\\n\\n  .remove:hover {\\n    color: var(--flash);\\n  }\\n\\n  .file-tabs .button.active .editable {\\n    cursor: text;\\n  }\\n\\n  .file-tabs .button.active .remove {\\n    display: block;\\n  }\\n\\n  .add-new {\\n    position: absolute;\\n    left: 0;\\n    top: 0;\\n    padding: 12px 10px 8px 0 !important;\\n    height: 40px;\\n    text-align: center;\\n  }\\n\\n  .add-new:hover {\\n    color: var(--flash) !important;\\n  }\\n\\n  svg {\\n    position: relative;\\n    overflow: hidden;\\n    vertical-align: middle;\\n    -o-object-fit: contain;\\n    object-fit: contain;\\n    -webkit-transform-origin: center center;\\n    transform-origin: center center;\\n    stroke: currentColor;\\n    stroke-width: 2;\\n    stroke-linecap: round;\\n    stroke-linejoin: round;\\n    fill: none;\\n    transform: translate(-12px, 3px);\\n  }\\n\\n  .file-tabs.funky {\\n    display: flex;\\n    justify-content: center;\\n    background: #fafafa;\\n  }\\n\\n  .file-tabs .button.funky,\\n  .file-tabs .button.funky.active {\\n    border-left: 1px solid #ddd;\\n    border-bottom: none;\\n    background: transparent;\\n  }\\n\\n  .button.funky:last-child {\\n    border-left: 1px solid #ddd;\\n    border-right: 1px solid #ddd;\\n  }\\n</style>\\n\\n<div class=\\\"component-selector\\\">\\n  {#if $components.length}\\n    <div class=\\\"file-tabs\\\" on:dblclick={addNew} class:funky>\\n      {#each $components as component, index}\\n        <div\\n          id={component.name}\\n          class=\\\"button\\\"\\n          role=\\\"button\\\"\\n          class:active={component === $selected}\\n          class:funky\\n          on:click={() => selectComponent(component)}\\n          on:dblclick={(e) => e.stopPropagation()}>\\n          {#if component.name == 'App' && index === 0}\\n            <div class=\\\"uneditable\\\">App.{component.type}</div>\\n          {:else if component === editing}\\n            <span class=\\\"input-sizer\\\">\\n              {editing.name + (/\\\\./.test(editing.name) ? '' : `.${editing.type}`)}\\n            </span>\\n\\n            <!-- svelte-ignore a11y-autofocus -->\\n            <input\\n              autofocus\\n              spellcheck={false}\\n              bind:value={editing.name}\\n              on:focus={selectInput}\\n              on:blur={closeEdit}\\n              on:keydown={(e) => e.which === 13 && !isComponentNameUsed(editing) && e.target.blur()}\\n              class:duplicate={isComponentNameUsed(editing)} />\\n          {:else}\\n            <div\\n              class=\\\"editable\\\"\\n              title=\\\"edit component name\\\"\\n              on:click={() => editTab(component)}>\\n              {component.name}.{component.type}\\n            </div>\\n\\n            {#if !funky}\\n              <span class=\\\"remove\\\" on:click={() => remove(component)}>\\n                <svg width=\\\"12\\\" height=\\\"12\\\" viewBox=\\\"0 0 24 24\\\">\\n                  <line stroke=\\\"#999\\\" x1=\\\"18\\\" y1=\\\"6\\\" x2=\\\"6\\\" y2=\\\"18\\\" />\\n                  <line stroke=\\\"#999\\\" x1=\\\"6\\\" y1=\\\"6\\\" x2=\\\"18\\\" y2=\\\"18\\\" />\\n                </svg>\\n              </span>\\n            {/if}\\n          {/if}\\n        </div>\\n      {/each}\\n\\n      {#if !funky}\\n        <button class=\\\"add-new\\\" on:click={addNew} title=\\\"add new component\\\">\\n          <svg width=\\\"12\\\" height=\\\"12\\\" viewBox=\\\"0 0 24 24\\\">\\n            <line stroke=\\\"#999\\\" x1=\\\"12\\\" y1=\\\"5\\\" x2=\\\"12\\\" y2=\\\"19\\\" />\\n            <line stroke=\\\"#999\\\" x1=\\\"5\\\" y1=\\\"12\\\" x2=\\\"19\\\" y2=\\\"12\\\" />\\n          </svg>\\n        </button>\\n      {/if}\\n    </div>\\n  {/if}\\n</div>\\n\"],\"names\":[],\"mappings\":\"AAkGE,iDAAoB,CAClB,QAAQ,CAAE,QAAQ,CAClB,QAAQ,CAAE,MACZ,CAEA,wCAAW,CACT,MAAM,CAAE,IAAI,CACZ,MAAM,CAAE,CAAC,CACT,WAAW,CAAE,MAAM,CACnB,UAAU,CAAE,IAAI,CAChB,UAAU,CAAE,MAAM,CAClB,OAAO,CAAE,IAAI,CAAC,IAChB,CAEA,yBAAU,CAAC,sBAAO,CAClB,yBAAU,CAAC,qBAAO,CAChB,QAAQ,CAAE,QAAQ,CAClB,OAAO,CAAE,YAAY,CACrB,IAAI,CAAE,GAAG,CAAC,IAAI,CAAC,GAAG,CAAC,IAAI,MAAM,CAAC,CAC9B,SAAS,CAAE,MAAM,CACjB,MAAM,CAAE,IAAI,CACZ,OAAO,CAAE,IAAI,CAAC,IAAI,CAAC,GAAG,CAAC,GAAG,CAC1B,MAAM,CAAE,CAAC,CACT,aAAa,CAAE,CACjB,CAEA,yBAAU,CAAC,sBAAO,YAAa,CAC7B,YAAY,CAAE,IAChB,CAEA,yBAAU,CAAC,OAAO,sBAAQ,CACxB,SAAS,CAAE,MAAM,CACjB,WAAW,CAAE,IACf,CAEA,uCAAS,CACT,yCAAW,CACX,0CAAY,CACZ,mCAAM,CACJ,OAAO,CAAE,YAAY,CACrB,QAAQ,CAAE,QAAQ,CAClB,WAAW,CAAE,CACf,CAEA,0CAAa,CACX,KAAK,CAAE,IACT,CAEA,mCAAM,CACJ,QAAQ,CAAE,QAAQ,CAClB,KAAK,CAAE,IAAI,CACX,IAAI,CAAE,GAAG,CACT,GAAG,CAAE,IAAI,CACT,IAAI,CAAE,GAAG,CAAC,IAAI,CAAC,GAAG,CAAC,IAAI,MAAM,CAAC,CAC9B,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,IAAI,OAAO,CAAC,CACnB,OAAO,CAAE,IAAI,CACb,gBAAgB,CAAE,WACpB,CAEA,qCAAQ,CACN,QAAQ,CAAE,QAAQ,CAClB,OAAO,CAAE,IAAI,CACb,KAAK,CAAE,GAAG,CACV,GAAG,CAAE,GAAG,CACR,KAAK,CAAE,IAAI,CACX,UAAU,CAAE,KAAK,CACjB,OAAO,CAAE,IAAI,CAAC,CAAC,CAAC,IAAI,CAAC,GAAG,CACxB,SAAS,CAAE,GAAG,CACd,MAAM,CAAE,OACV,CAEA,qCAAO,MAAO,CACZ,KAAK,CAAE,IAAI,OAAO,CACpB,CAEA,yBAAU,CAAC,OAAO,OAAO,CAAC,wBAAU,CAClC,MAAM,CAAE,IACV,CAEA,yBAAU,CAAC,OAAO,OAAO,CAAC,sBAAQ,CAChC,OAAO,CAAE,KACX,CAEA,sCAAS,CACP,QAAQ,CAAE,QAAQ,CAClB,IAAI,CAAE,CAAC,CACP,GAAG,CAAE,CAAC,CACN,OAAO,CAAE,IAAI,CAAC,IAAI,CAAC,GAAG,CAAC,CAAC,CAAC,UAAU,CACnC,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,MACd,CAEA,sCAAQ,MAAO,CACb,KAAK,CAAE,IAAI,OAAO,CAAC,CAAC,UACtB,CAEA,iCAAI,CACF,QAAQ,CAAE,QAAQ,CAClB,QAAQ,CAAE,MAAM,CAChB,cAAc,CAAE,MAAM,CACtB,aAAa,CAAE,OAAO,CACtB,UAAU,CAAE,OAAO,CACnB,wBAAwB,CAAE,MAAM,CAAC,MAAM,CACvC,gBAAgB,CAAE,MAAM,CAAC,MAAM,CAC/B,MAAM,CAAE,YAAY,CACpB,YAAY,CAAE,CAAC,CACf,cAAc,CAAE,KAAK,CACrB,eAAe,CAAE,KAAK,CACtB,IAAI,CAAE,IAAI,CACV,SAAS,CAAE,UAAU,KAAK,CAAC,CAAC,GAAG,CACjC,CAEA,UAAU,oCAAO,CACf,OAAO,CAAE,IAAI,CACb,eAAe,CAAE,MAAM,CACvB,UAAU,CAAE,OACd,CAEA,yBAAU,CAAC,OAAO,qBAAM,CACxB,yBAAU,CAAC,OAAO,MAAM,sBAAQ,CAC9B,WAAW,CAAE,GAAG,CAAC,KAAK,CAAC,IAAI,CAC3B,aAAa,CAAE,IAAI,CACnB,UAAU,CAAE,WACd,CAEA,OAAO,oCAAM,WAAY,CACvB,WAAW,CAAE,GAAG,CAAC,KAAK,CAAC,IAAI,CAC3B,YAAY,CAAE,GAAG,CAAC,KAAK,CAAC,IAC1B\"}"
};

const ComponentSelector = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let $components,
		$$unsubscribe_components = noop$1,
		$$subscribe_components = () => ($$unsubscribe_components(), $$unsubscribe_components = subscribe(components, $$value => $components = $$value), components);

	let $selected, $$unsubscribe_selected;
	let { handle_select } = $$props;
	let { funky } = $$props;
	let { components, selected, request_focus, rebundle } = getContext("REPL");
	$$subscribe_components();
	$$unsubscribe_selected = subscribe(selected, value => $selected = value);
	let editing = null;

	function isComponentNameUsed(editing) {
		return $components.find(component => component !== editing && component.name === editing.name);
	}

	if ($$props.handle_select === void 0 && $$bindings.handle_select && handle_select !== void 0) $$bindings.handle_select(handle_select);
	if ($$props.funky === void 0 && $$bindings.funky && funky !== void 0) $$bindings.funky(funky);
	$$result.css.add(css$b);
	$$unsubscribe_components();
	$$unsubscribe_selected();

	return `<div class="component-selector svelte-1np0xcs">${$components.length
	? `<div class="${["file-tabs svelte-1np0xcs", funky ? "funky" : ""].join(' ').trim()}">${each($components, (component, index) => {
			return `<div${add_attribute("id", component.name, 0)} class="${[
				"button svelte-1np0xcs",
				(component === $selected ? "active" : "") + ' ' + (funky ? "funky" : "")
			].join(' ').trim()}" role="button">${component.name == 'App' && index === 0
			? `<div class="uneditable svelte-1np0xcs">App.${escape(component.type)}</div>`
			: `${component === editing
				? `<span class="input-sizer svelte-1np0xcs">${escape(editing.name + ((/\./).test(editing.name) ? '' : `.${editing.type}`))}</span>  <input autofocus${add_attribute("spellcheck", false, 0)} class="${["svelte-1np0xcs", isComponentNameUsed(editing) ? "duplicate" : ""].join(' ').trim()}"${add_attribute("value", editing.name, 0)}>`
				: `<div class="editable svelte-1np0xcs" title="edit component name">${escape(component.name)}.${escape(component.type)}</div> ${!funky
					? `<span class="remove svelte-1np0xcs"><svg width="12" height="12" viewBox="0 0 24 24" class="svelte-1np0xcs"><line stroke="#999" x1="18" y1="6" x2="6" y2="18"></line><line stroke="#999" x1="6" y1="6" x2="18" y2="18"></line></svg> </span>`
					: ``}`}`} </div>`;
		})} ${!funky
		? `<button class="add-new svelte-1np0xcs" title="add new component"><svg width="12" height="12" viewBox="0 0 24 24" class="svelte-1np0xcs"><line stroke="#999" x1="12" y1="5" x2="12" y2="19"></line><line stroke="#999" x1="5" y1="12" x2="19" y2="12"></line></svg></button>`
		: ``}</div>`
	: ``}</div>`;
});

/* src/components/Repl/Message.svelte generated by Svelte v4.0.0 */

const css$a = {
	code: ".message.svelte-9488n4{position:relative;color:white;padding:12px 16px 12px 44px;font:400 12px/1.7 var(--font);margin:0;border-top:1px solid white}.navigable.svelte-9488n4{cursor:pointer}.message.svelte-9488n4::before{content:'!';position:absolute;left:12px;top:10px;text-align:center;line-height:1;padding:4px;border-radius:50%;color:white;border:2px solid white;box-sizing:content-box;width:10px;height:10px;font-size:11px;font-weight:700}.truncate.svelte-9488n4{white-space:pre;overflow-x:hidden;text-overflow:ellipsis}p.svelte-9488n4{margin:0}.error.svelte-9488n4{background-color:#da106e}.warning.svelte-9488n4{background-color:#e47e0a}.info.svelte-9488n4{background-color:var(--second)}",
	map: "{\"version\":3,\"file\":\"Message.svelte\",\"sources\":[\"Message.svelte\"],\"sourcesContent\":[\"<script>\\n\\timport { getContext } from 'svelte';\\n\\timport { slide } from 'svelte/transition';\\n\\n\\tconst { navigate } = getContext('REPL');\\n\\n\\texport let kind;\\n\\texport let details = null;\\n\\texport let filename = null;\\n\\texport let truncate;\\n\\n\\tfunction message(details) {\\n\\t\\tlet str = details.message || '[missing message]';\\n\\n\\t\\tlet loc = [];\\n\\n\\t\\tif (details.filename && details.filename !== filename) {\\n\\t\\t\\tloc.push(details.filename);\\n\\t\\t}\\n\\n\\t\\tif (details.start) loc.push(details.start.line, details.start.column);\\n\\n\\t\\treturn str + (loc.length ? ` (${loc.join(':')})` : ``);\\n\\t};\\n</script>\\n\\n<style>\\n\\t.message {\\n\\t\\tposition: relative;\\n\\t\\tcolor: white;\\n\\t\\tpadding: 12px 16px 12px 44px;\\n\\t\\tfont: 400 12px/1.7 var(--font);\\n\\t\\tmargin: 0;\\n\\t\\tborder-top: 1px solid white;\\n\\t}\\n\\n\\t.navigable {\\n\\t\\tcursor: pointer;\\n\\t}\\n\\n\\t.message::before {\\n\\t\\tcontent: '!';\\n\\t\\tposition: absolute;\\n\\t\\tleft: 12px;\\n\\t\\ttop: 10px;\\n\\t\\ttext-align: center;\\n\\t\\tline-height: 1;\\n\\t\\tpadding: 4px;\\n\\t\\tborder-radius: 50%;\\n\\t\\tcolor: white;\\n\\t\\tborder: 2px solid white;\\n\\t\\tbox-sizing: content-box;\\n\\t\\twidth: 10px;\\n\\t\\theight: 10px;\\n\\t\\tfont-size: 11px;\\n\\t\\tfont-weight: 700;\\n\\t}\\n\\n\\t.truncate {\\n\\t\\twhite-space: pre;\\n\\t\\toverflow-x: hidden;\\n\\t\\ttext-overflow: ellipsis;\\n\\t}\\n\\n\\tp {\\n\\t\\tmargin: 0;\\n\\t}\\n\\n\\t.error {\\n\\t\\tbackground-color: #da106e;\\n\\t}\\n\\n\\t.warning {\\n\\t\\tbackground-color: #e47e0a;\\n\\t}\\n\\n\\t.info {\\n\\t\\tbackground-color: var(--second);\\n\\t}\\n</style>\\n\\n<div in:slide={{delay: 150, duration: 100}} out:slide={{duration: 100}} class=\\\"message {kind}\\\" class:truncate>\\n\\t{#if details}\\n\\t\\t<p\\n\\t\\t\\tclass:navigable={details.filename}\\n\\t\\t\\ton:click=\\\"{() => navigate(details)}\\\"\\n\\t\\t>{message(details)}</p>\\n\\t{:else}\\n\\t\\t<slot></slot>\\n\\t{/if}\\n</div>\"],\"names\":[],\"mappings\":\"AA2BC,sBAAS,CACR,QAAQ,CAAE,QAAQ,CAClB,KAAK,CAAE,KAAK,CACZ,OAAO,CAAE,IAAI,CAAC,IAAI,CAAC,IAAI,CAAC,IAAI,CAC5B,IAAI,CAAE,GAAG,CAAC,IAAI,CAAC,GAAG,CAAC,IAAI,MAAM,CAAC,CAC9B,MAAM,CAAE,CAAC,CACT,UAAU,CAAE,GAAG,CAAC,KAAK,CAAC,KACvB,CAEA,wBAAW,CACV,MAAM,CAAE,OACT,CAEA,sBAAQ,QAAS,CAChB,OAAO,CAAE,GAAG,CACZ,QAAQ,CAAE,QAAQ,CAClB,IAAI,CAAE,IAAI,CACV,GAAG,CAAE,IAAI,CACT,UAAU,CAAE,MAAM,CAClB,WAAW,CAAE,CAAC,CACd,OAAO,CAAE,GAAG,CACZ,aAAa,CAAE,GAAG,CAClB,KAAK,CAAE,KAAK,CACZ,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,KAAK,CACvB,UAAU,CAAE,WAAW,CACvB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,SAAS,CAAE,IAAI,CACf,WAAW,CAAE,GACd,CAEA,uBAAU,CACT,WAAW,CAAE,GAAG,CAChB,UAAU,CAAE,MAAM,CAClB,aAAa,CAAE,QAChB,CAEA,eAAE,CACD,MAAM,CAAE,CACT,CAEA,oBAAO,CACN,gBAAgB,CAAE,OACnB,CAEA,sBAAS,CACR,gBAAgB,CAAE,OACnB,CAEA,mBAAM,CACL,gBAAgB,CAAE,IAAI,QAAQ,CAC/B\"}"
};

const Message = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	getContext('REPL');
	let { kind } = $$props;
	let { details = null } = $$props;
	let { filename = null } = $$props;
	let { truncate } = $$props;

	function message(details) {
		let str = details.message || '[missing message]';
		let loc = [];

		if (details.filename && details.filename !== filename) {
			loc.push(details.filename);
		}

		if (details.start) loc.push(details.start.line, details.start.column);
		return str + (loc.length ? ` (${loc.join(':')})` : ``);
	}
	if ($$props.kind === void 0 && $$bindings.kind && kind !== void 0) $$bindings.kind(kind);
	if ($$props.details === void 0 && $$bindings.details && details !== void 0) $$bindings.details(details);
	if ($$props.filename === void 0 && $$bindings.filename && filename !== void 0) $$bindings.filename(filename);
	if ($$props.truncate === void 0 && $$bindings.truncate && truncate !== void 0) $$bindings.truncate(truncate);
	$$result.css.add(css$a);

	return `<div class="${["message " + escape(kind, true) + " svelte-9488n4", truncate ? "truncate" : ""].join(' ').trim()}">${details
	? `<p class="${["svelte-9488n4", details.filename ? "navigable" : ""].join(' ').trim()}">${escape(message(details))}</p>`
	: `${slots.default ? slots.default({}) : ``}`}</div>`;
});

/* src/components/Repl/CodeMirror.svelte generated by Svelte v4.0.0 */

const css$9 = {
	code: ".codemirror-container.svelte-1uv9syl.svelte-1uv9syl{position:relative;width:100%;height:100%;border:none;line-height:1.5;overflow:hidden}.codemirror-container.svelte-1uv9syl .CodeMirror{height:100%;background:transparent;font:400 14px/1.7 var(--font-mono);padding:24px}.codemirror-container.flex.svelte-1uv9syl .CodeMirror{height:auto}.codemirror-container.flex.svelte-1uv9syl .CodeMirror-lines{padding:0}.codemirror-container.svelte-1uv9syl .CodeMirror-gutters{padding:0 16px 0 8px;border:none}.codemirror-container.svelte-1uv9syl .error-loc{position:relative;border-bottom:2px solid #da106e}.codemirror-container.svelte-1uv9syl .error-line{background-color:rgba(200, 0, 0, 0.05)}textarea.svelte-1uv9syl.svelte-1uv9syl{visibility:hidden}pre.svelte-1uv9syl.svelte-1uv9syl{position:absolute;width:100%;height:100%;top:0;left:0;border:none;padding:4px 4px 4px 60px;resize:none;font-family:var(--font-mono);font-size:13px;line-height:1.7;user-select:none;pointer-events:none;color:#ccc;tab-size:2;-moz-tab-size:2}.flex.svelte-1uv9syl pre.svelte-1uv9syl{padding:0 0 0 4px;height:auto}",
	map: "{\"version\":3,\"file\":\"CodeMirror.svelte\",\"sources\":[\"CodeMirror.svelte\"],\"sourcesContent\":[\"<script>\\n  import './codemirror.css';\\n  import { onMount, createEventDispatcher } from \\\"svelte\\\";\\n  import Message from \\\"./Message.svelte\\\";\\n\\n  const dispatch = createEventDispatcher();\\n\\n  export let readonly = false;\\n  export let errorLoc = null;\\n  export let flex = false;\\n  export let lineNumbers = true;\\n  export let tab = true;\\n\\n  let w;\\n  let h;\\n  let code = \\\"\\\";\\n  let mode;\\n\\n  // We have to expose set and update methods, rather\\n  // than making this state-driven through props,\\n  // because it's difficult to update an editor\\n  // without resetting scroll otherwise\\n  export async function set(new_code, new_mode) {\\n    if (new_mode !== mode) {\\n      await createEditor((mode = new_mode));\\n    }\\n\\n    code = new_code;\\n    updating_externally = true;\\n    if (editor) editor.setValue(code);\\n    updating_externally = false;\\n  }\\n\\n  export function update(new_code) {\\n    code = new_code;\\n\\n    if (editor) {\\n      const { left, top } = editor.getScrollInfo();\\n      editor.setValue((code = new_code));\\n      editor.scrollTo(left, top);\\n    }\\n  }\\n\\n  export function resize() {\\n    editor.refresh();\\n  }\\n\\n  export function focus() {\\n    editor.focus();\\n  }\\n\\n  const modes = {\\n    js: {\\n      name: \\\"javascript\\\",\\n      json: false\\n    },\\n    json: {\\n      name: \\\"javascript\\\",\\n      json: true\\n    },\\n    svelte: {\\n      name: \\\"handlebars\\\",\\n      base: \\\"text/html\\\"\\n    },\\n    svx: {\\n      name: \\\"gfm\\\"\\n    }\\n  };\\n\\n  const refs = {};\\n  let editor;\\n  let updating_externally = false;\\n  let marker;\\n  let error_line;\\n  let destroyed = false;\\n  let CodeMirror;\\n\\n  $: if (editor && w && h) {\\n    editor.refresh();\\n  }\\n\\n  $: {\\n    if (marker) marker.clear();\\n\\n    if (errorLoc) {\\n      const line = errorLoc.line - 1;\\n      const ch = errorLoc.column;\\n\\n      marker = editor.markText(\\n        { line, ch },\\n        { line, ch: ch + 1 },\\n        {\\n          className: \\\"error-loc\\\"\\n        }\\n      );\\n\\n      error_line = line;\\n    } else {\\n      error_line = null;\\n    }\\n  }\\n\\n  let previous_error_line;\\n  $: if (editor) {\\n    if (previous_error_line != null) {\\n      editor.removeLineClass(previous_error_line, \\\"wrap\\\", \\\"error-line\\\");\\n    }\\n\\n    if (error_line && error_line !== previous_error_line) {\\n      editor.addLineClass(error_line, \\\"wrap\\\", \\\"error-line\\\");\\n      previous_error_line = error_line;\\n    }\\n  }\\n\\n  onMount(async () => {\\n    if (CodeMirror) {\\n      createEditor(mode || \\\"svelte\\\").then(() => {\\n        if (editor) editor.setValue(code || \\\"\\\");\\n      });\\n    } else {\\n      let mod = await import('./codemirror.js');\\n      CodeMirror = mod.default;\\n      await createEditor(mode || \\\"svelte\\\");\\n      if (editor) editor.setValue(code || \\\"\\\");\\n    }\\n\\n    return () => {\\n      destroyed = true;\\n      if (editor) editor.toTextArea();\\n    };\\n  });\\n\\n  let first = true;\\n\\n  async function createEditor(mode) {\\n    if (destroyed || !CodeMirror) return;\\n\\n    if (editor) editor.toTextArea();\\n\\n    const opts = {\\n      lineNumbers,\\n      lineWrapping: true,\\n      indentWithTabs: true,\\n      indentUnit: 2,\\n      tabSize: 2,\\n      value: \\\"\\\",\\n      mode: modes[mode] || {\\n        name: mode\\n      },\\n      readOnly: readonly,\\n      autoCloseBrackets: true,\\n      autoCloseTags: true\\n    };\\n\\n    if (!tab)\\n      opts.extraKeys = {\\n        Tab: tab,\\n        \\\"Shift-Tab\\\": tab\\n      };\\n\\n    // Creating a text editor is a lot of work, so we yield\\n    // the main thread for a moment. This helps reduce jank\\n    if (first) await sleep(50);\\n\\n    if (destroyed) return;\\n\\n    editor = CodeMirror.fromTextArea(refs.editor, opts);\\n\\n    editor.on(\\\"change\\\", instance => {\\n      if (!updating_externally) {\\n        const value = instance.getValue();\\n        dispatch(\\\"change\\\", { value });\\n      }\\n    });\\n\\n    if (first) await sleep(50);\\n    editor.refresh();\\n\\n    first = false;\\n  }\\n\\n  function sleep(ms) {\\n    return new Promise(fulfil => setTimeout(fulfil, ms));\\n  }\\n</script>\\n\\n<style>\\n  .codemirror-container {\\n    position: relative;\\n    width: 100%;\\n    height: 100%;\\n    border: none;\\n    line-height: 1.5;\\n    overflow: hidden;\\n  }\\n\\n  .codemirror-container :global(.CodeMirror) {\\n    height: 100%;\\n    background: transparent;\\n    font: 400 14px/1.7 var(--font-mono);\\n    padding: 24px;\\n  }\\n\\n  .codemirror-container.flex :global(.CodeMirror) {\\n    height: auto;\\n  }\\n\\n  .codemirror-container.flex :global(.CodeMirror-lines) {\\n    padding: 0;\\n  }\\n\\n  .codemirror-container :global(.CodeMirror-gutters) {\\n    padding: 0 16px 0 8px;\\n    border: none;\\n  }\\n\\n  .codemirror-container :global(.error-loc) {\\n    position: relative;\\n    border-bottom: 2px solid #da106e;\\n  }\\n\\n  .codemirror-container :global(.error-line) {\\n    background-color: rgba(200, 0, 0, 0.05);\\n  }\\n\\n  textarea {\\n    visibility: hidden;\\n  }\\n\\n  pre {\\n    position: absolute;\\n    width: 100%;\\n    height: 100%;\\n    top: 0;\\n    left: 0;\\n    border: none;\\n    padding: 4px 4px 4px 60px;\\n    resize: none;\\n    font-family: var(--font-mono);\\n    font-size: 13px;\\n    line-height: 1.7;\\n    user-select: none;\\n    pointer-events: none;\\n    color: #ccc;\\n    tab-size: 2;\\n    -moz-tab-size: 2;\\n  }\\n\\n  .flex pre {\\n    padding: 0 0 0 4px;\\n    height: auto;\\n  }\\n</style>\\n\\n<div\\n  class=\\\"codemirror-container\\\"\\n  class:flex\\n  bind:offsetWidth={w}\\n  bind:offsetHeight={h}>\\n  <!-- svelte-ignore a11y-positive-tabindex -->\\n  <textarea tabindex=\\\"2\\\" bind:this={refs.editor} readonly value={code} />\\n\\n  {#if !CodeMirror}\\n    <pre style=\\\"position: absolute; left: 0; top: 0\\\">{code}</pre>\\n\\n    <div style=\\\"position: absolute; width: 100%; bottom: 0\\\">\\n      <Message kind=\\\"info\\\">loading editor...</Message>\\n    </div>\\n  {/if}\\n</div>\\n\"],\"names\":[],\"mappings\":\"AA2LE,mDAAsB,CACpB,QAAQ,CAAE,QAAQ,CAClB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,MAAM,CAAE,IAAI,CACZ,WAAW,CAAE,GAAG,CAChB,QAAQ,CAAE,MACZ,CAEA,oCAAqB,CAAS,WAAa,CACzC,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,WAAW,CACvB,IAAI,CAAE,GAAG,CAAC,IAAI,CAAC,GAAG,CAAC,IAAI,WAAW,CAAC,CACnC,OAAO,CAAE,IACX,CAEA,qBAAqB,oBAAK,CAAS,WAAa,CAC9C,MAAM,CAAE,IACV,CAEA,qBAAqB,oBAAK,CAAS,iBAAmB,CACpD,OAAO,CAAE,CACX,CAEA,oCAAqB,CAAS,mBAAqB,CACjD,OAAO,CAAE,CAAC,CAAC,IAAI,CAAC,CAAC,CAAC,GAAG,CACrB,MAAM,CAAE,IACV,CAEA,oCAAqB,CAAS,UAAY,CACxC,QAAQ,CAAE,QAAQ,CAClB,aAAa,CAAE,GAAG,CAAC,KAAK,CAAC,OAC3B,CAEA,oCAAqB,CAAS,WAAa,CACzC,gBAAgB,CAAE,KAAK,GAAG,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,IAAI,CACxC,CAEA,sCAAS,CACP,UAAU,CAAE,MACd,CAEA,iCAAI,CACF,QAAQ,CAAE,QAAQ,CAClB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,GAAG,CAAE,CAAC,CACN,IAAI,CAAE,CAAC,CACP,MAAM,CAAE,IAAI,CACZ,OAAO,CAAE,GAAG,CAAC,GAAG,CAAC,GAAG,CAAC,IAAI,CACzB,MAAM,CAAE,IAAI,CACZ,WAAW,CAAE,IAAI,WAAW,CAAC,CAC7B,SAAS,CAAE,IAAI,CACf,WAAW,CAAE,GAAG,CAChB,WAAW,CAAE,IAAI,CACjB,cAAc,CAAE,IAAI,CACpB,KAAK,CAAE,IAAI,CACX,QAAQ,CAAE,CAAC,CACX,aAAa,CAAE,CACjB,CAEA,oBAAK,CAAC,kBAAI,CACR,OAAO,CAAE,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,GAAG,CAClB,MAAM,CAAE,IACV\"}"
};

function sleep(ms) {
	return new Promise(fulfil => setTimeout(fulfil, ms));
}

const CodeMirror_1 = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	const dispatch = createEventDispatcher();
	let { readonly = false } = $$props;
	let { errorLoc = null } = $$props;
	let { flex = false } = $$props;
	let { lineNumbers = true } = $$props;
	let { tab = true } = $$props;
	let w;
	let h;
	let code = "";
	let mode;

	async function set(new_code, new_mode) {
		if (new_mode !== mode) {
			await createEditor(mode = new_mode);
		}

		code = new_code;
		updating_externally = true;
		if (editor) editor.setValue(code);
		updating_externally = false;
	}

	function update(new_code) {
		code = new_code;

		if (editor) {
			const { left, top } = editor.getScrollInfo();
			editor.setValue(code = new_code);
			editor.scrollTo(left, top);
		}
	}

	function resize() {
		editor.refresh();
	}

	function focus() {
		editor.focus();
	}

	const modes = {
		js: { name: "javascript", json: false },
		json: { name: "javascript", json: true },
		svelte: { name: "handlebars", base: "text/html" },
		svx: { name: "gfm" }
	};

	const refs = {};
	let editor;
	let updating_externally = false;
	let marker;
	let error_line;
	let destroyed = false;
	let CodeMirror;
	let previous_error_line;

	onMount(async () => {
		if (CodeMirror) {
			createEditor(mode || "svelte").then(() => {
				if (editor) editor.setValue(code || "");
			});
		} else {
			let mod = await import('./codemirror-c2951b01.js');
			CodeMirror = mod.default;
			await createEditor(mode || "svelte");
			if (editor) editor.setValue(code || "");
		}

		return () => {
			destroyed = true;
			if (editor) editor.toTextArea();
		};
	});

	let first = true;

	async function createEditor(mode) {
		if (destroyed || !CodeMirror) return;
		if (editor) editor.toTextArea();

		const opts = {
			lineNumbers,
			lineWrapping: true,
			indentWithTabs: true,
			indentUnit: 2,
			tabSize: 2,
			value: "",
			mode: modes[mode] || { name: mode },
			readOnly: readonly,
			autoCloseBrackets: true,
			autoCloseTags: true
		};

		if (!tab) opts.extraKeys = { Tab: tab, "Shift-Tab": tab };

		// Creating a text editor is a lot of work, so we yield
		// the main thread for a moment. This helps reduce jank
		if (first) await sleep(50);

		if (destroyed) return;
		editor = CodeMirror.fromTextArea(refs.editor, opts);

		editor.on("change", instance => {
			if (!updating_externally) {
				const value = instance.getValue();
				dispatch("change", { value });
			}
		});

		if (first) await sleep(50);
		editor.refresh();
		first = false;
	}

	if ($$props.readonly === void 0 && $$bindings.readonly && readonly !== void 0) $$bindings.readonly(readonly);
	if ($$props.errorLoc === void 0 && $$bindings.errorLoc && errorLoc !== void 0) $$bindings.errorLoc(errorLoc);
	if ($$props.flex === void 0 && $$bindings.flex && flex !== void 0) $$bindings.flex(flex);
	if ($$props.lineNumbers === void 0 && $$bindings.lineNumbers && lineNumbers !== void 0) $$bindings.lineNumbers(lineNumbers);
	if ($$props.tab === void 0 && $$bindings.tab && tab !== void 0) $$bindings.tab(tab);
	if ($$props.set === void 0 && $$bindings.set && set !== void 0) $$bindings.set(set);
	if ($$props.update === void 0 && $$bindings.update && update !== void 0) $$bindings.update(update);
	if ($$props.resize === void 0 && $$bindings.resize && resize !== void 0) $$bindings.resize(resize);
	if ($$props.focus === void 0 && $$bindings.focus && focus !== void 0) $$bindings.focus(focus);
	$$result.css.add(css$9);

	{
		if (editor && w && h) {
			editor.refresh();
		}
	}

	{
		{
			if (marker) marker.clear();

			if (errorLoc) {
				const line = errorLoc.line - 1;
				const ch = errorLoc.column;
				marker = editor.markText({ line, ch }, { line, ch: ch + 1 }, { className: "error-loc" });
				error_line = line;
			} else {
				error_line = null;
			}
		}
	}

	{
		if (editor) {
			if (previous_error_line != null) {
				editor.removeLineClass(previous_error_line, "wrap", "error-line");
			}

			if (error_line && error_line !== previous_error_line) {
				editor.addLineClass(error_line, "wrap", "error-line");
				previous_error_line = error_line;
			}
		}
	}

	return `<div class="${["codemirror-container svelte-1uv9syl", flex ? "flex" : ""].join(' ').trim()}"> <textarea tabindex="2" readonly class="svelte-1uv9syl"${add_attribute("this", refs.editor, 0)}>${escape(code, false)}</textarea> ${!CodeMirror
	? `<pre style="position: absolute; left: 0; top: 0" class="svelte-1uv9syl">${escape(code)}</pre> <div style="position: absolute; width: 100%; bottom: 0">${validate_component(Message, "Message").$$render($$result, { kind: "info" }, {}, {
			default: () => {
				return `loading editor...`;
			}
		})}</div>`
	: ``}</div>`;
});

/* src/components/Repl/Input/ModuleEditor.svelte generated by Svelte v4.0.0 */

const css$8 = {
	code: ".editor-wrapper.svelte-1x3die8{z-index:5;display:flex;flex-direction:column}.editor.svelte-1x3die8{height:0;flex:1 1 auto}.info.svelte-1x3die8{background-color:var(--second);max-height:50%;overflow:auto}.columns .editor-wrapper.svelte-1x3die8{padding-right:8px;height:auto}",
	map: "{\"version\":3,\"file\":\"ModuleEditor.svelte\",\"sources\":[\"ModuleEditor.svelte\"],\"sourcesContent\":[\"<script>\\n  import { getContext, onMount } from \\\"svelte\\\";\\n  import CodeMirror from \\\"../CodeMirror.svelte\\\";\\n  import Message from \\\"../Message.svelte\\\";\\n\\n  const {\\n    bundle,\\n    selected,\\n    handle_change,\\n    register_module_editor\\n  } = getContext(\\\"REPL\\\");\\n\\n  export let errorLoc;\\n\\n  let editor;\\n  onMount(() => {\\n    register_module_editor(editor);\\n  });\\n\\n  export function focus() {\\n    editor.focus();\\n  }\\n</script>\\n\\n<style>\\n  .editor-wrapper {\\n    z-index: 5;\\n    display: flex;\\n    flex-direction: column;\\n  }\\n\\n  .editor {\\n    height: 0;\\n    flex: 1 1 auto;\\n  }\\n\\n  .info {\\n    background-color: var(--second);\\n    max-height: 50%;\\n    overflow: auto;\\n  }\\n\\n  :global(.columns) .editor-wrapper {\\n    /* make it easier to interact with scrollbar */\\n    padding-right: 8px;\\n    height: auto;\\n    /* height: 100%; */\\n  }\\n</style>\\n\\n<div class=\\\"editor-wrapper\\\">\\n  <div class=\\\"editor\\\">\\n    <CodeMirror\\n      bind:this={editor}\\n      {errorLoc}\\n      lineNumbers={false}\\n      on:change={handle_change} />\\n  </div>\\n\\n  <div class=\\\"info\\\">\\n    {#if $bundle}\\n      {#if $bundle.error}\\n        <Message\\n          kind=\\\"error\\\"\\n          details={$bundle.error}\\n          filename=\\\"{$selected.name}.{$selected.type}\\\" />\\n      {:else if $bundle.warnings.length > 0}\\n        {#each $bundle.warnings as warning}\\n          <Message\\n            kind=\\\"warning\\\"\\n            details={warning}\\n            filename=\\\"{$selected.name}.{$selected.type}\\\" />\\n        {/each}\\n      {/if}\\n    {/if}\\n  </div>\\n</div>\\n\"],\"names\":[],\"mappings\":\"AAyBE,8BAAgB,CACd,OAAO,CAAE,CAAC,CACV,OAAO,CAAE,IAAI,CACb,cAAc,CAAE,MAClB,CAEA,sBAAQ,CACN,MAAM,CAAE,CAAC,CACT,IAAI,CAAE,CAAC,CAAC,CAAC,CAAC,IACZ,CAEA,oBAAM,CACJ,gBAAgB,CAAE,IAAI,QAAQ,CAAC,CAC/B,UAAU,CAAE,GAAG,CACf,QAAQ,CAAE,IACZ,CAEQ,QAAS,CAAC,8BAAgB,CAEhC,aAAa,CAAE,GAAG,CAClB,MAAM,CAAE,IAEV\"}"
};

const ModuleEditor = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let $bundle, $$unsubscribe_bundle;
	let $selected, $$unsubscribe_selected;
	const { bundle, selected, handle_change, register_module_editor } = getContext("REPL");
	$$unsubscribe_bundle = subscribe(bundle, value => $bundle = value);
	$$unsubscribe_selected = subscribe(selected, value => $selected = value);
	let { errorLoc } = $$props;
	let editor;

	onMount(() => {
		register_module_editor(editor);
	});

	function focus() {
		editor.focus();
	}

	if ($$props.errorLoc === void 0 && $$bindings.errorLoc && errorLoc !== void 0) $$bindings.errorLoc(errorLoc);
	if ($$props.focus === void 0 && $$bindings.focus && focus !== void 0) $$bindings.focus(focus);
	$$result.css.add(css$8);
	let $$settled;
	let $$rendered;

	do {
		$$settled = true;

		$$rendered = `<div class="editor-wrapper svelte-1x3die8"><div class="editor svelte-1x3die8">${validate_component(CodeMirror_1, "CodeMirror").$$render(
			$$result,
			{
				errorLoc,
				lineNumbers: false,
				this: editor
			},
			{
				this: $$value => {
					editor = $$value;
					$$settled = false;
				}
			},
			{}
		)}</div> <div class="info svelte-1x3die8">${$bundle
		? `${$bundle.error
			? `${validate_component(Message, "Message").$$render(
					$$result,
					{
						kind: "error",
						details: $bundle.error,
						filename: $selected.name + "." + $selected.type
					},
					{},
					{}
				)}`
			: `${$bundle.warnings.length > 0
				? `${each($bundle.warnings, warning => {
						return `${validate_component(Message, "Message").$$render(
							$$result,
							{
								kind: "warning",
								details: warning,
								filename: $selected.name + "." + $selected.type
							},
							{},
							{}
						)}`;
					})}`
				: ``}`}`
		: ``}</div></div>`;
	} while (!$$settled);

	$$unsubscribe_bundle();
	$$unsubscribe_selected();
	return $$rendered;
});

var charToInteger = {};
var chars$1 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
for (var i = 0; i < chars$1.length; i++) {
    charToInteger[chars$1.charCodeAt(i)] = i;
}
function decode$3(mappings) {
    var decoded = [];
    var line = [];
    var segment = [
        0,
        0,
        0,
        0,
        0,
    ];
    var j = 0;
    for (var i = 0, shift = 0, value = 0; i < mappings.length; i++) {
        var c = mappings.charCodeAt(i);
        if (c === 44) { // ","
            segmentify(line, segment, j);
            j = 0;
        }
        else if (c === 59) { // ";"
            segmentify(line, segment, j);
            j = 0;
            decoded.push(line);
            line = [];
            segment[0] = 0;
        }
        else {
            var integer = charToInteger[c];
            if (integer === undefined) {
                throw new Error('Invalid character (' + String.fromCharCode(c) + ')');
            }
            var hasContinuationBit = integer & 32;
            integer &= 31;
            value += integer << shift;
            if (hasContinuationBit) {
                shift += 5;
            }
            else {
                var shouldNegate = value & 1;
                value >>>= 1;
                if (shouldNegate) {
                    value = value === 0 ? -0x80000000 : -value;
                }
                segment[j] += value;
                j++;
                value = shift = 0; // reset
            }
        }
    }
    segmentify(line, segment, j);
    decoded.push(line);
    return decoded;
}
function segmentify(line, segment, j) {
    // This looks ugly, but we're creating specialized arrays with a specific
    // length. This is much faster than creating a new array (which v8 expands to
    // a capacity of 17 after pushing the first item), or slicing out a subarray
    // (which is slow). Length 4 is assumed to be the most frequent, followed by
    // length 5 (since not everything will have an associated name), followed by
    // length 1 (it's probably rare for a source substring to not have an
    // associated segment data).
    if (j === 4)
        line.push([segment[0], segment[1], segment[2], segment[3]]);
    else if (j === 5)
        line.push([segment[0], segment[1], segment[2], segment[3], segment[4]]);
    else if (j === 1)
        line.push([segment[0]]);
}

function getLocationFromStack(stack, map) {
	if (!stack) return;
	const last = stack.split('\n')[1];
	const match = /<anonymous>:(\d+):(\d+)\)$/.exec(last);

	if (!match) return null;

	const line = +match[1];
	const column = +match[2];

	return trace({ line, column }, map);
}

function trace(loc, map) {
	const mappings = decode$3(map.mappings);
	const segments = mappings[loc.line - 1];

	for (let i = 0; i < segments.length; i += 1) {
		const segment = segments[i];
		if (segment[0] === loc.column) {
			const [, sourceIndex, line, column] = segment;
			const source = map.sources[sourceIndex].slice(2);

			return { source, line: line + 1, column };
		}
	}

	return null;
}

let uid$2 = 1;

class ReplProxy {
	constructor(iframe, handlers) {
		this.iframe = iframe;
		this.handlers = handlers;

		this.pending_cmds = new Map();

		this.handle_event = e => this.handle_repl_message(e);
		window.addEventListener('message', this.handle_event, false);
	}

	destroy() {
		window.removeEventListener('message', this.handle_event);
	}

	iframe_command(action, args) {
		return new Promise((resolve, reject) => {
			const cmd_id = uid$2++;

			this.pending_cmds.set(cmd_id, { resolve, reject });

			this.iframe.contentWindow.postMessage({ action, cmd_id, args }, '*');
		});
	}

	handle_command_message(cmd_data) {
		let action = cmd_data.action;
		let id = cmd_data.cmd_id;
		let handler = this.pending_cmds.get(id);

		if (handler) {
			this.pending_cmds.delete(id);
			if (action === 'cmd_error') {
				let { message, stack } = cmd_data;
				let e = new Error(message);
				e.stack = stack;
				handler.reject(e);
			}

			if (action === 'cmd_ok') {
				handler.resolve(cmd_data.args);
			}
		} else {
			console.error('command not found', id, cmd_data, [...this.pending_cmds.keys()]);
		}
	}

	handle_repl_message(event) {
		if (event.source !== this.iframe.contentWindow) return;

		const { action, args } = event.data;

		switch (action) {
			case 'cmd_error':
			case 'cmd_ok':
				return this.handle_command_message(event.data);
			case 'fetch_progress':
				return this.handlers.on_fetch_progress(args.remaining)
			case 'error':
				return this.handlers.on_error(event.data);
			case 'unhandledrejection':
				return this.handlers.on_unhandled_rejection(event.data);
			case 'console':
				return this.handlers.on_console(event.data);
		}
	}

	eval(script) {
		return this.iframe_command('eval', { script });
	}

	handle_links() {
		return this.iframe_command('catch_clicks', {});
	}
}

var srcdoc = "<!doctype html><html><head><style>html, body {position: relative;width: 100%;height: 100%;}body {color: #333;margin: 0;padding: 8px 20px;box-sizing: border-box;font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Oxygen-Sans, Ubuntu, Cantarell, \"Helvetica Neue\", sans-serif;}a {color: rgb(0,100,200);text-decoration: none;}a:hover {text-decoration: underline;}a:visited {color: rgb(0,80,160);}label {display: block;}input, button, select, textarea {font-family: inherit;font-size: inherit;padding: 0.4em;margin: 0 0 0.5em 0;box-sizing: border-box;border: 1px solid #ccc;border-radius: 2px;}input:disabled {color: #ccc;}input[type=\"range\"] {height: 0;}button {color: #333;background-color: #f4f4f4;outline: none;}button:active {background-color: #ddd;}button:focus {border-color: #666;} p:last-child{margin-bottom: 30px;}</style><script>(function(){function handle_message(ev) {let { action, cmd_id } = ev.data;const send_message = (payload) => parent.postMessage( { ...payload }, ev.origin);const send_reply = (payload) => send_message({ ...payload, cmd_id });const send_ok = () => send_reply({ action: 'cmd_ok' });const send_error = (message, stack) => send_reply({ action: 'cmd_error', message, stack });if (action === 'eval') {try {const { script } = ev.data.args;eval(script);send_ok();} catch (e) {send_error(e.message, e.stack);}}if (action === 'catch_clicks') {try {const top_origin = ev.origin;document.body.addEventListener('click', event => {if (event.which !== 1) return;if (event.metaKey || event.ctrlKey || event.shiftKey) return;if (event.defaultPrevented) return;let el = event.target;while (el && el.nodeName !== 'A') el = el.parentNode;if (!el || el.nodeName !== 'A') return;if (el.hasAttribute('download') || el.getAttribute('rel') === 'external' || el.target) return;event.preventDefault();if (el.href.startsWith(top_origin)) {const url = new URL(el.href);if (url.hash[0] === '#') {window.location.hash = url.hash;return;}}window.open(el.href, '_blank');});send_ok();} catch(e) {send_error(e.message, e.stack);}}}window.addEventListener('message', handle_message, false);window.onerror = function (msg, url, lineNo, columnNo, error) {parent.postMessage({ action: 'error', value: error }, '*');};window.addEventListener(\"unhandledrejection\", event => {parent.postMessage({ action: 'unhandledrejection', value: event.reason }, '*');});}).call(this);let previous = { level: null, args: null };['clear', 'log', 'info', 'dir', 'warn', 'error'].forEach((level) => {const original = console[level];console[level] = (...args) => {if (previous.level === level &&previous.args.length === args.length &&previous.args.every((a, i) => a === args[i])) {parent.postMessage({ action: 'console', level, duplicate: true }, '*');} else {previous = { level, args };try {parent.postMessage({ action: 'console', level, args }, '*');} catch (err) {parent.postMessage({ action: 'console', level: 'unclonable' }, '*');}}original(...args);}})</script></head><body></body></html>";

/* src/components/Repl/Output/Viewer.svelte generated by Svelte v4.0.0 */

const css$7 = {
	code: ".iframe-container.svelte-1n49w9s{position:absolute;border:none;width:100%;height:100%}iframe.svelte-1n49w9s{width:100%;height:100%;height:calc(100vh);border:none;display:block;opacity:0}.inited.svelte-1n49w9s{opacity:1;height:100%}.greyed-out.svelte-1n49w9s{filter:grayscale(50%) blur(1px);opacity:0.25}.overlay.svelte-1n49w9s{position:absolute;bottom:0;width:100%}",
	map: "{\"version\":3,\"file\":\"Viewer.svelte\",\"sources\":[\"Viewer.svelte\"],\"sourcesContent\":[\"<script>\\n  import { onMount, getContext } from \\\"svelte\\\";\\n  import getLocationFromStack from \\\"./getLocationFromStack.js\\\";\\n  import SplitPane from \\\"../SplitPane.svelte\\\";\\n  import PaneWithPanel from \\\"./PaneWithPanel.svelte\\\";\\n  import ReplProxy from \\\"./ReplProxy.js\\\";\\n  import Console from \\\"./Console.svelte\\\";\\n  import Message from \\\"../Message.svelte\\\";\\n  import srcdoc from \\\"./srcdoc/index.js\\\";\\n\\n  const { bundle } = getContext(\\\"REPL\\\");\\n\\n\\n  export let error; // TODO should this be exposed as a prop?\\n  let logs = [];\\n\\n  export function setProp(prop, value) {\\n    if (!proxy) return;\\n    proxy.setProp(prop, value);\\n  }\\n\\n  export let status;\\n  export let relaxed = false;\\n  export let injectedJS = \\\"\\\";\\n  export let injectedCSS = \\\"\\\";\\n\\n  let iframe;\\n  let pending_imports = 0;\\n  let pending = false;\\n\\n  let proxy = null;\\n\\n  let ready = false;\\n  let inited = false;\\n\\n  let log_height = 90;\\n  let prev_height;\\n\\n  let last_console_event;\\n\\n  onMount(() => {\\n    proxy = new ReplProxy(iframe, {\\n      on_fetch_progress: (progress) => {\\n        pending_imports = progress;\\n      },\\n      on_error: (event) => {\\n        push_logs({ level: \\\"error\\\", args: [event.value] });\\n      },\\n      on_unhandled_rejection: (event) => {\\n        let error = event.value;\\n        if (typeof error === \\\"string\\\") error = { message: error };\\n        error.message = \\\"Uncaught (in promise): \\\" + error.message;\\n        push_logs({ level: \\\"error\\\", args: [error] });\\n      },\\n      on_console: (log) => {\\n        if (log.level === \\\"clear\\\") {\\n          logs = [log];\\n        } else if (log.duplicate) {\\n          const last_log = logs[logs.length - 1];\\n\\n          if (last_log) {\\n            last_log.count = (last_log.count || 1) + 1;\\n            logs = logs;\\n          } else {\\n            last_console_event.count = 1;\\n            logs = [last_console_event];\\n          }\\n        } else {\\n          push_logs(log);\\n          last_console_event = log;\\n        }\\n      },\\n    });\\n\\n    iframe.addEventListener(\\\"load\\\", () => {\\n      proxy.handle_links();\\n      ready = true;\\n    });\\n\\n    return () => {\\n      proxy.destroy();\\n    };\\n  });\\n\\n  async function apply_bundle($bundle) {\\n    if (!$bundle || $bundle.error) return;\\n\\n    try {\\n      clear_logs();\\n\\n      await proxy.eval(`\\n\\t\\t\\t\\t${injectedJS}\\n\\n\\t\\t\\t\\t${styles}\\n\\n\\t\\t\\t\\tconst styles = document.querySelectorAll('style[id^=svelte-]');\\n\\n\\t\\t\\t\\t${$bundle.dom.code}\\n\\n\\t\\t\\t\\tlet i = styles.length;\\n\\t\\t\\t\\twhile (i--) styles[i].parentNode.removeChild(styles[i]);\\n\\n\\t\\t\\t\\tif (window.component) {\\n\\t\\t\\t\\t\\ttry {\\n\\t\\t\\t\\t\\t\\twindow.component.$destroy();\\n\\t\\t\\t\\t\\t} catch (err) {\\n\\t\\t\\t\\t\\t\\tconsole.error(err);\\n\\t\\t\\t\\t\\t}\\n\\t\\t\\t\\t}\\n\\n\\t\\t\\t\\tdocument.body.innerHTML = '';\\n\\t\\t\\t\\twindow.location.hash = '';\\n\\t\\t\\t\\twindow._svelteTransitionManager = null;\\n\\n\\t\\t\\t\\twindow.component = new SvelteComponent.default({\\n\\t\\t\\t\\t\\ttarget: document.body\\n\\t\\t\\t\\t});\\n\\t\\t\\t`);\\n\\n      error = null;\\n    } catch (e) {\\n      show_error(e);\\n    }\\n\\n    inited = true;\\n  }\\n\\n  $: if (ready) apply_bundle($bundle);\\n\\n  $: styles =\\n    injectedCSS &&\\n    `{\\n\\t\\tconst style = document.createElement('style');\\n\\t\\tstyle.textContent = ${JSON.stringify(injectedCSS)};\\n\\t\\tdocument.head.appendChild(style);\\n\\t}`;\\n\\n  function show_error(e) {\\n    const loc = getLocationFromStack(e.stack, $bundle.dom.map);\\n    if (loc) {\\n      e.filename = loc.source;\\n      e.loc = { line: loc.line, column: loc.column };\\n    }\\n\\n    error = e;\\n  }\\n\\n  function push_logs(log) {\\n    logs = [...logs, log];\\n  }\\n\\n  function on_toggle_console() {\\n    if (log_height < 90) {\\n      prev_height = log_height;\\n      log_height = 90;\\n    } else {\\n      log_height = prev_height || 45;\\n    }\\n  }\\n\\n  function clear_logs() {\\n    logs = [];\\n  }\\n\\n  onMount(() => {\\n    if (iframe) {\\n      ready = true;\\n    }\\n  });\\n</script>\\n\\n<style>\\n  .iframe-container {\\n    position: absolute;\\n    border: none;\\n    width: 100%;\\n    height: 100%;\\n    /* padding: 0 30px; */\\n  }\\n\\n  iframe {\\n    width: 100%;\\n    height: 100%;\\n    height: calc(100vh);\\n    border: none;\\n    display: block;\\n    opacity: 0;\\n  }\\n\\n  .inited {\\n    opacity: 1;\\n    height: 100%;\\n  }\\n\\n  .greyed-out {\\n    filter: grayscale(50%) blur(1px);\\n    opacity: 0.25;\\n  }\\n\\n  .overlay {\\n    position: absolute;\\n    bottom: 0;\\n    width: 100%;\\n  }\\n</style>\\n\\n<div class=\\\"iframe-container\\\">\\n  <div style=\\\"height: 100%\\\">\\n    <iframe\\n      title=\\\"Result\\\"\\n      class:inited\\n      bind:this={iframe}\\n      sandbox=\\\"allow-popups-to-escape-sandbox allow-scripts allow-popups\\n      allow-forms allow-pointer-lock allow-top-navigation allow-modals {relaxed ? 'allow-same-origin' : ''}\\\"\\n      class={error || pending || pending_imports ? 'greyed-out' : ''}\\n      {srcdoc} />\\n  </div>\\n\\n  <div class=\\\"overlay\\\">\\n    {#if error}\\n      <Message kind=\\\"error\\\" details={error} />\\n    {:else if status || !$bundle}\\n      <Message kind=\\\"info\\\" truncate>\\n        {status || 'loading Svelte compiler...'}\\n      </Message>\\n    {/if}\\n  </div>\\n</div>\\n\"],\"names\":[],\"mappings\":\"AA4KE,gCAAkB,CAChB,QAAQ,CAAE,QAAQ,CAClB,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAEV,CAEA,qBAAO,CACL,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,MAAM,CAAE,KAAK,KAAK,CAAC,CACnB,MAAM,CAAE,IAAI,CACZ,OAAO,CAAE,KAAK,CACd,OAAO,CAAE,CACX,CAEA,sBAAQ,CACN,OAAO,CAAE,CAAC,CACV,MAAM,CAAE,IACV,CAEA,0BAAY,CACV,MAAM,CAAE,UAAU,GAAG,CAAC,CAAC,KAAK,GAAG,CAAC,CAChC,OAAO,CAAE,IACX,CAEA,uBAAS,CACP,QAAQ,CAAE,QAAQ,CAClB,MAAM,CAAE,CAAC,CACT,KAAK,CAAE,IACT\"}"
};

let pending = false;

const Viewer = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let styles;
	let $bundle, $$unsubscribe_bundle;
	const { bundle } = getContext("REPL");
	$$unsubscribe_bundle = subscribe(bundle, value => $bundle = value);
	let { error } = $$props;
	let logs = [];

	function setProp(prop, value) {
		if (!proxy) return;
		proxy.setProp(prop, value);
	}

	let { status } = $$props;
	let { relaxed = false } = $$props;
	let { injectedJS = "" } = $$props;
	let { injectedCSS = "" } = $$props;
	let iframe;
	let pending_imports = 0;
	let proxy = null;
	let ready = false;
	let inited = false;
	let last_console_event;

	onMount(() => {
		proxy = new ReplProxy(iframe,
		{
				on_fetch_progress: progress => {
					pending_imports = progress;
				},
				on_error: event => {
					push_logs({ level: "error", args: [event.value] });
				},
				on_unhandled_rejection: event => {
					let error = event.value;
					if (typeof error === "string") error = { message: error };
					error.message = "Uncaught (in promise): " + error.message;
					push_logs({ level: "error", args: [error] });
				},
				on_console: log => {
					if (log.level === "clear") {
						logs = [log];
					} else if (log.duplicate) {
						const last_log = logs[logs.length - 1];

						if (last_log) {
							last_log.count = (last_log.count || 1) + 1;
							logs = logs;
						} else {
							last_console_event.count = 1;
							logs = [last_console_event];
						}
					} else {
						push_logs(log);
						last_console_event = log;
					}
				}
			});

		iframe.addEventListener("load", () => {
			proxy.handle_links();
			ready = true;
		});

		return () => {
			proxy.destroy();
		};
	});

	async function apply_bundle($bundle) {
		if (!$bundle || $bundle.error) return;

		try {
			clear_logs();

			await proxy.eval(`
				${injectedJS}

				${styles}

				const styles = document.querySelectorAll('style[id^=svelte-]');

				${$bundle.dom.code}

				let i = styles.length;
				while (i--) styles[i].parentNode.removeChild(styles[i]);

				if (window.component) {
					try {
						window.component.$destroy();
					} catch (err) {
						console.error(err);
					}
				}

				document.body.innerHTML = '';
				window.location.hash = '';
				window._svelteTransitionManager = null;

				window.component = new SvelteComponent.default({
					target: document.body
				});
			`);

			error = null;
		} catch(e) {
			show_error(e);
		}

		inited = true;
	}

	function show_error(e) {
		const loc = getLocationFromStack(e.stack, $bundle.dom.map);

		if (loc) {
			e.filename = loc.source;
			e.loc = { line: loc.line, column: loc.column };
		}

		error = e;
	}

	function push_logs(log) {
		logs = [...logs, log];
	}

	function clear_logs() {
		logs = [];
	}

	onMount(() => {
	});

	if ($$props.error === void 0 && $$bindings.error && error !== void 0) $$bindings.error(error);
	if ($$props.setProp === void 0 && $$bindings.setProp && setProp !== void 0) $$bindings.setProp(setProp);
	if ($$props.status === void 0 && $$bindings.status && status !== void 0) $$bindings.status(status);
	if ($$props.relaxed === void 0 && $$bindings.relaxed && relaxed !== void 0) $$bindings.relaxed(relaxed);
	if ($$props.injectedJS === void 0 && $$bindings.injectedJS && injectedJS !== void 0) $$bindings.injectedJS(injectedJS);
	if ($$props.injectedCSS === void 0 && $$bindings.injectedCSS && injectedCSS !== void 0) $$bindings.injectedCSS(injectedCSS);
	$$result.css.add(css$7);

	{
		if (ready) apply_bundle($bundle);
	}

	styles = injectedCSS && `{
		const style = document.createElement('style');
		style.textContent = ${JSON.stringify(injectedCSS)};
		document.head.appendChild(style);
	}`;

	$$unsubscribe_bundle();

	return `<div class="iframe-container svelte-1n49w9s"><div style="height: 100%"><iframe title="Result" sandbox="${"allow-popups-to-escape-sandbox allow-scripts allow-popups\n      allow-forms allow-pointer-lock allow-top-navigation allow-modals " + escape(relaxed ? 'allow-same-origin' : '', true)}" class="${[
		escape(null_to_empty(error || pending || pending_imports ? 'greyed-out' : ''), true) + " svelte-1n49w9s",
		inited ? "inited" : ""
	].join(' ').trim()}"${add_attribute("srcdoc", srcdoc, 0)}${add_attribute("this", iframe, 0)}></iframe></div> <div class="overlay svelte-1n49w9s">${error
	? `${validate_component(Message, "Message").$$render($$result, { kind: "error", details: error }, {}, {})}`
	: `${status || !$bundle
		? `${validate_component(Message, "Message").$$render($$result, { kind: "info", truncate: true }, {}, {
				default: () => {
					return `${escape(status || 'loading Svelte compiler...')}`;
				}
			})}`
		: ``}`}</div></div>`;
});

const workers$1 = new Map();

let uid$1 = 1;

class Compiler {
	constructor(workersUrl, svelteUrl) {
		if (!workers$1.has(svelteUrl)) {
			const worker = new Worker(`${workersUrl}/compiler.js`);
			worker.postMessage({ type: 'init', svelteUrl });
			workers$1.set(svelteUrl, worker);
		}

		this.worker = workers$1.get(svelteUrl);

		this.handlers = new Map();

		this.worker.addEventListener('message', event => {
			const handler = this.handlers.get(event.data.id);

			if (handler) { // if no handler, was meant for a different REPL
				handler(event.data.result);
				this.handlers.delete(event.data.id);
			}
		});
	}

	compile(component, options) {
		return new Promise(fulfil => {
			const id = uid$1++;

			this.handlers.set(id, fulfil);

			this.worker.postMessage({
				id,
				type: 'compile',
				source: component.source,
				options: Object.assign({
					name: component.name,
					filename: `${component.name}.svelte`
				}, options),
				entry: component.name === 'App'
			});
		});
	}

	destroy() {
		this.worker.terminate();
	}
}

const is_browser = typeof window !== 'undefined';

/* src/components/Repl/Output/index.svelte generated by Svelte v4.0.0 */

const css$6 = {
	code: ".tab-content.svelte-1vwhaj2{position:absolute;width:100%;height:100% !important;opacity:0;pointer-events:none}.tab-content.visible.svelte-1vwhaj2{opacity:1;pointer-events:all}",
	map: "{\"version\":3,\"file\":\"index.svelte\",\"sources\":[\"index.svelte\"],\"sourcesContent\":[\"<script>\\n  import { getContext, onMount } from \\\"svelte\\\";\\n  import SplitPane from \\\"../SplitPane.svelte\\\";\\n  import Viewer from \\\"./Viewer.svelte\\\";\\n  import PaneWithPanel from \\\"./PaneWithPanel.svelte\\\";\\n  import CompilerOptions from \\\"./CompilerOptions.svelte\\\";\\n  import Compiler from \\\"./Compiler.js\\\";\\n  import CodeMirror from \\\"../CodeMirror.svelte\\\";\\n  import { is_browser } from \\\"../env.js\\\";\\n\\n  const { register_output } = getContext(\\\"REPL\\\");\\n\\n  export let svelteUrl;\\n  export let workersUrl;\\n  export let status;\\n  export let runtimeError = null;\\n  export let relaxed = false;\\n  export let injectedJS;\\n  export let injectedCSS;\\n  export let funky = false;\\n\\n  injectedCSS = `code[class*=language-],pre[class*=language-]{color:#657b83;font-family:Consolas,Monaco,'Andale Mono','Ubuntu Mono',monospace;font-size:0.9em;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none}code[class*=language-] ::-moz-selection,code[class*=language-]::-moz-selection,pre[class*=language-] ::-moz-selection,pre[class*=language-]::-moz-selection{background:#073642}code[class*=language-] ::selection,code[class*=language-]::selection,pre[class*=language-] ::selection,pre[class*=language-]::selection{background:#073642}pre[class*=language-]{padding:1em;margin:.5em 0;overflow:auto;border-radius:.3em}:not(pre)>code[class*=language-],pre[class*=language-]{background-color:#fdf6e3}:not(pre)>code[class*=language-]{padding:.1em;border-radius:.3em}.token.cdata,.token.comment,.token.doctype,.token.prolog{color:#93a1a1}.token.punctuation{color:#586e75}.token.namespace{opacity:.7}.token.boolean,.token.constant,.token.deleted,.token.number,.token.property,.token.symbol,.token.tag{color:#268bd2}.token.attr-name,.token.builtin,.token.char,.token.inserted,.token.selector,.token.string,.token.url{color:#2aa198}.token.entity{color:#657b83;background:#eee8d5}.token.atrule,.token.attr-value,.token.keyword{color:#859900}.token.class-name,.token.function{color:#b58900}.token.important,.token.regex,.token.variable{color:#cb4b16}.token.bold,.token.important{font-weight:700}.token.italic{font-style:italic}.token.entity{cursor:help}`;\\n\\n  let foo; // TODO workaround for https://github.com/sveltejs/svelte/issues/2122\\n\\n  register_output({\\n    set: async (selected, options) => {\\n      if (selected.type === \\\"js\\\") {\\n        js_editor.set(`/* Select a component to see its compiled code */`);\\n        css_editor.set(`/* Select a component to see its compiled code */`);\\n        return;\\n      }\\n\\n      const compiled = await compiler.compile(selected, options);\\n      if (!js_editor) return; // unmounted\\n\\n      js_editor.set(compiled.js, \\\"js\\\");\\n      css_editor.set(compiled.css, \\\"css\\\");\\n    },\\n\\n    update: async (selected, options) => {\\n      if (selected.type === \\\"js\\\") return;\\n\\n      const compiled = await compiler.compile(selected, options);\\n      if (!js_editor) return; // unmounted\\n\\n      js_editor.update(compiled.js);\\n      css_editor.update(compiled.css);\\n    }\\n  });\\n\\n  const compiler = is_browser && new Compiler(workersUrl, svelteUrl);\\n\\n  // refs\\n  let viewer;\\n  let js_editor;\\n  let css_editor;\\n  const setters = {};\\n\\n  let view = \\\"result\\\";\\n</script>\\n\\n<style>\\n  .tab-content {\\n    position: absolute;\\n    width: 100%;\\n    height: 100% !important;\\n    opacity: 0;\\n    pointer-events: none;\\n  }\\n\\n  .tab-content.visible {\\n    /* can't use visibility due to a weird painting bug in Chrome */\\n    opacity: 1;\\n    pointer-events: all;\\n  }\\n</style>\\n\\n<div class=\\\"tab-content\\\" class:visible={view === 'result'}>\\n  <Viewer\\n    {funky}\\n    bind:this={viewer}\\n    bind:error={runtimeError}\\n    {status}\\n    {relaxed}\\n    {injectedJS}\\n    {injectedCSS} />\\n</div>\\n\"],\"names\":[],\"mappings\":\"AA+DE,2BAAa,CACX,QAAQ,CAAE,QAAQ,CAClB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CAAC,UAAU,CACvB,OAAO,CAAE,CAAC,CACV,cAAc,CAAE,IAClB,CAEA,YAAY,uBAAS,CAEnB,OAAO,CAAE,CAAC,CACV,cAAc,CAAE,GAClB\"}"
};

const Output = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	const { register_output } = getContext("REPL");
	let { svelteUrl } = $$props;
	let { workersUrl } = $$props;
	let { status } = $$props;
	let { runtimeError = null } = $$props;
	let { relaxed = false } = $$props;
	let { injectedJS } = $$props;
	let { injectedCSS } = $$props;
	let { funky = false } = $$props;
	injectedCSS = `code[class*=language-],pre[class*=language-]{color:#657b83;font-family:Consolas,Monaco,'Andale Mono','Ubuntu Mono',monospace;font-size:0.9em;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none}code[class*=language-] ::-moz-selection,code[class*=language-]::-moz-selection,pre[class*=language-] ::-moz-selection,pre[class*=language-]::-moz-selection{background:#073642}code[class*=language-] ::selection,code[class*=language-]::selection,pre[class*=language-] ::selection,pre[class*=language-]::selection{background:#073642}pre[class*=language-]{padding:1em;margin:.5em 0;overflow:auto;border-radius:.3em}:not(pre)>code[class*=language-],pre[class*=language-]{background-color:#fdf6e3}:not(pre)>code[class*=language-]{padding:.1em;border-radius:.3em}.token.cdata,.token.comment,.token.doctype,.token.prolog{color:#93a1a1}.token.punctuation{color:#586e75}.token.namespace{opacity:.7}.token.boolean,.token.constant,.token.deleted,.token.number,.token.property,.token.symbol,.token.tag{color:#268bd2}.token.attr-name,.token.builtin,.token.char,.token.inserted,.token.selector,.token.string,.token.url{color:#2aa198}.token.entity{color:#657b83;background:#eee8d5}.token.atrule,.token.attr-value,.token.keyword{color:#859900}.token.class-name,.token.function{color:#b58900}.token.important,.token.regex,.token.variable{color:#cb4b16}.token.bold,.token.important{font-weight:700}.token.italic{font-style:italic}.token.entity{cursor:help}`;

	register_output({
		set: async (selected, options) => {
			if (selected.type === "js") {
				js_editor.set(`/* Select a component to see its compiled code */`);
				css_editor.set(`/* Select a component to see its compiled code */`);
				return;
			}

			const compiled = await compiler.compile(selected, options);
			if (!js_editor) return; // unmounted
			js_editor.set(compiled.js, "js");
			css_editor.set(compiled.css, "css");
		},
		update: async (selected, options) => {
			if (selected.type === "js") return;
			const compiled = await compiler.compile(selected, options);
			if (!js_editor) return; // unmounted
			js_editor.update(compiled.js);
			css_editor.update(compiled.css);
		}
	});

	const compiler = is_browser && new Compiler(workersUrl, svelteUrl);

	// refs
	let viewer;

	let js_editor;
	let css_editor;
	if ($$props.svelteUrl === void 0 && $$bindings.svelteUrl && svelteUrl !== void 0) $$bindings.svelteUrl(svelteUrl);
	if ($$props.workersUrl === void 0 && $$bindings.workersUrl && workersUrl !== void 0) $$bindings.workersUrl(workersUrl);
	if ($$props.status === void 0 && $$bindings.status && status !== void 0) $$bindings.status(status);
	if ($$props.runtimeError === void 0 && $$bindings.runtimeError && runtimeError !== void 0) $$bindings.runtimeError(runtimeError);
	if ($$props.relaxed === void 0 && $$bindings.relaxed && relaxed !== void 0) $$bindings.relaxed(relaxed);
	if ($$props.injectedJS === void 0 && $$bindings.injectedJS && injectedJS !== void 0) $$bindings.injectedJS(injectedJS);
	if ($$props.injectedCSS === void 0 && $$bindings.injectedCSS && injectedCSS !== void 0) $$bindings.injectedCSS(injectedCSS);
	if ($$props.funky === void 0 && $$bindings.funky && funky !== void 0) $$bindings.funky(funky);
	$$result.css.add(css$6);
	let $$settled;
	let $$rendered;

	do {
		$$settled = true;

		$$rendered = `<div class="${["tab-content svelte-1vwhaj2", "visible" ].join(' ').trim()}">${validate_component(Viewer, "Viewer").$$render(
			$$result,
			{
				funky,
				status,
				relaxed,
				injectedJS,
				injectedCSS,
				this: viewer,
				error: runtimeError
			},
			{
				this: $$value => {
					viewer = $$value;
					$$settled = false;
				},
				error: $$value => {
					runtimeError = $$value;
					$$settled = false;
				}
			},
			{}
		)}</div>`;
	} while (!$$settled);

	return $$rendered;
});

const workers = new Map();

let uid = 1;

class Bundler {
	constructor({ workersUrl, packagesUrl, svelteUrl, onstatus }) {
		const hash = `${packagesUrl}:${svelteUrl}`;

		if (!workers.has(hash)) {
			const worker = new Worker(`${workersUrl}/bundler.js`);
			worker.postMessage({ type: 'init', packagesUrl, svelteUrl });
			workers.set(hash, worker);
		}

		this.worker = workers.get(hash);

		this.handlers = new Map();

		this.worker.addEventListener('message', event => {
			const handler = this.handlers.get(event.data.uid);

			if (handler) { // if no handler, was meant for a different REPL
				if (event.data.type === 'status') {
					onstatus(event.data.message);
					return;
				}

				onstatus(null);
				handler(event.data);
				this.handlers.delete(event.data.uid);
			}
		});
	}

	bundle(components) {
		return new Promise(fulfil => {
			this.handlers.set(uid, fulfil);

			this.worker.postMessage({
				uid,
				type: 'bundle',
				components
			});

			uid += 1;
		});
	}

	destroy() {
		this.worker.terminate();
	}
}

/* src/components/Repl/Repl.svelte generated by Svelte v4.0.0 */

const css$5 = {
	code: ".container.svelte-u25bem.svelte-u25bem{position:relative;width:100%;height:100%}.container.svelte-u25bem section{position:relative;padding:63px 0 0 0;height:100%;box-sizing:border-box}.container.svelte-u25bem section>*:first-child{position:absolute;top:0;left:0;width:100%;height:63px;box-sizing:border-box;border-bottom:1px solid #eee}.container.svelte-u25bem section>*:last-child{width:100%;height:100%}.funky.svelte-u25bem.svelte-u25bem{border-radius:3px;box-shadow:0 0 0 3px rgba(0, 0, 0, 0.02);overflow:hidden;border:1px solid #ddd}.container.svelte-u25bem section.svelte-u25bem{position:absolute;top:0;height:100%;width:100%;overflow:hidden}",
	map: "{\"version\":3,\"file\":\"Repl.svelte\",\"sources\":[\"Repl.svelte\"],\"sourcesContent\":[\"<script>\\n  import { setContext, createEventDispatcher } from \\\"svelte\\\";\\n  import { writable } from \\\"svelte/store\\\";\\n  import SplitPane from \\\"./SplitPane.svelte\\\";\\n  import ComponentSelector from \\\"./Input/ComponentSelector.svelte\\\";\\n  import ModuleEditor from \\\"./Input/ModuleEditor.svelte\\\";\\n  import Output from \\\"./Output/index.svelte\\\";\\n  import Bundler from \\\"./Bundler.js\\\";\\n  import { is_browser } from \\\"./env.js\\\";\\n\\n  export let workersUrl;\\n  export let packagesUrl = \\\"https://unpkg.com\\\";\\n  export let svelteUrl = `${packagesUrl}/svelte@3.59.2`;\\n  export let orientation = \\\"columns\\\";\\n  export let relaxed = false;\\n  export let fixed = false;\\n  export let fixedPos = 50;\\n  export let injectedJS = \\\"\\\";\\n  export let injectedCSS = \\\"\\\";\\n  export let funky = false;\\n\\n  export function toJSON() {\\n    return {\\n      imports: $bundle.imports,\\n      components: $components,\\n    };\\n  }\\n\\n  export async function set(data) {\\n    components.set(data.components);\\n    selected.set(data.components[0]);\\n\\n    rebundle();\\n\\n    await module_editor_ready;\\n    await output_ready;\\n\\n    injectedCSS = data.css || \\\"\\\";\\n    module_editor.set($selected.source, $selected.type);\\n    output.set($selected, $compile_options);\\n  }\\n\\n  export function update(data) {\\n    const { name, type } = $selected || {};\\n\\n    components.set(data.components);\\n    const matched_component = data.components.find(\\n      (file) => file.name === name && file.type === type\\n    );\\n    selected.set(matched_component || data.components[0]);\\n\\n    injectedCSS = data.css || \\\"\\\";\\n\\n    if (matched_component) {\\n      module_editor.update(matched_component.source);\\n      output.update(matched_component, $compile_options);\\n    } else {\\n      module_editor.set(matched_component.source, matched_component.type);\\n      output.set(matched_component, $compile_options);\\n    }\\n  }\\n\\n  if (!workersUrl) {\\n    throw new Error(`You must supply workersUrl prop to <Repl>`);\\n  }\\n\\n  const dispatch = createEventDispatcher();\\n\\n  const components = writable([]);\\n  const selected = writable(null);\\n  const bundle = writable(null);\\n\\n  const compile_options = writable({\\n    generate: \\\"dom\\\",\\n    dev: false,\\n    css: false,\\n    hydratable: false,\\n    customElement: false,\\n    immutable: false,\\n    legacy: false,\\n  });\\n\\n  let module_editor;\\n  let output;\\n\\n  let current_token;\\n  async function rebundle() {\\n    const token = (current_token = {});\\n    const result = await bundler.bundle($components);\\n    if (result && token === current_token) bundle.set(result);\\n  }\\n\\n  // TODO this is a horrible kludge, written in a panic. fix it\\n  let fulfil_module_editor_ready;\\n  let module_editor_ready = new Promise(\\n    (f) => (fulfil_module_editor_ready = f)\\n  );\\n\\n  let fulfil_output_ready;\\n  let output_ready = new Promise((f) => (fulfil_output_ready = f));\\n\\n  setContext(\\\"REPL\\\", {\\n    components,\\n    selected,\\n    bundle,\\n    compile_options,\\n\\n    rebundle,\\n\\n    navigate: (item) => {\\n      const match = /^(.+)\\\\.(\\\\w+)$/.exec(item.filename);\\n      if (!match) return; // ???\\n\\n      const [, name, type] = match;\\n      const component = $components.find(\\n        (c) => c.name === name && c.type === type\\n      );\\n      handle_select(component);\\n\\n      // TODO select the line/column in question\\n    },\\n\\n    handle_change: (event) => {\\n      selected.update((component) => {\\n        // TODO this is a bit hacky — we're relying on mutability\\n        // so that updating components works... might be better\\n        // if a) components had unique IDs, b) we tracked selected\\n        // *index* rather than component, and c) `selected` was\\n        // derived from `components` and `index`\\n        component.source = event.detail.value;\\n        return component;\\n      });\\n\\n      components.update((c) => c);\\n      output.update($selected, $compile_options);\\n\\n      rebundle();\\n\\n      dispatch(\\\"change\\\", {\\n        components: $components,\\n      });\\n    },\\n\\n    register_module_editor(editor) {\\n      module_editor = editor;\\n      fulfil_module_editor_ready();\\n    },\\n\\n    register_output(handlers) {\\n      output = handlers;\\n      fulfil_output_ready();\\n    },\\n\\n    request_focus() {\\n      module_editor.focus();\\n    },\\n  });\\n\\n  function handle_select(component) {\\n    selected.set(component);\\n    module_editor.set(component.source, component.type);\\n    output.set($selected, $compile_options);\\n  }\\n\\n  let input;\\n  let sourceErrorLoc;\\n  let runtimeErrorLoc; // TODO refactor this stuff — runtimeErrorLoc is unused\\n  let status = null;\\n\\n  const bundler =\\n    is_browser &&\\n    new Bundler({\\n      workersUrl,\\n      packagesUrl,\\n      svelteUrl,\\n      onstatus: (message) => {\\n        status = message;\\n      },\\n    });\\n\\n  $: if (output && $selected) {\\n    output.update($selected, $compile_options);\\n  }\\n</script>\\n\\n<style>\\n  .container {\\n    position: relative;\\n    width: 100%;\\n    height: 100%;\\n  }\\n\\n  .container :global(section) {\\n    position: relative;\\n    padding: 63px 0 0 0;\\n    height: 100%;\\n    box-sizing: border-box;\\n  }\\n\\n  .container :global(section) > :global(*):first-child {\\n    position: absolute;\\n    top: 0;\\n    left: 0;\\n    width: 100%;\\n    height: 63px;\\n    box-sizing: border-box;\\n    border-bottom: 1px solid #eee;\\n  }\\n\\n  .container :global(section) > :global(*):last-child {\\n    width: 100%;\\n    height: 100%;\\n  }\\n\\n  .funky {\\n    border-radius: 3px;\\n    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.02);\\n    overflow: hidden;\\n    border: 1px solid #ddd;\\n  }\\n\\n  .container section {\\n    position: absolute;\\n    top: 0;\\n    height: 100%;\\n    width: 100%;\\n    overflow: hidden;\\n  }\\n</style>\\n\\n<div class=\\\"container\\\" class:orientation>\\n  <SplitPane\\n    type={orientation === 'rows' ? 'vertical' : 'horizontal'}\\n    pos={fixed ? fixedPos : orientation === 'rows' ? 50 : 50}\\n    {fixed}>\\n    <section slot=\\\"a\\\" class:funky>\\n      <ComponentSelector {handle_select} {funky} />\\n      <ModuleEditor\\n        bind:this={input}\\n        errorLoc={sourceErrorLoc || runtimeErrorLoc} />\\n    </section>\\n\\n    <section slot=\\\"b\\\">\\n      <Output\\n        walk={true}\\n        {funky}\\n        {svelteUrl}\\n        {workersUrl}\\n        {status}\\n        {relaxed}\\n        {injectedJS}\\n        {injectedCSS} />\\n    </section>\\n  </SplitPane>\\n</div>\\n\"],\"names\":[],\"mappings\":\"AA0LE,sCAAW,CACT,QAAQ,CAAE,QAAQ,CAClB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IACV,CAEA,wBAAU,CAAS,OAAS,CAC1B,QAAQ,CAAE,QAAQ,CAClB,OAAO,CAAE,IAAI,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CACnB,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,UACd,CAEA,wBAAU,CAAS,OAAQ,CAAW,CAAE,YAAa,CACnD,QAAQ,CAAE,QAAQ,CAClB,GAAG,CAAE,CAAC,CACN,IAAI,CAAE,CAAC,CACP,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,UAAU,CACtB,aAAa,CAAE,GAAG,CAAC,KAAK,CAAC,IAC3B,CAEA,wBAAU,CAAS,OAAQ,CAAW,CAAE,WAAY,CAClD,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IACV,CAEA,kCAAO,CACL,aAAa,CAAE,GAAG,CAClB,UAAU,CAAE,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,GAAG,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CACzC,QAAQ,CAAE,MAAM,CAChB,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,IACpB,CAEA,wBAAU,CAAC,qBAAQ,CACjB,QAAQ,CAAE,QAAQ,CAClB,GAAG,CAAE,CAAC,CACN,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,IAAI,CACX,QAAQ,CAAE,MACZ\"}"
};

const Repl = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let $compile_options, $$unsubscribe_compile_options;
	let $selected, $$unsubscribe_selected;
	let $components, $$unsubscribe_components;
	let $bundle, $$unsubscribe_bundle;
	let { workersUrl } = $$props;
	let { packagesUrl = "https://unpkg.com" } = $$props;
	let { svelteUrl = `${packagesUrl}/svelte@3.59.2` } = $$props;
	let { orientation = "columns" } = $$props;
	let { relaxed = false } = $$props;
	let { fixed = false } = $$props;
	let { fixedPos = 50 } = $$props;
	let { injectedJS = "" } = $$props;
	let { injectedCSS = "" } = $$props;
	let { funky = false } = $$props;

	function toJSON() {
		return {
			imports: $bundle.imports,
			components: $components
		};
	}

	async function set(data) {
		components.set(data.components);
		selected.set(data.components[0]);
		rebundle();
		await module_editor_ready;
		await output_ready;
		injectedCSS = data.css || "";
		module_editor.set($selected.source, $selected.type);
		output.set($selected, $compile_options);
	}

	function update(data) {
		const { name, type } = $selected || {};
		components.set(data.components);
		const matched_component = data.components.find(file => file.name === name && file.type === type);
		selected.set(matched_component || data.components[0]);
		injectedCSS = data.css || "";

		if (matched_component) {
			module_editor.update(matched_component.source);
			output.update(matched_component, $compile_options);
		} else {
			module_editor.set(matched_component.source, matched_component.type);
			output.set(matched_component, $compile_options);
		}
	}

	if (!workersUrl) {
		throw new Error(`You must supply workersUrl prop to <Repl>`);
	}

	const dispatch = createEventDispatcher();
	const components = writable([]);
	$$unsubscribe_components = subscribe(components, value => $components = value);
	const selected = writable(null);
	$$unsubscribe_selected = subscribe(selected, value => $selected = value);
	const bundle = writable(null);
	$$unsubscribe_bundle = subscribe(bundle, value => $bundle = value);

	const compile_options = writable({
		generate: "dom",
		dev: false,
		css: false,
		hydratable: false,
		customElement: false,
		immutable: false,
		legacy: false
	});

	$$unsubscribe_compile_options = subscribe(compile_options, value => $compile_options = value);
	let module_editor;
	let output;
	let current_token;

	async function rebundle() {
		const token = current_token = {};
		const result = await bundler.bundle($components);
		if (result && token === current_token) bundle.set(result);
	}

	// TODO this is a horrible kludge, written in a panic. fix it
	let fulfil_module_editor_ready;

	let module_editor_ready = new Promise(f => fulfil_module_editor_ready = f);
	let fulfil_output_ready;
	let output_ready = new Promise(f => fulfil_output_ready = f);

	setContext("REPL", {
		components,
		selected,
		bundle,
		compile_options,
		rebundle,
		navigate: item => {
			const match = (/^(.+)\.(\w+)$/).exec(item.filename);
			if (!match) return; // ???
			const [,name, type] = match;
			const component = $components.find(c => c.name === name && c.type === type);
			handle_select(component);
		}, // TODO select the line/column in question
		handle_change: event => {
			selected.update(component => {
				// TODO this is a bit hacky — we're relying on mutability
				// so that updating components works... might be better
				// if a) components had unique IDs, b) we tracked selected
				// *index* rather than component, and c) `selected` was
				// derived from `components` and `index`
				component.source = event.detail.value;

				return component;
			});

			components.update(c => c);
			output.update($selected, $compile_options);
			rebundle();
			dispatch("change", { components: $components });
		},
		register_module_editor(editor) {
			module_editor = editor;
			fulfil_module_editor_ready();
		},
		register_output(handlers) {
			output = handlers;
			fulfil_output_ready();
		},
		request_focus() {
			module_editor.focus();
		}
	});

	function handle_select(component) {
		selected.set(component);
		module_editor.set(component.source, component.type);
		output.set($selected, $compile_options);
	}

	let input;
	let runtimeErrorLoc; // TODO refactor this stuff — runtimeErrorLoc is unused
	let status = null;

	const bundler = is_browser && new Bundler({
			workersUrl,
			packagesUrl,
			svelteUrl,
			onstatus: message => {
				status = message;
			}
		});

	if ($$props.workersUrl === void 0 && $$bindings.workersUrl && workersUrl !== void 0) $$bindings.workersUrl(workersUrl);
	if ($$props.packagesUrl === void 0 && $$bindings.packagesUrl && packagesUrl !== void 0) $$bindings.packagesUrl(packagesUrl);
	if ($$props.svelteUrl === void 0 && $$bindings.svelteUrl && svelteUrl !== void 0) $$bindings.svelteUrl(svelteUrl);
	if ($$props.orientation === void 0 && $$bindings.orientation && orientation !== void 0) $$bindings.orientation(orientation);
	if ($$props.relaxed === void 0 && $$bindings.relaxed && relaxed !== void 0) $$bindings.relaxed(relaxed);
	if ($$props.fixed === void 0 && $$bindings.fixed && fixed !== void 0) $$bindings.fixed(fixed);
	if ($$props.fixedPos === void 0 && $$bindings.fixedPos && fixedPos !== void 0) $$bindings.fixedPos(fixedPos);
	if ($$props.injectedJS === void 0 && $$bindings.injectedJS && injectedJS !== void 0) $$bindings.injectedJS(injectedJS);
	if ($$props.injectedCSS === void 0 && $$bindings.injectedCSS && injectedCSS !== void 0) $$bindings.injectedCSS(injectedCSS);
	if ($$props.funky === void 0 && $$bindings.funky && funky !== void 0) $$bindings.funky(funky);
	if ($$props.toJSON === void 0 && $$bindings.toJSON && toJSON !== void 0) $$bindings.toJSON(toJSON);
	if ($$props.set === void 0 && $$bindings.set && set !== void 0) $$bindings.set(set);
	if ($$props.update === void 0 && $$bindings.update && update !== void 0) $$bindings.update(update);
	$$result.css.add(css$5);
	let $$settled;
	let $$rendered;

	do {
		$$settled = true;

		{
			if (output && $selected) {
				output.update($selected, $compile_options);
			}
		}

		$$rendered = `<div class="${["container svelte-u25bem", orientation ? "orientation" : ""].join(' ').trim()}">${validate_component(SplitPane, "SplitPane").$$render(
			$$result,
			{
				type: orientation === 'rows' ? 'vertical' : 'horizontal',
				pos: fixed ? fixedPos : orientation === 'rows' ? 50 : 50,
				fixed
			},
			{},
			{
				b: () => {
					return `<section slot="b" class="svelte-u25bem">${validate_component(Output, "Output").$$render(
						$$result,
						{
							walk: true,
							funky,
							svelteUrl,
							workersUrl,
							status,
							relaxed,
							injectedJS,
							injectedCSS
						},
						{},
						{}
					)}</section>`;
				},
				a: () => {
					return `<section slot="a" class="${["svelte-u25bem", funky ? "funky" : ""].join(' ').trim()}">${validate_component(ComponentSelector, "ComponentSelector").$$render($$result, { handle_select, funky }, {}, {})} ${validate_component(ModuleEditor, "ModuleEditor").$$render(
						$$result,
						{
							errorLoc: runtimeErrorLoc,
							this: input
						},
						{
							this: $$value => {
								input = $$value;
								$$settled = false;
							}
						},
						{}
					)}</section>`;
				}
			}
		)}</div>`;
	} while (!$$settled);

	$$unsubscribe_compile_options();
	$$unsubscribe_selected();
	$$unsubscribe_components();
	$$unsubscribe_bundle();
	return $$rendered;
});

const code_1 = `---
title: Svex up your markdown
count: 25
color: cadetblue
list: [1, 2, 3, 4, "boo"]

---

<script>
	import Boinger from './Boinger.svelte';
	import Section from './Section.svx';
	import Count from './Count.svelte';
  import Seriously from './Seriously.svelte';

	let number = 45;
</script>

# { title }

## Good stuff in your markdown

Markdown is pretty good but sometimes you just need more.

Sometimes you need a boinger like this:

<Boinger color="{ color }"/>

Not many people have a boinger right in their markdown.

## Markdown in your markdown

Sometimes what you wrote last week is so good that you just *have* to include it again.

I'm not gonna stand in the way of your egomania.
>
><Section />
> <Count />
>
>— *Me, May 2019*

Yeah, thats right you can put wigdets in markdown (\`.svx\` files or otherwise). You can put markdown in widgets too.

<Seriously>

### I wasn't joking

\`\`\`
	This is real life
\`\`\`

</Seriously>

Sometimes you need your widgets **inlined** (like this:<Count count="{number}"/>) because why shouldn't you.
Obviously you have access to values defined in YAML (namespaced under \`metadata\`) and anything defined in an fenced \`js exec\` block can be referenced directly.

Normal markdown stuff works too:

| like  | this |
|-------|------|
| table | here |

And *this* and **THIS**. And other stuff. You can also use all your favorite Svelte features, like \`each\` blocks:

<ul>
{#each list as item}
  <li>{item}</li>
{/each}
</ul>

and all the other good Svelte stuff.

`;

const code_2 = `
<script>
	import { flip } from 'svelte/animate';
  import { crossfade, scale } from 'svelte/transition';

	export let color = 'pink';

  const [send, receive] = crossfade({fallback: scale})

  let boingers = [
		{val: 1, boinged: true},
		{val: 2, boinged: true},
		{val: 3, boinged: false},
		{val: 4, boinged: true},
		{val: 5, boinged: false}
	];

  function toggleBoing (id){
		const index = boingers.findIndex(v => v.val === id);
		boingers[index].boinged = !boingers[index].boinged
	}
<\/script>

<div class="container">

	<div class="boingers">
		{#each boingers.filter(v => !v.boinged) as {val} (val)}

			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<div animate:flip
					 in:receive="{{key: val}}"
					 out:send="{{key: val}}"
					 style="background:{color};"
					 on:click="{() => toggleBoing(val)}">{val}</div>
		{/each}
  </div>

	<div class="boingers">
		{#each boingers.filter(v => v.boinged) as {val} (val)}
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<div animate:flip
					 in:receive="{{key: val}}"
					 out:send="{{key: val}}"
					 style="background:{color};"
					 on:click="{() => toggleBoing(val)}">{val}</div>
		{/each}
  </div>

</div>

<style>
	.container {
		width: 300px;
		height: 200px;
		display: flex;
		justify-content: space-between;
  }

	.boingers {
		display: grid;
		grid-template-rows: repeat(3, 1fr);
		grid-template-columns: repeat(2, 1fr);
		grid-gap: 10px;
  }

	.boingers div {
		width: 50px;
		height: 50px;
		display: flex;
		justify-content: center;
		align-items: center;
		color: #eee;
		font-weight: bold;
		border-radius: 2px;
		cursor: pointer;
	}
</style>
`;

const code_3 = `# What i wrote last week

Why am i so smart, how is this possible.
`;

const code_4 = `
<script>
	export let count = 0;
<\/script>

<span class="outer">
	<button on:click="{() => count = count - 1}">-</button>
	<span class="inner">{count}</span>
	<button on:click="{() => count = count + 1}">+</button>
</span>

<style>
	.outer {
		background: darkorange;
		height: 20px;
		font-size: 12px;
		display: inline-flex;
		justify-content: space-between;
		align-items: center;
		transform: translateY(-1px);
		margin: 0 5px;
		border-radius: 3px;
		width: 65px;
		box-shadow: 0 3px 15px 1px rgba(0,0,0,0.3)
  }

	.inner {
		margin: 0 0px;
  }

	button {
		height: 20px;
		padding: 0px 7px 1px 7px;
		margin: 0;
		border: none;
		background: none;
		color: #eee;
		font-weight: bold;
		cursor: pointer;
	}
</style>
`;
const code_5 = `
<div><slot></slot></div>

<style>
	div {
		background: pink;
		border: 23px solid orange;
		padding: 0 15px;
		width: 400px;
		text-align: center;
		transform: translateX(-200px);
		animation: 2s slide infinite alternate ease-in-out;
  }

	@keyframes slide {
		from {
			transform: translateX(-200px)
		}
		to {
			transform: translateX(200px)
		}
	}
</style>
`;

/* src/routes/playground.svelte generated by Svelte v4.0.0 */

const css$4 = {
	code: ".outer.svelte-144m3u.svelte-144m3u{position:absolute;top:80px;left:50px;right:50px;bottom:50px;margin:auto;border-radius:5px;overflow:hidden;box-shadow:0 0 10px 3px rgba(0, 0, 0, 0.2)}.inner.svelte-144m3u.svelte-144m3u{height:100%;width:100%}.mobile.svelte-144m3u .inner.svelte-144m3u{width:200%;height:calc(100% - 42px);transition:transform 0.3s}.mobile.svelte-144m3u .offset.svelte-144m3u{transform:translate(-50%, 0)}.toggle-wrap.svelte-144m3u.svelte-144m3u{display:flex;position:absolute;user-select:none;justify-content:center;align-items:center;width:100%;height:42px;border-top:1px solid var(--second);overflow:hidden}.toggle.svelte-144m3u label.svelte-144m3u{margin:0 0.5em 0;cursor:pointer;user-select:none}.toggle.svelte-144m3u input[type=\"radio\"].svelte-144m3u{display:inline-block;margin-right:0px;width:50%;height:0%;opacity:0;position:relative;z-index:1;cursor:pointer;user-select:none}.toggle-wrapper.svelte-144m3u.svelte-144m3u{display:inline-block;vertical-align:middle;width:40px;height:20px;border-radius:3.5em;position:relative;user-select:none}.toggle-switcher.svelte-144m3u.svelte-144m3u{display:block;position:absolute;top:2px;left:2px;right:100%;width:calc(50% - 4px);height:calc(100% - 4px);border-radius:50%;background-color:#fff;transition:all 0.1s ease-out;z-index:2;cursor:pointer;user-select:none}.toggle-background.svelte-144m3u.svelte-144m3u{display:block;position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;border-radius:3.5em;background-color:cadetblue;transition:all 0.1s ease-out;cursor:pointer;user-select:none}#output.svelte-144m3u:checked~.toggle-switcher.svelte-144m3u{right:0;left:calc(50% + 2px)}#input.svelte-144m3u:checked~.toggle-background.svelte-144m3u{background-color:#333}@media(max-width: 750px){.outer.svelte-144m3u.svelte-144m3u{position:absolute;top:80px;left:20px;right:20px;bottom:20px;margin:auto;border-radius:5px;overflow:hidden;box-shadow:0 0 10px 3px rgba(0, 0, 0, 0.2)}}",
	map: "{\"version\":3,\"file\":\"playground.svelte\",\"sources\":[\"playground.svelte\"],\"sourcesContent\":[\"<script>\\n  import { onMount } from \\\"svelte\\\";\\n  import Repl from \\\"../components/Repl/Repl.svelte\\\";\\n  import { code_1, code_2, code_3, code_4, code_5 } from \\\"./_source.js\\\";\\n\\n  let repl;\\n  let checked = \\\"input\\\";\\n  let width;\\n\\n  $: is_mobile = width < 750;\\n\\n  onMount(() => {\\n    repl.set({\\n      components: [\\n        {\\n          type: \\\"svx\\\",\\n          name: \\\"App\\\",\\n          source: code_1,\\n        },\\n        {\\n          type: \\\"svelte\\\",\\n          name: \\\"Boinger\\\",\\n          source: code_2,\\n        },\\n        {\\n          type: \\\"svx\\\",\\n          name: \\\"Section\\\",\\n          source: code_3,\\n        },\\n        {\\n          type: \\\"svelte\\\",\\n          name: \\\"Count\\\",\\n          source: code_4,\\n        },\\n        {\\n          type: \\\"svelte\\\",\\n          name: \\\"Seriously\\\",\\n          source: code_5,\\n        },\\n      ],\\n    });\\n  });\\n\\n  function handle_select() {\\n    checked = checked === \\\"input\\\" ? \\\"output\\\" : \\\"input\\\";\\n  }\\n</script>\\n\\n<style>\\n  .outer {\\n    position: absolute;\\n    top: 80px;\\n    left: 50px;\\n    right: 50px;\\n    bottom: 50px;\\n    margin: auto;\\n    border-radius: 5px;\\n    overflow: hidden;\\n    box-shadow: 0 0 10px 3px rgba(0, 0, 0, 0.2);\\n  }\\n\\n  .inner {\\n    height: 100%;\\n    width: 100%;\\n  }\\n\\n  .mobile .inner {\\n    width: 200%;\\n    height: calc(100% - 42px);\\n    transition: transform 0.3s;\\n  }\\n\\n  .mobile .offset {\\n    transform: translate(-50%, 0);\\n  }\\n\\n  .toggle-wrap {\\n    display: flex;\\n    position: absolute;\\n    user-select: none;\\n    justify-content: center;\\n    align-items: center;\\n    width: 100%;\\n    height: 42px;\\n    border-top: 1px solid var(--second);\\n    overflow: hidden;\\n  }\\n\\n  .toggle label {\\n    margin: 0 0.5em 0;\\n    cursor: pointer;\\n    user-select: none;\\n  }\\n\\n  .toggle input[type=\\\"radio\\\"] {\\n    display: inline-block;\\n    margin-right: 0px;\\n    width: 50%;\\n    height: 0%;\\n    opacity: 0;\\n    position: relative;\\n    z-index: 1;\\n    cursor: pointer;\\n    user-select: none;\\n  }\\n\\n  .toggle-wrapper {\\n    display: inline-block;\\n    vertical-align: middle;\\n    width: 40px;\\n    height: 20px;\\n    border-radius: 3.5em;\\n    position: relative;\\n    user-select: none;\\n  }\\n\\n  .toggle-switcher {\\n    display: block;\\n    position: absolute;\\n    top: 2px;\\n    left: 2px;\\n    right: 100%;\\n    width: calc(50% - 4px);\\n    height: calc(100% - 4px);\\n    border-radius: 50%;\\n    background-color: #fff;\\n    transition: all 0.1s ease-out;\\n    z-index: 2;\\n    cursor: pointer;\\n    user-select: none;\\n  }\\n\\n  .toggle-background {\\n    display: block;\\n    position: absolute;\\n    top: 0;\\n    left: 0;\\n    width: 100%;\\n    height: 100%;\\n    z-index: 0;\\n    border-radius: 3.5em;\\n    background-color: cadetblue;\\n    transition: all 0.1s ease-out;\\n    cursor: pointer;\\n    user-select: none;\\n  }\\n\\n  #output:checked ~ .toggle-switcher {\\n    right: 0;\\n    left: calc(50% + 2px);\\n  }\\n\\n  #input:checked ~ .toggle-background {\\n    background-color: #333;\\n  }\\n\\n  /* support Windows High Contrast Mode. Credit: Adrian Roselli https://twitter.com/aardrian/status/1021372139990134785 */\\n\\n  @media (max-width: 750px) {\\n    .outer {\\n      position: absolute;\\n      top: 80px;\\n      left: 20px;\\n      right: 20px;\\n      bottom: 20px;\\n      margin: auto;\\n      border-radius: 5px;\\n      overflow: hidden;\\n      box-shadow: 0 0 10px 3px rgba(0, 0, 0, 0.2);\\n    }\\n  }\\n</style>\\n\\n<svelte:window bind:innerWidth={width} />\\n<svelte:head>\\n  <title>mdsvex playground!</title>\\n</svelte:head>\\n\\n<div class=\\\"outer\\\" class:mobile={is_mobile}>\\n  <div class=\\\"inner\\\" class:offset={checked === 'output'}>\\n    <Repl workersUrl=\\\"/workers\\\" bind:this={repl} fixed={is_mobile} />\\n  </div>\\n\\n  {#if is_mobile}\\n    <div class=\\\"toggle-wrap\\\">\\n      <div class=\\\"toggle\\\">\\n        <label for=\\\"input\\\">input</label>\\n        <span class=\\\"toggle-wrapper\\\">\\n          <input\\n            type=\\\"radio\\\"\\n            name=\\\"theme\\\"\\n            id=\\\"input\\\"\\n            bind:group={checked}\\n            value=\\\"input\\\" />\\n          <input\\n            type=\\\"radio\\\"\\n            name=\\\"theme\\\"\\n            id=\\\"output\\\"\\n            bind:group={checked}\\n            value=\\\"output\\\" />\\n          <span\\n            aria-hidden=\\\"true\\\"\\n            class=\\\"toggle-background\\\"\\n            on:click={handle_select} />\\n          <span\\n            aria-hidden=\\\"true\\\"\\n            class=\\\"toggle-switcher\\\"\\n            on:click={handle_select} />\\n        </span>\\n        <label for=\\\"output\\\">output</label>\\n      </div>\\n    </div>\\n  {/if}\\n</div>\\n\"],\"names\":[],\"mappings\":\"AAiDE,kCAAO,CACL,QAAQ,CAAE,QAAQ,CAClB,GAAG,CAAE,IAAI,CACT,IAAI,CAAE,IAAI,CACV,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,MAAM,CAAE,IAAI,CACZ,aAAa,CAAE,GAAG,CAClB,QAAQ,CAAE,MAAM,CAChB,UAAU,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,GAAG,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,GAAG,CAC5C,CAEA,kCAAO,CACL,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,IACT,CAEA,qBAAO,CAAC,oBAAO,CACb,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,KAAK,IAAI,CAAC,CAAC,CAAC,IAAI,CAAC,CACzB,UAAU,CAAE,SAAS,CAAC,IACxB,CAEA,qBAAO,CAAC,qBAAQ,CACd,SAAS,CAAE,UAAU,IAAI,CAAC,CAAC,CAAC,CAC9B,CAEA,wCAAa,CACX,OAAO,CAAE,IAAI,CACb,QAAQ,CAAE,QAAQ,CAClB,WAAW,CAAE,IAAI,CACjB,eAAe,CAAE,MAAM,CACvB,WAAW,CAAE,MAAM,CACnB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,GAAG,CAAC,KAAK,CAAC,IAAI,QAAQ,CAAC,CACnC,QAAQ,CAAE,MACZ,CAEA,qBAAO,CAAC,mBAAM,CACZ,MAAM,CAAE,CAAC,CAAC,KAAK,CAAC,CAAC,CACjB,MAAM,CAAE,OAAO,CACf,WAAW,CAAE,IACf,CAEA,qBAAO,CAAC,KAAK,CAAC,IAAI,CAAC,OAAO,eAAE,CAC1B,OAAO,CAAE,YAAY,CACrB,YAAY,CAAE,GAAG,CACjB,KAAK,CAAE,GAAG,CACV,MAAM,CAAE,EAAE,CACV,OAAO,CAAE,CAAC,CACV,QAAQ,CAAE,QAAQ,CAClB,OAAO,CAAE,CAAC,CACV,MAAM,CAAE,OAAO,CACf,WAAW,CAAE,IACf,CAEA,2CAAgB,CACd,OAAO,CAAE,YAAY,CACrB,cAAc,CAAE,MAAM,CACtB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,aAAa,CAAE,KAAK,CACpB,QAAQ,CAAE,QAAQ,CAClB,WAAW,CAAE,IACf,CAEA,4CAAiB,CACf,OAAO,CAAE,KAAK,CACd,QAAQ,CAAE,QAAQ,CAClB,GAAG,CAAE,GAAG,CACR,IAAI,CAAE,GAAG,CACT,KAAK,CAAE,IAAI,CACX,KAAK,CAAE,KAAK,GAAG,CAAC,CAAC,CAAC,GAAG,CAAC,CACtB,MAAM,CAAE,KAAK,IAAI,CAAC,CAAC,CAAC,GAAG,CAAC,CACxB,aAAa,CAAE,GAAG,CAClB,gBAAgB,CAAE,IAAI,CACtB,UAAU,CAAE,GAAG,CAAC,IAAI,CAAC,QAAQ,CAC7B,OAAO,CAAE,CAAC,CACV,MAAM,CAAE,OAAO,CACf,WAAW,CAAE,IACf,CAEA,8CAAmB,CACjB,OAAO,CAAE,KAAK,CACd,QAAQ,CAAE,QAAQ,CAClB,GAAG,CAAE,CAAC,CACN,IAAI,CAAE,CAAC,CACP,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,OAAO,CAAE,CAAC,CACV,aAAa,CAAE,KAAK,CACpB,gBAAgB,CAAE,SAAS,CAC3B,UAAU,CAAE,GAAG,CAAC,IAAI,CAAC,QAAQ,CAC7B,MAAM,CAAE,OAAO,CACf,WAAW,CAAE,IACf,CAEA,qBAAO,QAAQ,CAAG,8BAAiB,CACjC,KAAK,CAAE,CAAC,CACR,IAAI,CAAE,KAAK,GAAG,CAAC,CAAC,CAAC,GAAG,CACtB,CAEA,oBAAM,QAAQ,CAAG,gCAAmB,CAClC,gBAAgB,CAAE,IACpB,CAIA,MAAO,YAAY,KAAK,CAAE,CACxB,kCAAO,CACL,QAAQ,CAAE,QAAQ,CAClB,GAAG,CAAE,IAAI,CACT,IAAI,CAAE,IAAI,CACV,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,MAAM,CAAE,IAAI,CACZ,aAAa,CAAE,GAAG,CAClB,QAAQ,CAAE,MAAM,CAChB,UAAU,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,GAAG,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,GAAG,CAC5C,CACF\"}"
};

const Playground = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let is_mobile;
	let repl;
	let width;

	onMount(() => {
		repl.set({
			components: [
				{ type: "svx", name: "App", source: code_1 },
				{
					type: "svelte",
					name: "Boinger",
					source: code_2
				},
				{
					type: "svx",
					name: "Section",
					source: code_3
				},
				{
					type: "svelte",
					name: "Count",
					source: code_4
				},
				{
					type: "svelte",
					name: "Seriously",
					source: code_5
				}
			]
		});
	});

	$$result.css.add(css$4);
	let $$settled;
	let $$rendered;

	do {
		$$settled = true;
		is_mobile = width < 750;

		$$rendered = ` ${($$result.head += `${($$result.title = `<title>mdsvex playground!</title>`, "")}`, "")} <div class="${["outer svelte-144m3u", is_mobile ? "mobile" : ""].join(' ').trim()}"><div class="${["inner svelte-144m3u", ""].join(' ').trim()}">${validate_component(Repl, "Repl").$$render(
			$$result,
			{
				workersUrl: "/workers",
				fixed: is_mobile,
				this: repl
			},
			{
				this: $$value => {
					repl = $$value;
					$$settled = false;
				}
			},
			{}
		)}</div> ${is_mobile
		? `<div class="toggle-wrap svelte-144m3u"><div class="toggle svelte-144m3u"><label for="input" class="svelte-144m3u">input</label> <span class="toggle-wrapper svelte-144m3u"><input type="radio" name="theme" id="input" value="input" class="svelte-144m3u"${add_attribute("checked", true, 1)
			}> <input type="radio" name="theme" id="output" value="output" class="svelte-144m3u"${""}> <span aria-hidden="true" class="toggle-background svelte-144m3u"></span> <span aria-hidden="true" class="toggle-switcher svelte-144m3u"></span></span> <label for="output" class="svelte-144m3u">output</label></div></div>`
		: ``}</div>`;
	} while (!$$settled);

	return $$rendered;
});

var component_1 = /*#__PURE__*/Object.freeze({
	__proto__: null,
	'default': Playground
});

const CONTEXT_KEY = {};

/* src/components/Nav.svelte generated by Svelte v4.0.0 */

const css$3 = {
	code: "nav.svelte-p2hwa7{position:absolute;top:0;left:0;right:0}ul.svelte-p2hwa7{list-style:none;display:flex;justify-content:center;padding:10px;margin:10px}li.svelte-p2hwa7{margin:0 10px}a.svelte-p2hwa7{border:none;font-weight:300;color:#333;font-family:\"roboto-full\";display:flex;align-items:center}a.svelte-p2hwa7:hover{text-decoration:underline;border:none;color:#000}a.svelte-p2hwa7 svg{margin:3px 5px 0 0;width:20px;height:20px;opacity:0.8}a.svelte-p2hwa7:hover svg{opacity:1}",
	map: "{\"version\":3,\"file\":\"Nav.svelte\",\"sources\":[\"Nav.svelte\"],\"sourcesContent\":[\"<script>\\n  import { stores } from \\\"@sapper/app\\\";\\n  import GithubIcon from \\\"./GithubIcon.svelte\\\";\\n\\n  const { page } = stores();\\n\\n  let w;\\n  const links = [\\n    [\\\"/\\\", \\\"mdsvex\\\"],\\n    [\\\"/docs\\\", \\\"docs\\\"],\\n    [\\\"/playground\\\", \\\"try\\\"],\\n    [\\\"https://www.github.com/pngwn/mdsvex\\\", \\\"github\\\"]\\n  ];\\n\\n  // $: filtered_links = is_small\\n  //   ? links.filter(([href]) => href === $page.path)\\n  //   : links;\\n\\n  // $: is_small = false && w && w < 930;\\n\\n  // $: console.log(is_small, w);\\n</script>\\n\\n<style>\\n  nav {\\n    position: absolute;\\n    top: 0;\\n    left: 0;\\n    right: 0;\\n  }\\n\\n  ul {\\n    list-style: none;\\n    display: flex;\\n    justify-content: center;\\n    padding: 10px;\\n    margin: 10px;\\n  }\\n\\n  li {\\n    margin: 0 10px;\\n  }\\n\\n  a {\\n    border: none;\\n    font-weight: 300;\\n    color: #333;\\n    font-family: \\\"roboto-full\\\";\\n    display: flex;\\n    align-items: center;\\n  }\\n\\n  a:hover {\\n    text-decoration: underline;\\n    border: none;\\n    color: #000;\\n  }\\n\\n  a :global(svg) {\\n    margin: 3px 5px 0 0;\\n    width: 20px;\\n    height: 20px;\\n    opacity: 0.8;\\n  }\\n\\n  a:hover :global(svg) {\\n    opacity: 1;\\n  }\\n\\n  /* @media (max-width: 930px) {\\n    nav {\\n      left: 0px;\\n      width: 100%;\\n    }\\n  } */\\n</style>\\n\\n<svelte:window bind:innerWidth={w} />\\n\\n<nav>\\n  <ul>\\n    {#each links as [href, title]}\\n      <!-- {#if title === 'github'}\\n        <li>\\n          <a\\n            title=\\\"link to github repository\\\"\\n            href=\\\"https://www.github.com/pngwn/mdsvex\\\">\\n            <GithubIcon />\\n          </a>\\n        </li>\\n      {:else} -->\\n      <li>\\n        <a {href}>{title}</a>\\n      </li>\\n      <!-- {/if} -->\\n    {/each}\\n  </ul>\\n</nav>\\n\\n<!-- <li>\\n\\n    </li> -->\\n\"],\"names\":[],\"mappings\":\"AAwBE,iBAAI,CACF,QAAQ,CAAE,QAAQ,CAClB,GAAG,CAAE,CAAC,CACN,IAAI,CAAE,CAAC,CACP,KAAK,CAAE,CACT,CAEA,gBAAG,CACD,UAAU,CAAE,IAAI,CAChB,OAAO,CAAE,IAAI,CACb,eAAe,CAAE,MAAM,CACvB,OAAO,CAAE,IAAI,CACb,MAAM,CAAE,IACV,CAEA,gBAAG,CACD,MAAM,CAAE,CAAC,CAAC,IACZ,CAEA,eAAE,CACA,MAAM,CAAE,IAAI,CACZ,WAAW,CAAE,GAAG,CAChB,KAAK,CAAE,IAAI,CACX,WAAW,CAAE,aAAa,CAC1B,OAAO,CAAE,IAAI,CACb,WAAW,CAAE,MACf,CAEA,eAAC,MAAO,CACN,eAAe,CAAE,SAAS,CAC1B,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,IACT,CAEA,eAAC,CAAS,GAAK,CACb,MAAM,CAAE,GAAG,CAAC,GAAG,CAAC,CAAC,CAAC,CAAC,CACnB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,OAAO,CAAE,GACX,CAEA,eAAC,MAAM,CAAS,GAAK,CACnB,OAAO,CAAE,CACX\"}"
};

const Nav = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	stores$1();

	const links = [
		["/", "mdsvex"],
		["/docs", "docs"],
		["/playground", "try"],
		["https://www.github.com/pngwn/mdsvex", "github"]
	];

	$$result.css.add(css$3);

	return ` <nav class="svelte-p2hwa7"><ul class="svelte-p2hwa7">${each(links, ([href, title]) => {
		return ` <li class="svelte-p2hwa7"><a${add_attribute("href", href, 0)} class="svelte-p2hwa7">${escape(title)}</a></li> `;
	})}</ul></nav> `;
});

/* src/routes/_layout.svelte generated by Svelte v4.0.0 */

const Layout = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	return `${validate_component(Nav, "Nav").$$render($$result, {}, {}, {})} ${slots.default ? slots.default({}) : ``}`;
});

var root_comp = /*#__PURE__*/Object.freeze({
	__proto__: null,
	'default': Layout
});

/* src/routes/_error.svelte generated by Svelte v4.0.0 */

const css$2 = {
	code: "h1.svelte-8od9u6,p.svelte-8od9u6{margin:0 auto}h1.svelte-8od9u6{font-size:2.8em;font-weight:700;margin:0 0 0.5em 0}p.svelte-8od9u6{margin:1em auto}@media(min-width: 480px){h1.svelte-8od9u6{font-size:4em}}",
	map: "{\"version\":3,\"file\":\"_error.svelte\",\"sources\":[\"_error.svelte\"],\"sourcesContent\":[\"<script>\\n\\texport let status;\\n\\texport let error;\\n\\n\\tconst dev = undefined === 'development';\\n</script>\\n\\n<style>\\n\\th1, p {\\n\\t\\tmargin: 0 auto;\\n\\t}\\n\\n\\th1 {\\n\\t\\tfont-size: 2.8em;\\n\\t\\tfont-weight: 700;\\n\\t\\tmargin: 0 0 0.5em 0;\\n\\t}\\n\\n\\tp {\\n\\t\\tmargin: 1em auto;\\n\\t}\\n\\n\\t@media (min-width: 480px) {\\n\\t\\th1 {\\n\\t\\t\\tfont-size: 4em;\\n\\t\\t}\\n\\t}\\n</style>\\n\\n<svelte:head>\\n\\t<title>{status}</title>\\n</svelte:head>\\n\\n<h1>{status}</h1>\\n\\n<p>{error.message}</p>\\n\\n{#if dev && error.stack}\\n\\t<pre>{error.stack}</pre>\\n{/if}\\n\"],\"names\":[],\"mappings\":\"AAQC,gBAAE,CAAE,eAAE,CACL,MAAM,CAAE,CAAC,CAAC,IACX,CAEA,gBAAG,CACF,SAAS,CAAE,KAAK,CAChB,WAAW,CAAE,GAAG,CAChB,MAAM,CAAE,CAAC,CAAC,CAAC,CAAC,KAAK,CAAC,CACnB,CAEA,eAAE,CACD,MAAM,CAAE,GAAG,CAAC,IACb,CAEA,MAAO,YAAY,KAAK,CAAE,CACzB,gBAAG,CACF,SAAS,CAAE,GACZ,CACD\"}"
};

const Error$1 = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let { status } = $$props;
	let { error } = $$props;
	if ($$props.status === void 0 && $$bindings.status && status !== void 0) $$bindings.status(status);
	if ($$props.error === void 0 && $$bindings.error && error !== void 0) $$bindings.error(error);
	$$result.css.add(css$2);

	return `${($$result.head += `${($$result.title = `<title>${escape(status)}</title>`, "")}`, "")} <h1 class="svelte-8od9u6">${escape(status)}</h1> <p class="svelte-8od9u6">${escape(error.message)}</p> ${``}`;
});

/* src/node_modules/@sapper/internal/App.svelte generated by Svelte v4.0.0 */

const App = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let { stores } = $$props;
	let { error } = $$props;
	let { status } = $$props;
	let { segments } = $$props;
	let { level0 } = $$props;
	let { level1 = null } = $$props;
	let { notify } = $$props;
	afterUpdate(notify);
	setContext(CONTEXT_KEY, stores);
	if ($$props.stores === void 0 && $$bindings.stores && stores !== void 0) $$bindings.stores(stores);
	if ($$props.error === void 0 && $$bindings.error && error !== void 0) $$bindings.error(error);
	if ($$props.status === void 0 && $$bindings.status && status !== void 0) $$bindings.status(status);
	if ($$props.segments === void 0 && $$bindings.segments && segments !== void 0) $$bindings.segments(segments);
	if ($$props.level0 === void 0 && $$bindings.level0 && level0 !== void 0) $$bindings.level0(level0);
	if ($$props.level1 === void 0 && $$bindings.level1 && level1 !== void 0) $$bindings.level1(level1);
	if ($$props.notify === void 0 && $$bindings.notify && notify !== void 0) $$bindings.notify(notify);

	return `  ${validate_component(Layout, "Layout").$$render($$result, Object.assign({}, { segment: segments[0] }, level0.props), {}, {
		default: () => {
			return `${error
			? `${validate_component(Error$1, "Error").$$render($$result, { error, status }, {}, {})}`
			: `${validate_component(level1.component || missing_component, "svelte:component").$$render($$result, Object.assign({}, level1.props), {}, {})}`}`;
		}
	})}`;
});

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter$1(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function page_store(value) {
    const store = writable(value);
    let ready = true;
    function notify() {
        ready = true;
        store.update(val => val);
    }
    function set(new_value) {
        ready = false;
        store.set(new_value);
    }
    function subscribe(run) {
        let old_value;
        return store.subscribe((new_value) => {
            if (old_value === undefined || (ready && new_value !== old_value)) {
                run(old_value = new_value);
            }
        });
    }
    return { notify, set, subscribe };
}

const initial_data = typeof __SAPPER__ !== 'undefined' && __SAPPER__;
const stores = {
    page: page_store({}),
    preloading: writable(null),
    session: writable(initial_data && initial_data.session)
};
stores.session.subscribe((value) => __awaiter$1(void 0, void 0, void 0, function* () {
    return;
}));

const stores$1 = () => getContext(CONTEXT_KEY);

var docs = `<h1 id="mdsvex"><a aria-hidden="true" href="#mdsvex"><span class="icon icon-link"></span></a>mdsvex</h1>
<p>mdsvex is a markdown preprocessor for <a
  href="https://svelte.dev/"
  rel="nofollow"
>Svelte</a> components. Basically <a href="https://mdxjs.com/" rel="nofollow">MDX</a> for Svelte.</p>
<p>This preprocessor allows you to use Svelte components in your markdown, or markdown in your Svelte components.</p>
<p>mdsvex supports all Svelte syntax and <em>almost</em> all markdown syntax. See <a href="docs/#limitations">limitations</a> for more information.</p>
<p>You can do this:</p>
<pre class="language-svx">
<code class="language-svx"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
	<span class="token keyword">import</span> <span class="token punctuation">&#123;</span> Chart <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">"../components/Chart.svelte"</span><span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span>

<span class="token title important"><span class="token punctuation">#</span> Here’s a chart</span>

The chart is rendered inside our MDsveX document.

<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Chart</span> <span class="token punctuation">/></span></span></code>
</pre>
<p>It uses <a href="https://unifiedjs.com/" rel="nofollow">unified</a>, <a href="https://github.com/remarkjs" rel="nofollow">remark</a> and <a href="https://github.com/rehypejs/rehype" rel="nofollow">rehype</a> and you can use any <a
  href="https://github.com/remarkjs/remark/blob/main/doc/plugins.md#list-of-plugins"
  rel="nofollow"
>remark plugins</a> or <a
  href="https://github.com/rehypejs/rehype/blob/main/doc/plugins.md#list-of-plugins"
  rel="nofollow"
>rehype plugins</a> to enhance your experience.</p>
<p><a href="/playground">Try it</a></p>
<h2 id="install-it"><a aria-hidden="true" href="#install-it"><span class="icon icon-link"></span></a>Install it</h2>
<p>Install it as a dev-dependency.</p>
<p>With <code>npm</code>:</p>
<pre class="language-bash">
<code class="language-bash"><span class="token function">npm</span> i --save-dev mdsvex</code>
</pre>
<p>With <code>yarn</code>:</p>
<pre class="language-bash">
<code class="language-bash"><span class="token function">yarn</span> <span class="token function">add</span> --dev mdsvex</code>
</pre>
<h2 id="use-it"><a aria-hidden="true" href="#use-it"><span class="icon icon-link"></span></a>Use it</h2>
<p>There are two named exports from <code>mdsvex</code> that can be used to transform mdsvex documents, <code>mdsvex</code> and <code>compile</code>. <code>mdsvex</code> is a Svelte preprocessor and is the preferred way to use this library. The <code>compile</code> function is useful when you wish to compile mdsvex documents to Svelte components directly, without hooking into the Svelte compiler.</p>
<h3 id="mdsvex-1"><a aria-hidden="true" href="#mdsvex-1"><span class="icon icon-link"></span></a><code>mdsvex</code></h3>
<p>The <code>mdsvex</code> preprocessor function is a named import from the <code>mdsvex</code> module. Add it as a preprocessor to your rollup or webpack config, and tell the Svelte plugin or loader to also handle <code>.svx</code> files.</p>
<p>With rollup and <code>rollup-plugin-svelte</code>:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> <span class="token punctuation">&#123;</span> mdsvex <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">"mdsvex"</span><span class="token punctuation">;</span>

<span class="token keyword">export</span> <span class="token keyword">default</span> <span class="token punctuation">&#123;</span>
	<span class="token operator">...</span>boring_config_stuff<span class="token punctuation">,</span>
	plugins<span class="token operator">:</span> <span class="token punctuation">[</span>
		<span class="token function">svelte</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
			<span class="token comment">// these are the defaults. If you want to add more extensions, see https://mdsvex.pngwn.io/docs#extensions</span>
			extensions<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">".svelte"</span><span class="token punctuation">,</span> <span class="token string">".svx"</span><span class="token punctuation">]</span><span class="token punctuation">,</span>
			preprocess<span class="token operator">:</span> <span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">)</span>
		<span class="token punctuation">&#125;</span><span class="token punctuation">)</span>
	<span class="token punctuation">]</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">;</span></code>
</pre>
<p>With webpack and <code>svelte-loader</code>:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">const</span> <span class="token punctuation">&#123;</span> mdsvex <span class="token punctuation">&#125;</span> <span class="token operator">=</span> <span class="token function">require</span><span class="token punctuation">(</span><span class="token string">'mdsvex'</span><span class="token punctuation">)</span>

<span class="token comment">// add ".svx" to the extensions array</span>
<span class="token keyword">const</span> extensions <span class="token operator">=</span> <span class="token punctuation">[</span><span class="token string">'.mjs'</span><span class="token punctuation">,</span> <span class="token string">'.js'</span><span class="token punctuation">,</span> <span class="token string">'.json'</span><span class="token punctuation">,</span> <span class="token string">'.svelte'</span><span class="token punctuation">,</span> <span class="token string">'.html'</span><span class="token punctuation">,</span> <span class="token string">'.svx'</span><span class="token punctuation">]</span><span class="token punctuation">;</span>

module<span class="token punctuation">.</span>exports <span class="token operator">=</span> <span class="token punctuation">&#123;</span>
	<span class="token operator">...</span>boring_config_stuff<span class="token punctuation">,</span>
	resolve<span class="token operator">:</span> <span class="token punctuation">&#123;</span> alias<span class="token punctuation">,</span> extensions<span class="token punctuation">,</span> mainFields <span class="token punctuation">&#125;</span><span class="token punctuation">,</span>
	module<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		rules<span class="token operator">:</span> <span class="token punctuation">[</span>
			<span class="token punctuation">&#123;</span>
				<span class="token comment">// tell svelte-loader to handle svx files as well</span>
				test<span class="token operator">:</span> <span class="token regex">/\.(svelte|html|svx)$/</span><span class="token punctuation">,</span>
				use<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
					loader<span class="token operator">:</span> <span class="token string">'svelte-loader'</span><span class="token punctuation">,</span>
					options<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
						<span class="token operator">...</span>svelte_options<span class="token punctuation">,</span>
						preprocess<span class="token operator">:</span> <span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">)</span>
					<span class="token punctuation">&#125;</span>
				<span class="token punctuation">&#125;</span>
			<span class="token punctuation">&#125;</span>
		<span class="token punctuation">]</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">;</span></code>
</pre>
<p>If you want to use mdsvex without a bundler because you are your own person, then you can use <code>svelte.preprocess</code> directly:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">const</span> svelte <span class="token operator">=</span> <span class="token function">require</span><span class="token punctuation">(</span><span class="token string">'svelte/compiler'</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token keyword">const</span> <span class="token punctuation">&#123;</span> mdsvex <span class="token punctuation">&#125;</span> <span class="token operator">=</span> <span class="token function">require</span><span class="token punctuation">(</span><span class="token string">'mdsvex'</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// This will give you a valid svelte component</span>
<span class="token keyword">const</span> preprocessed <span class="token operator">=</span> <span class="token keyword">await</span> svelte<span class="token punctuation">.</span><span class="token function">preprocess</span><span class="token punctuation">(</span>
	source<span class="token punctuation">,</span>
	<span class="token function">mdsvex</span><span class="token punctuation">(</span>mdsvex_opts<span class="token punctuation">)</span>
<span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// Now you can compile it if you wish</span>
<span class="token keyword">const</span> compiled <span class="token operator">=</span> svelte<span class="token punctuation">.</span><span class="token function">compile</span><span class="token punctuation">(</span>
	preprocessed<span class="token punctuation">,</span>
	compiler_options
<span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<blockquote>
<p>If you don’t like the <code>.svx</code> file extension, fear not, it is easily customised.</p>
</blockquote>
<h3 id="compile"><a aria-hidden="true" href="#compile"><span class="icon icon-link"></span></a><code>compile</code></h3>
<p>This option performs a very similar task to the preprocessor but it can be used directly, without needing to hook into the Svelte compiler, either directly or via a bundler. The compile option will transform valid mdsvex code into valid svelte code, but it will perform no further actions such as resolving imports.</p>
<p>It supports all of the same options as the preprocessor although the function signature is slightly different. The first argument should be the mdsvex source code you wish to compile, the second argument is an object of options.</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> <span class="token punctuation">&#123;</span> compile <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">'mdsvex'</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> transformed_code <span class="token operator">=</span> <span class="token keyword">await</span> <span class="token function">compile</span><span class="token punctuation">(</span><span class="token template-string"><span class="token template-punctuation string">\`</span><span class="token string">
&lt;script>
  import Chart from './Chart.svelte';
&lt;/script>

# Hello friends

&lt;Chart />
</span><span class="token template-punctuation string">\`</span></span><span class="token punctuation">,</span>
	mdsvexOptions
<span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>In addition to the standard mdsvex options, the options object can also take an optional <code>filename</code> property which will be passed to mdsvex. There is no significant advantage to doing this but this provided filename may be used for error reporting in the future. The extension you give to this filename must match one of the extensions provided in the options (defaults to <code>['.svx']</code>).</p>
<h2 id="options"><a aria-hidden="true" href="#options"><span class="icon icon-link"></span></a>Options</h2>
<p>The preprocessor function accepts an object of options, that allow you to customise your experience. The options are global to all parsed files.</p>
<pre class="language-typescript">
<code class="language-typescript"><span class="token keyword">interface</span> <span class="token class-name">MdsvexOptions</span> <span class="token punctuation">&#123;</span>
	extensions<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">[</span><span class="token punctuation">]</span><span class="token punctuation">;</span>
	smartypants<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> smartypantsOptions<span class="token punctuation">;</span>
	layout<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token operator">|</span> <span class="token punctuation">&#123;</span> <span class="token punctuation">[</span>name<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">]</span><span class="token operator">:</span> <span class="token builtin">string</span> <span class="token punctuation">&#125;</span><span class="token punctuation">;</span>
	remarkPlugins<span class="token operator">:</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span>plugin<span class="token operator">></span> <span class="token operator">|</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span><span class="token punctuation">[</span>plugin<span class="token punctuation">,</span> plugin_options<span class="token punctuation">]</span><span class="token operator">></span><span class="token punctuation">;</span>
	rehypePlugins<span class="token operator">:</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span>plugin<span class="token operator">></span> <span class="token operator">|</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span><span class="token punctuation">[</span>plugin<span class="token punctuation">,</span> plugin_options<span class="token punctuation">]</span><span class="token operator">></span><span class="token punctuation">;</span>
	highlight<span class="token operator">:</span> <span class="token punctuation">&#123;</span> highlighter<span class="token operator">:</span> <span class="token builtin">Function</span><span class="token punctuation">,</span> alias<span class="token operator">:</span> <span class="token punctuation">&#123;</span> <span class="token punctuation">[</span>alias<span class="token punctuation">]</span><span class="token operator">:</span> lang <span class="token punctuation">&#125;</span> <span class="token punctuation">&#125;</span><span class="token punctuation">;</span>
	frontmatter<span class="token operator">:</span> <span class="token punctuation">&#123;</span> parse<span class="token operator">:</span> <span class="token builtin">Function</span><span class="token punctuation">;</span> marker<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token punctuation">&#125;</span><span class="token punctuation">;</span>
<span class="token punctuation">&#125;</span></code>
</pre>
<h3 id="extensions"><a aria-hidden="true" href="#extensions"><span class="icon icon-link"></span></a><code>extensions</code></h3>
<pre class="language-ts">
<code class="language-ts">extensions<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">[</span><span class="token punctuation">]</span> <span class="token operator">=</span> <span class="token punctuation">[</span><span class="token string">".svx"</span><span class="token punctuation">]</span><span class="token punctuation">;</span></code>
</pre>
<p>The <code>extensions</code> option allows you to set custom file extensions for files written in mdsvex; the default value is <code>['.svx']</code>. Whatever value you choose here must be passed to the <code>extensions</code> field of <code>rollup-plugin-svelte</code> or <code>svelte-loader</code>. If you do not change the default, you must still pass the extension name to the plugin or loader config.</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">export</span> <span class="token keyword">default</span> <span class="token punctuation">&#123;</span>
	<span class="token operator">...</span>config<span class="token punctuation">,</span>
	plugins<span class="token operator">:</span> <span class="token punctuation">[</span>
		<span class="token function">svelte</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
			extensions<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">".svelte"</span><span class="token punctuation">,</span> <span class="token string">".custom"</span><span class="token punctuation">]</span><span class="token punctuation">,</span>
			preprocess<span class="token operator">:</span> <span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
				extensions<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">".custom"</span><span class="token punctuation">]</span>
			<span class="token punctuation">&#125;</span><span class="token punctuation">)</span>
		<span class="token punctuation">&#125;</span><span class="token punctuation">)</span>
	<span class="token punctuation">]</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">;</span></code>
</pre>
<p>To import markdown files as components, add <code>.md</code> to both the Svelte compiler and <code>mdsvex</code> extensions:</p>
<pre class="language-js">
<code class="language-js"><span class="token comment">// svelte.config.js</span>
<span class="token keyword">import</span> <span class="token punctuation">&#123;</span> mdsvex <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">'mdsvex'</span>

<span class="token keyword">export</span> <span class="token keyword">default</span> <span class="token punctuation">&#123;</span>
  extensions<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">'.svelte'</span><span class="token punctuation">,</span> <span class="token string">'.svx'</span><span class="token punctuation">,</span> <span class="token string">'.md'</span><span class="token punctuation">]</span><span class="token punctuation">,</span>
  preprocess<span class="token operator">:</span> <span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span> extensions<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">'.svx'</span><span class="token punctuation">,</span> <span class="token string">'.md'</span><span class="token punctuation">]</span> <span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">,</span>
<span class="token punctuation">&#125;</span></code>
</pre>
<p>Then you can do:</p>
<pre class="language-svx">
<code class="language-svx"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">import</span> Readme <span class="token keyword">from</span> <span class="token string">'../readme.md'</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span>

<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Readme</span> <span class="token punctuation">/></span></span></code>
</pre>
<h3 id="smartypants"><a aria-hidden="true" href="#smartypants"><span class="icon icon-link"></span></a><code>smartypants</code></h3>
<pre class="language-ts">
<code class="language-ts">smartypants<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> <span class="token punctuation">&#123;</span>
	quotes<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span>
	ellipses<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span>
	backticks<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> <span class="token string">'all'</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span>
	dashes<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> <span class="token string">'oldschool'</span> <span class="token operator">|</span> <span class="token string">'inverted'</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span>
<span class="token punctuation">&#125;</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span></code>
</pre>
<p>The <code>smartypants</code> option transforms ASCII punctuation into fancy typographic punctuation HTML entities.</p>
<p>It turns stuff like:</p>
<pre class="language-md">
<code class="language-md">"They said it was free..."</code>
</pre>
<p>into:</p>
<blockquote>
<p>“They said it was free…”</p>
</blockquote>
<p>Notice the beautiful punctuation. It does other nice things.</p>
<p><code>smartypants</code> can be either a <code>boolean</code> (pass <code>false</code> to disable it) or an options object (defaults to <code>true</code>). The possible options are as follows.</p>
<pre class="language-sig">
<code class="language-sig">quotes<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span></code>
</pre>
<p>Converts straight double and single quotes to smart double or single quotes.</p>
<ul>
<li><code>"words"</code> <strong>becomes</strong>: “words”</li>
<li><code>'words'</code> <strong>becomes</strong> ‘words’</li>
</ul>
<pre class="language-sig">
<code class="language-sig">ellipses<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span></code>
</pre>
<p>Converts triple-dot characters (with or without spaces) into a single Unicode ellipsis character.</p>
<ul>
<li><code>words...</code> <strong>becomes</strong> words…</li>
</ul>
<pre class="language-sig">
<code class="language-sig">backticks<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> <span class="token string">'all'</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span></code>
</pre>
<p>When <code>true</code>, converts double back-ticks into an opening double quote, and double straight single quotes into a closing double quote.</p>
<ul>
<li><code>\`\`words''</code> <strong>becomes</strong> “words”</li>
</ul>
<p>When <code>'all'</code> it also converts single back-ticks into a single opening quote, and a single straight quote into a closing single, smart quote.</p>
<p>Note: Quotes can not be <code>true</code> when backticks is <code>'all'</code>;</p>
<pre class="language-sig">
<code class="language-sig">dashes<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> <span class="token string">'oldschool'</span> <span class="token operator">|</span> <span class="token string">'inverted'</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span></code>
</pre>
<p>When <code>true</code>, converts two dashes into an em-dash character.</p>
<ul>
<li><code>--</code> <strong>becomes</strong> —</li>
</ul>
<p>When <code>'oldschool'</code>, converts two dashes into an en-dash, and three dashes into an em-dash.</p>
<ul>
<li><code>--</code> <strong>becomes</strong> –</li>
<li><code>---</code> <strong>becomes</strong> —</li>
</ul>
<p>When <code>'inverted'</code>, converts two dashes into an em-dash, and three dashes into an en-dash.</p>
<ul>
<li><code>--</code> <strong>becomes</strong> —</li>
<li><code>---</code> <strong>becomes</strong> –</li>
</ul>
<h3 id="layout"><a aria-hidden="true" href="#layout"><span class="icon icon-link"></span></a><code>layout</code></h3>
<pre class="language-ts">
<code class="language-ts">layout<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token operator">|</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span><span class="token builtin">string</span> <span class="token operator">|</span> RegExp<span class="token punctuation">,</span> <span class="token builtin">string</span><span class="token operator">></span><span class="token punctuation">;</span></code>
</pre>
<p>The <code>layout</code> option allows you to provide a custom layout component that will wrap your mdsvex file like so:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Layout</span><span class="token punctuation">></span></span>
 <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>MdsvexDocument</span> <span class="token punctuation">/></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Layout</span><span class="token punctuation">></span></span></code>
</pre>
<blockquote>
<p>Layout components receive all frontmatter values as props, which should provide a great deal of flexibility when designing your layouts.</p>
</blockquote>
<p>You can provide a <code>string</code>, which should be the path to your layout component. An absolute path is preferred but mdsvex tries to resolve relative paths based upon the current working directory.</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> <span class="token punctuation">&#123;</span> join <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">"path"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> path_to_layout <span class="token operator">=</span> <span class="token function">join</span><span class="token punctuation">(</span>__dirname<span class="token punctuation">,</span> <span class="token string">"./src/Layout.svelte"</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	layout<span class="token operator">:</span> path_to_layout
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>In some cases you may want different layouts for different types of document, to address this you may pass an object of named layouts instead. Each key should be a name for your layout, the value should be a path as described above. A fallback layout, or default, can be passed using <code>_</code> (underscore) as a key name.</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	layout<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		blog<span class="token operator">:</span> <span class="token string">"./path/to/blog/layout.svelte"</span><span class="token punctuation">,</span>
		article<span class="token operator">:</span> <span class="token string">"./path/to/article/layout.svelte"</span><span class="token punctuation">,</span>
		_<span class="token operator">:</span> <span class="token string">"./path/to/fallback/layout.svelte"</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<h3 id="remarkplugins--rehypeplugins"><a aria-hidden="true" href="#remarkplugins--rehypeplugins"><span class="icon icon-link"></span></a><code>remarkPlugins</code> / <code>rehypePlugins</code></h3>
<pre class="language-ts">
<code class="language-ts">remarkPlugins<span class="token operator">:</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span>plugin<span class="token operator">></span> <span class="token operator">|</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span><span class="token punctuation">[</span>plugin<span class="token punctuation">,</span> plugin_options<span class="token punctuation">]</span><span class="token operator">></span><span class="token punctuation">;</span>
rehypePlugins<span class="token operator">:</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span>plugin<span class="token operator">></span> <span class="token operator">|</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span><span class="token punctuation">[</span>plugin<span class="token punctuation">,</span> plugin_options<span class="token punctuation">]</span><span class="token operator">></span><span class="token punctuation">;</span></code>
</pre>
<p>mdsvex has a simple pipeline. Your source file is first parsed into a Markdown AST (MDAST), this is where remark plugins would run. Then it is converted into an HTML AST (HAST), this is where rehype plugins would be run. After this it is converted (stringified) into a valid Svelte component ready to be compiled.</p>
<p><a href="https://github.com/remarkjs" rel="nofollow">remark</a> and <a href="https://github.com/rehypejs/rehype" rel="nofollow">rehype</a> have a vibrant plugin ecosystem and mdsvex allows you to pass any <a
  href="https://github.com/remarkjs/remark/blob/main/doc/plugins.md#list-of-plugins"
  rel="nofollow"
>remark plugins</a> or <a
  href="https://github.com/rehypejs/rehype/blob/main/doc/plugins.md#list-of-plugins"
  rel="nofollow"
>rehype plugins</a> as options, which will run on the remark and rehype ASTs at the correct point in the pipeline.</p>
<p>These options take an array. If you do not wish to pass any options to a plugin then you can simply pass an array of plugins like so:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> containers <span class="token keyword">from</span> <span class="token string">"remark-containers"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> github <span class="token keyword">from</span> <span class="token string">"remark-github"</span><span class="token punctuation">;</span>

<span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	remarkPlugins<span class="token operator">:</span> <span class="token punctuation">[</span>containers<span class="token punctuation">,</span> github<span class="token punctuation">]</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>If you <em>do</em> wish to pass options to your plugins then those array items should be an array of <code>[plugin, options]</code>, like so:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> containers <span class="token keyword">from</span> <span class="token string">"remark-containers"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> github <span class="token keyword">from</span> <span class="token string">"remark-github"</span><span class="token punctuation">;</span>

<span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	remarkPlugins<span class="token operator">:</span> <span class="token punctuation">[</span>
		<span class="token punctuation">[</span>containers<span class="token punctuation">,</span> container_opts<span class="token punctuation">]</span><span class="token punctuation">,</span>
		<span class="token punctuation">[</span>github<span class="token punctuation">,</span> github_opts<span class="token punctuation">]</span>
	<span class="token punctuation">]</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>You can mix and match as needed, only providing an array when options are needed:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> containers <span class="token keyword">from</span> <span class="token string">"remark-containers"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> github <span class="token keyword">from</span> <span class="token string">"remark-github"</span><span class="token punctuation">;</span>

<span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	remarkPlugins<span class="token operator">:</span> <span class="token punctuation">[</span>
		<span class="token punctuation">[</span>containers<span class="token punctuation">,</span> container_opts<span class="token punctuation">]</span><span class="token punctuation">,</span>
		github<span class="token punctuation">,</span>
		another_plugin<span class="token punctuation">,</span>
		<span class="token punctuation">[</span>yet_another_plugin<span class="token punctuation">,</span> more_options<span class="token punctuation">]</span>
	<span class="token punctuation">]</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>While these examples use <code>remarkPlugins</code>, the <code>rehypePlugins</code> option works in exactly the same way. You are free to use one or both of these options as you wish.</p>
<p>Remark plugins work on the Markdown AST (MDAST) produced by remark, rehype plugins work on the HTML AST (HAST) produced by rehype and it is possible to write your own custom plugins if the existing ones do not satisfy your needs!</p>
<h3 id="highlight"><a aria-hidden="true" href="#highlight"><span class="icon icon-link"></span></a><code>highlight</code></h3>
<pre class="language-ts">
<code class="language-ts">highlight<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
	<span class="token function-variable function">highlighter</span><span class="token operator">:</span> <span class="token punctuation">(</span>code<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">,</span> lang<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token builtin">string</span> <span class="token operator">|</span> <span class="token builtin">Promise</span><span class="token operator">&lt;</span><span class="token builtin">string</span><span class="token operator">></span>
	alias<span class="token operator">:</span> <span class="token punctuation">&#123;</span> <span class="token punctuation">[</span>lang <span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">]</span><span class="token operator">:</span> <span class="token builtin">string</span> <span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">;</span></code>
</pre>
<p>Without any configuration, mdsvex will automatically highlight the syntax of over 100 languages using <a
  href="https://prismjs.com/"
  rel="nofollow"
>PrismJS</a>, you simply need to add the language name to the fenced code block and import the CSS file for a Prism theme of your choosing. See <a
  href="https://github.com/PrismJS/prism-themes"
  rel="nofollow"
>here for available options</a>. Languages are loaded on-demand and cached for later use, this feature does not unnecessarily load all languages for highlighting purposes.</p>
<p>Custom aliases for language names can be defined via the <code>alias</code> property of the highlight option. This property takes an object of key-value pairs: the key should be the alias you wish to define, the value should be the language you wish to assign it to.</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	highlight<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		alias<span class="token operator">:</span> <span class="token punctuation">&#123;</span> yavascript<span class="token operator">:</span> <span class="token string">"javascript"</span> <span class="token punctuation">&#125;</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span></code>
</pre>
<p>If you wish to handle syntax-highlighting yourself, you can provide a custom highlight function via the <code>highlighter</code> property.  The function will receive two arguments, the <code>code</code> to be highlighted and the <code>lang</code> defined in the fenced code-block, both are strings. You can use this information to highlight as you wish. The function should return a string of highlighted code.</p>
<p>You can disable syntax highlighting by passing a function that does nothing:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">function</span> <span class="token function">highlighter</span><span class="token punctuation">(</span><span class="token parameter">code<span class="token punctuation">,</span> lang</span><span class="token punctuation">)</span> <span class="token punctuation">&#123;</span>
	<span class="token keyword">return</span> <span class="token template-string"><span class="token template-punctuation string">\`</span><span class="token string">&lt;pre>&lt;code></span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">$&#123;</span>code<span class="token interpolation-punctuation punctuation">&#125;</span></span><span class="token string">&lt;/code>&lt;/pre></span><span class="token template-punctuation string">\`</span></span><span class="token punctuation">;</span>
<span class="token punctuation">&#125;</span>

<span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	highlight<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		highlighter
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span></code>
</pre>
<h3 id="frontmatter"><a aria-hidden="true" href="#frontmatter"><span class="icon icon-link"></span></a><code>frontmatter</code></h3>
<pre class="language-ts">
<code class="language-ts">frontmatter<span class="token operator">:</span> <span class="token punctuation">&#123;</span> parse<span class="token operator">:</span> <span class="token builtin">Function</span><span class="token punctuation">,</span> marker<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token punctuation">&#125;</span><span class="token punctuation">;</span></code>
</pre>
<p>By default mdsvex supports yaml frontmatter, this is defined by enclosing the YAML in three hyphens (<code>---</code>). If you want to use a custom language or marker for frontmatter then you can use the <code>frontmatter</code> option.</p>
<p><code>frontmatter</code> should be an object that can contain a <code>marker</code> and a <code>parse</code> property.</p>
<pre class="language-sig">
<code class="language-sig">marker<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token operator">=</span> <span class="token string">'-'</span><span class="token punctuation">;</span></code>
</pre>
<p>The marker option defines the fence for your frontmatter. This defaults to <code>-</code> which corresponds to the standard triple-hyphen syntax (<code>---</code>) that you would normally use to define frontmatter. You can pass in a custom string to change this behaviour:</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	frontmatter<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		marker<span class="token operator">:</span> <span class="token string">"+"</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>Now you can use <code>+++</code> to mark frontmatter. Setting <em>only</em> the marker will keep the default frontmatter parser which only supports YAML.</p>
<pre class="language-sig">
<code class="language-sig"><span class="token function-variable function">parse</span><span class="token operator">:</span> <span class="token punctuation">(</span>frontmatter<span class="token punctuation">,</span> message<span class="token punctuation">)</span> <span class="token operator">=></span> Object <span class="token operator">|</span> <span class="token keyword">undefined</span></code>
</pre>
<p>The <code>parse</code> property accepts a function which allows you to provide a custom parser for frontmatter. This is useful if you want to use a different language in your frontmatter.</p>
<p>The parse function gets the raw frontmatter as the first argument and a <code>messages</code> array as the second.</p>
<p>If parsing is successful, the function should return the parsed frontmatter (as an object of key-value pairs), if there is a problem the function should return <code>undefined</code> or <code>false</code> . Any parsing errors or warnings should be pushed into the <code>messages</code> array which will be printed to the console when mdsvex has finished parsing. If you would prefer to throw an error, you are free to do so but it will interrupt the parsing process.</p>
<p>In the following example, we will modify the frontmatter handling so we can write our frontmatter in TOML with a triple-<code>+</code> fence.</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	marker<span class="token operator">:</span> <span class="token string">"+"</span><span class="token punctuation">,</span>
	<span class="token function">parse</span><span class="token punctuation">(</span><span class="token parameter">frontmatter<span class="token punctuation">,</span> messages</span><span class="token punctuation">)</span> <span class="token punctuation">&#123;</span>
		<span class="token keyword">try</span> <span class="token punctuation">&#123;</span>
			<span class="token keyword">return</span> toml<span class="token punctuation">.</span><span class="token function">parse</span><span class="token punctuation">(</span>frontmatter<span class="token punctuation">)</span><span class="token punctuation">;</span>
		<span class="token punctuation">&#125;</span> <span class="token keyword">catch</span> <span class="token punctuation">(</span>e<span class="token punctuation">)</span> <span class="token punctuation">&#123;</span>
			messages<span class="token punctuation">.</span><span class="token function">push</span><span class="token punctuation">(</span>
				<span class="token string">"Parsing error on line "</span> <span class="token operator">+</span>
					e<span class="token punctuation">.</span>line <span class="token operator">+</span>
					<span class="token string">", column "</span> <span class="token operator">+</span>
					e<span class="token punctuation">.</span>column <span class="token operator">+</span>
					<span class="token string">": "</span> <span class="token operator">+</span>
					e<span class="token punctuation">.</span>message
			<span class="token punctuation">)</span><span class="token punctuation">;</span>
		<span class="token punctuation">&#125;</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>Now we will be able to write TOML frontmatter:</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token frontmatter-toml"><span class="token punctuation">+++
</span><span class="token language-toml"><span class="token key property">title</span> <span class="token punctuation">=</span> <span class="token string">"TOML Example"</span>

<span class="token punctuation">[</span><span class="token table class-name">owner</span><span class="token punctuation">]</span>
<span class="token key property">name</span> <span class="token punctuation">=</span> <span class="token string">"some name"</span>
<span class="token key property">dob</span> <span class="token punctuation">=</span> <span class="token date number">1879-05-27T07:32:00-08:00</span>
</span><span class="token punctuation">+++</span></span></code>
</pre>
<h2 id="layouts"><a aria-hidden="true" href="#layouts"><span class="icon icon-link"></span></a>Layouts</h2>
<p>Layouts are one of the more powerful features available in mdsvex and allow for a great deal of flexibility. At their simplest a layout is just a component that wraps an mdsvex document. Providing a string as the layout option will enable this behaviour:</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	layout<span class="token operator">:</span> <span class="token string">"./path/to/layout.svelte"</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>Layouts receive all values defined in frontmatter as props:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Layout</span> <span class="token language-javascript"><span class="token punctuation">&#123;</span><span class="token operator">...</span>props<span class="token punctuation">&#125;</span></span> <span class="token punctuation">></span></span>
  <span class="token comment">&lt;!-- mdsvex content here --></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Layout</span><span class="token punctuation">></span></span></code>
</pre>
<p>You can then use these values in your layout however you wish, a typical use might be to define some fancy formatting for headings, authors, and dates. Although you could do all kinds of wonderful things. You just need to make sure you provide a default <code>slot</code> so the mdsvex content can be passed into your layout and rendered.</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">export</span> <span class="token keyword">let</span> title<span class="token punctuation">;</span>
  <span class="token keyword">export</span> <span class="token keyword">let</span> author<span class="token punctuation">;</span>
  <span class="token keyword">export</span> <span class="token keyword">let</span> date<span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span>

<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>h1</span><span class="token punctuation">></span></span><span class="token language-javascript"><span class="token punctuation">&#123;</span> title <span class="token punctuation">&#125;</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>h1</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>p</span> <span class="token attr-name">class</span><span class="token attr-value"><span class="token punctuation">=</span><span class="token punctuation">"</span>date<span class="token punctuation">"</span></span><span class="token punctuation">></span></span>on: <span class="token language-javascript"><span class="token punctuation">&#123;</span> date <span class="token punctuation">&#125;</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>p</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>p</span> <span class="token attr-name">class</span><span class="token attr-value"><span class="token punctuation">=</span><span class="token punctuation">"</span>date<span class="token punctuation">"</span></span><span class="token punctuation">></span></span>by: <span class="token language-javascript"><span class="token punctuation">&#123;</span> author <span class="token punctuation">&#125;</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>p</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>slot</span><span class="token punctuation">></span></span>
  <span class="token comment">&lt;!-- the mdsvex content will be slotted in here --></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>slot</span><span class="token punctuation">></span></span></code>
</pre>
<h3 id="named-layouts"><a aria-hidden="true" href="#named-layouts"><span class="icon icon-link"></span></a>Named Layouts</h3>
<p>In some cases you may want different layouts for different types of document. To address this you can pass an object of named layouts instead. Each key should be a name for your layout, the value should be the path to that layout file. A fallback layout, or default, can be passed using <code>_</code> (underscore) as a key name.</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	layout<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		blog<span class="token operator">:</span> <span class="token string">"./path/to/blog/layout.svelte"</span><span class="token punctuation">,</span>
		article<span class="token operator">:</span> <span class="token string">"./path/to/article/layout.svelte"</span><span class="token punctuation">,</span>
		_<span class="token operator">:</span> <span class="token string">"./path/to/fallback/layout.svelte"</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>If you pass an object of named layouts, you can decide which layout to use on a file-by-file basis by declaring it in the frontmatter. For example, if you wanted to force a document to be wrapped with the <code>blog</code> layout you would do the following:</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">layout</span><span class="token punctuation">:</span> blog
</span><span class="token punctuation">---</span></span></code>
</pre>
<p>If you are using named layouts and do not have a layout field in the frontmatter then mdsvex will try to pick the correct one based on the folder a file is stored in. Take the following folder structure:</p>
<pre class="language-null">
<code class="language-">.
├── blog
│   └── my-blog-post.svx
└── article
    └── my-article.svx</code>
</pre>
<p>If there is a layout named <code>blog</code> and <code>article</code> then documents in the <code>blog</code> folder will use the <code>blog</code> layout, articles in the <code>articles</code> folder will use the <code>article</code> layout. mdsvex will try to check both singular and pluralised names, as you may have named a folder <code>events</code> but the matching layout could be named <code>event</code>, however, having the same folder and layout name will make this process more reliable. The current working directory is removed from the path when checking for matches but nested folders can still cause problems if there are conflicts. Shallow folder structures and unique folder and layout names will prevent these kinds of collisions.</p>
<p>If there is no matching layout then the fallback layout (<code>_</code>) will be applied, if there is no fallback then no layout will be applied.</p>
<h3 id="disabling-layouts"><a aria-hidden="true" href="#disabling-layouts"><span class="icon icon-link"></span></a>disabling layouts</h3>
<p>If you are using layouts but wish to disable them for a specific component, then you can set the <code>layout</code> field to <code>false</code> to prevent the application of a layout.</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">layout</span><span class="token punctuation">:</span> <span class="token boolean important">false</span>
</span><span class="token punctuation">---</span></span></code>
</pre>
<h3 id="custom-components"><a aria-hidden="true" href="#custom-components"><span class="icon icon-link"></span></a>Custom Components</h3>
<p>Layouts also allow you to provide custom components to any mdsvex file they are applied to. Custom components replace the elements that markdown would normally generate.</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token title important"><span class="token punctuation">#</span> Title</span>

Some text

<span class="token list punctuation">-</span> a
<span class="token list punctuation">-</span> short
<span class="token list punctuation">-</span> list</code>
</pre>
<p>Would normally compile to:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>h1</span><span class="token punctuation">></span></span>Title<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>h1</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>p</span><span class="token punctuation">></span></span>Some text<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>p</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>ul</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>li</span><span class="token punctuation">></span></span>a<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>li</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>li</span><span class="token punctuation">></span></span>short<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>li</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>li</span><span class="token punctuation">></span></span>list<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>li</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>ul</span><span class="token punctuation">></span></span></code>
</pre>
<p>Custom components allow you to replace these elements with components. You can define components by exporting named exports from the <code>context="module"</code> script of your Layout file:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span> <span class="token attr-name">context</span><span class="token attr-value"><span class="token punctuation">=</span><span class="token punctuation">"</span>module<span class="token punctuation">"</span></span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">import</span> <span class="token punctuation">&#123;</span> h1<span class="token punctuation">,</span> p<span class="token punctuation">,</span> li <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">'./components.js'</span><span class="token punctuation">;</span>
  <span class="token keyword">export</span> <span class="token punctuation">&#123;</span> h1<span class="token punctuation">,</span> p<span class="token punctuation">,</span> li <span class="token punctuation">&#125;</span><span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span></code>
</pre>
<p>The named exports must be named after the actual element you want to replace (<code>p</code>, <code>blockquote</code>, etc.), the value must be the component you wish to replace them with. This makes certain named exports ‘protected’ API, make sure you don’t use html names as export names for other values. Named exports whose names do not correspond to an HTML element will be ignored, so feel free to continue using them for other purposes as well. As these are named exports it is possible for the bundler to treeshake unused custom components, even if they are exported.</p>
<p>The above custom components would generate:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">import</span> <span class="token operator">*</span> <span class="token keyword">as</span> Components <span class="token keyword">from</span> <span class="token string">'./Layout.svelte'</span><span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span>

<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Components.h1</span><span class="token punctuation">></span></span>Title<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Components.h1</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Components.p</span><span class="token punctuation">></span></span>Some text<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Components.p</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>ul</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Components.li</span><span class="token punctuation">></span></span>a<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Components.li</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Components.li</span><span class="token punctuation">></span></span>short<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Components.li</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Components.li</span><span class="token punctuation">></span></span>list<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Components.li</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>ul</span><span class="token punctuation">></span></span></code>
</pre>
<p>Notice that the <code>ul</code> is left intact: elements are replaced <em>after</em> the markdown is parsed to HTML. This allows greater flexibility, for example, when using custom components to customise lists, tables or other markdown that compiles to a combination of different HTML elements.</p>
<p>You may also receive attributes of the normal HTML component. For example, to render a custom <code>&lt;img&gt;</code> tag you could do:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">export</span> <span class="token keyword">let</span> src<span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span>

<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>img</span> <span class="token attr-name">src=</span><span class="token language-javascript"><span class="token punctuation">&#123;</span>src<span class="token punctuation">&#125;</span></span> <span class="token punctuation">/></span></span></code>
</pre>
<h2 id="frontmatter-1"><a aria-hidden="true" href="#frontmatter-1"><span class="icon icon-link"></span></a>Frontmatter</h2>
<p>YAML frontmatter is a common convention in blog posts and mdsvex supports it out of the box. If you want to use a custom language or marker for frontmatter than you can use the <a
  href="docs#frontmatter"
><code>frontmatter</code></a> option to modify the default behaviour.</p>
<p>Mdsvex integrates well with frontmatter providing additional flexibility when authoring documents.</p>
<p>All variables defined in frontmatter are available directly in the component, exactly as you wrote them:</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">title</span><span class="token punctuation">:</span> My lovely article
<span class="token key atrule">author</span><span class="token punctuation">:</span> Dr. Fabuloso the Fabulous
</span><span class="token punctuation">---</span></span>

<span class="token title important"><span class="token punctuation">#</span> <span class="token language-javascript"><span class="token punctuation">&#123;</span>title<span class="token punctuation">&#125;</span></span> by <span class="token language-javascript"><span class="token punctuation">&#123;</span>author<span class="token punctuation">&#125;</span></span></span>

Some amazing content.</code>
</pre>
<p>Additionally, all of these variables are exported as a single object named <code>metadata</code> from the <code>context="module"</code> script, so they can easily be imported in javascript:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span> <span class="token attr-name">context</span><span class="token attr-value"><span class="token punctuation">=</span><span class="token punctuation">"</span>module<span class="token punctuation">"</span></span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">export</span> <span class="token keyword">let</span> metadata <span class="token operator">=</span> <span class="token punctuation">&#123;</span>
    title<span class="token operator">:</span> <span class="token string">"My lovely article"</span><span class="token punctuation">,</span>
    author<span class="token operator">:</span> <span class="token string">"Dr. Fabuloso the Fabulous"</span>
  <span class="token punctuation">&#125;</span><span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span></code>
</pre>
<p>Due to how <code>context="module"</code> scripts work, this metadata can be imported like this:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> <span class="token punctuation">&#123;</span> metadata <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">"./some-mdsvex-file.svx"</span><span class="token punctuation">;</span></code>
</pre>
<p>Frontmatter also interacts with layouts, you can find more details in the <a
  href="docs#layouts"
>Layout section</a>.</p>
<h2 id="integrations"><a aria-hidden="true" href="#integrations"><span class="icon icon-link"></span></a>Integrations</h2>
<h3 id="with-sapper"><a aria-hidden="true" href="#with-sapper"><span class="icon icon-link"></span></a>With Sapper</h3>
<p>To use mdsvex with sapper you need to add the mdsvex configuration to both the client and server sections of the rollup or webpack configuration. You will also need to add the CLI argument <code>--ext '.svelte .svx'</code> to all of the sapper scripts (<code>dev</code>, <code>build</code>, and <code>export</code>) in order to tell sapper that it should also allow <code>.svx</code> files to be page routes.</p>
<p>Or you can use the templates:</p>
<ul>
<li>
<p><a href="https://github.com/pngwn/sapper-mdsvex-template" rel="nofollow">Rollup</a></p>
<pre class="language-bash">
<code class="language-bash">npx degit <span class="token string">"pngwn/sapper-mdsvex-template"</span> my-app</code>
</pre>
</li>
<li>
<p><a
  href="https://github.com/shiryel/sapper-mdsvex-template-webpack"
  rel="nofollow"
>Webpack</a></p>
<pre class="language-bash">
<code class="language-bash">npx degit <span class="token string">"shiryel/sapper-mdsvex-template-webpack"</span> my-app</code>
</pre>
</li>
</ul>
<h2 id="limitations"><a aria-hidden="true" href="#limitations"><span class="icon icon-link"></span></a>Limitations</h2>
<h3 id="indentation"><a aria-hidden="true" href="#indentation"><span class="icon icon-link"></span></a>Indentation</h3>
<p>In markdown you can begin a code block by indenting 4 spaces. This doesn’t work in mdsvex as indentation is common with XML-based languages. Indenting 4 spaces will do nothing.</p>
<p>In general you have a lot more flexibility when it comes to indenting code in mdsvex than you do in markdown because of the above change, however, you need to be very careful when indenting fenced code blocks. By which I mean, don’t do it.</p>
<p>The following code block will break in a way that is both very bad and quite unexpected:</p>
<pre class="language-mdsvex">
<code class="language-mdsvex">		\`\`\`js
					console.log('Hello, World!')
		\`\`\`</code>
</pre>
<p>The solution is to not do this. When working with fenced code blocks, do not indent them. This isn’t an issue that can really be worked around, even if the parser did make assumptions about what you meant. Because code blocks are designed to respect whitespace, any fix would simply result in a different but equally frustrating failure. Don’t indent code blocks.</p>`;

var cheatsheet = `<div class="container">
  <div class="box install">
    <h2><a href="docs#install-it">Install</a></h2>
<p>Quick installation instructions.</p>
<pre class="language-bash">
<code class="language-bash"><span class="token function">npm</span> i -D mdsvex</code>
</pre>
<pre class="language-bash">
<code class="language-bash"><span class="token function">yarn</span> <span class="token function">add</span> --dev mdsvex</code>
</pre>
  </div>
  <div class="box use">
    <h2><a href="docs#use-it">Use</a></h2>
<p>Add mdsvex to your project</p>
<pre class="language-js">
<code class="language-js"><span class="token function">svelte</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
  extensions<span class="token operator">:</span> <span class="token punctuation">[</span>
    <span class="token string">'.svelte'</span><span class="token punctuation">,</span>
    <span class="token string">'.svx'</span>
  <span class="token punctuation">]</span><span class="token punctuation">,</span>
  preprocess<span class="token operator">:</span> <span class="token function">mdsvex</span><span class="token punctuation">(</span>config<span class="token punctuation">)</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span></code>
</pre>
  </div>
  <div class="box config">
    <h2><a href="/docs#options">Configure</a></h2>
    <dl>
      <dt>
        <a href="docs#extensions"><span>extensions</span></a>
      </dt>
      <dd>use custom extensions</dd>
      <dt>
        <a href="docs#smartypants"><span>smartypants</a></span>
      </dt>
      <dd>fancy typography</dd>
      <dt>
        <a href="docs#layout"><span>layout</span></a>
      </dt>
      <dd>custom layouts</dd>
      <dt>
        <a href="docs#remarkplugins--rehypeplugins"><span>remarkPlugins</span></a>
      </dt>
      <dd>use remark plugins</dd>
      <dt>
        <a href="docs#remarkplugins--rehypeplugins"><span>rehypePlugins</span></a>
      </dt>
      <dd>use rehype plugins</dd>
      <dt>
        <a href="docs#highlight"><span>highlight</span></a>
      </dt>
      <dd>syntax highlighting</dd>
      <dt>
        <a href="docs#frontmatter"><span>frontmatter</span></a>
      </dt>
      <dd>change frontmatter language</dd>
    </dl>
  </div>
  <div class="box layouts">
    <h2><a href="docs#layouts">Layouts</a></h2>
<p>Custom layouts for mdsvex documents.</p>
<h3><a href="docs#named-layouts">named layouts</a></h3>
<p>Reference layouts by name.</p>
<pre class="language-svx">
<code class="language-svx"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">layout</span><span class="token punctuation">:</span> blog
</span><span class="token punctuation">---</span></span></code>
</pre>
<h3><a href="docs#disabling-layouts">disabling layouts</a></h3>
<p>Disable named layouts when needed.</p>
<pre class="language-svx">
<code class="language-svx"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">layout</span><span class="token punctuation">:</span> <span class="token boolean important">false</span>
</span><span class="token punctuation">---</span></span></code>
</pre>
<h3><a href="docs#custom-components">custom components</a></h3>
<p class="keep">Replace HTML elements with custom components.</p>
  </div>
  <div class="box frontmatter">
    <h2><a href="docs#frontmatter-1">Frontmatter</a></h2>
<p>Use frontmatter values directly in markdown.</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">title</span><span class="token punctuation">:</span> Fabuloso
</span><span class="token punctuation">---</span></span>

<span class="token title important"><span class="token punctuation">#</span> <span class="token language-javascript"><span class="token punctuation">&#123;</span>title<span class="token punctuation">&#125;</span></span></span></code>
</pre>
  </div>
  <div class="box integrations">
    <h2><a href="docs#integrations">Integrations</a></h2>
    <p class="keep">Using mdsvex with other things</p>
  </div>
</div>`;

/* src/components/Cheatsheet.svx generated by Svelte v4.0.0 */

const css$1 = {
	code: "body{background:#f8f8f8;box-sizing:border-box}.cheatsheet.svelte-177ikrt dl{list-style:none;padding:0;flex-direction:column;justify-content:space-between;height:90%;margin:0;font-size:1.9rem}.cheatsheet.svelte-177ikrt dd{margin:5px 0 15px 0;font-style:italic}.cheatsheet.svelte-177ikrt dt span{font-family:monospace;font-size:16px;padding:3px 6px;background:#eee;display:inline-block;margin:10px 0 0 0;border-radius:3px}.cheatsheet.svelte-177ikrt li:first-child > span{margin-top:14px}.cheatsheet.svelte-177ikrt li:last-child > span{margin-bottom:20px}.cheatsheet.svelte-177ikrt h2{color:#555}.cheatsheet.svelte-177ikrt .container{height:850px;display:grid;grid-template-columns:repeat(12, 1fr);grid-template-rows:repeat(12, 1fr);grid-gap:30px;min-height:850px;max-height:850px;margin:65px}.cheatsheet.svelte-177ikrt .box{background:#fff;padding:0 20px;min-width:0;min-height:0;box-shadow:0 1px 5px rgba(0, 0, 0, 0.15)}.cheatsheet.svelte-177ikrt .install{grid-column:1 / span 4;grid-row:1 / span 4}.cheatsheet.svelte-177ikrt .use{grid-column:5 / span 4;grid-row:1 / span 5}.cheatsheet.svelte-177ikrt .config{grid-column:9 / span 4;grid-row:1 / span 12;display:grid;grid-template-rows:repeat(12, 1fr)}.cheatsheet.svelte-177ikrt .config > div{grid-row:1 / span 1}.cheatsheet.svelte-177ikrt .config > dl{grid-row:2 / span 11;height:77vh}.cheatsheet.svelte-177ikrt .layouts{grid-column:1 / span 4;grid-row:5 / span 8}.cheatsheet.svelte-177ikrt .frontmatter{grid-column:5 / span 4;grid-row:6 / span 4}.cheatsheet.svelte-177ikrt .integrations{grid-column:5 / span 4;grid-row:10 / span 3}.cheatsheet.svelte-177ikrt pre,.cheatsheet.svelte-177ikrt h2{margin-top:2rem}.cheatsheet.svelte-177ikrt pre{border-radius:3px;padding:1rem 1rem 1.4rem 2rem;line-height:1.3}.cheatsheet.svelte-177ikrt code{border-radius:3px;font-size:14px;overflow:scroll}.cheatsheet.svelte-177ikrt .box{position:relative;display:inline-block}.cheatsheet.svelte-177ikrt h2{font-weight:normal;text-transform:lowercase;font-family:\"fira-full\";font-size:2rem;margin-bottom:2rem}.cheatsheet.svelte-177ikrt h2 a,.cheatsheet.svelte-177ikrt h3 a{border:none}.cheatsheet.svelte-177ikrt h2 a::before,.cheatsheet.svelte-177ikrt h3 a::before{content:'#';color:#bbb;font-size:2rem}.cheatsheet.svelte-177ikrt h3 a::before{font-size:1.7rem}.cheatsheet.svelte-177ikrt h3{font-size:1.7rem;margin-bottom:0;margin-top:2rem;font-family:'fira-full'}.cheatsheet.svelte-177ikrt h3 + pre{margin-top:0.5rem}.cheatsheet.svelte-177ikrt .box > p{display:none;margin-top:10px}.cheatsheet.svelte-177ikrt .box > .keep{display:block}@media(max-width: 1100px){.cheatsheet.svelte-177ikrt .container{display:grid;flex-wrap:wrap;grid-template-columns:repeat(2, 1fr);grid-template-rows:repeat(26, 1fr);grid-gap:30px;max-height:1450px;height:1450px}.cheatsheet.svelte-177ikrt .install{grid-column:1 / span 1;grid-row:1 / span 5}.cheatsheet.svelte-177ikrt .use{grid-column:2 / span 1;grid-row:1 / span 6}.cheatsheet.svelte-177ikrt .config{grid-column:1 / span 1;grid-row:6 / span 14}.cheatsheet.svelte-177ikrt .config > dl{font-size:1.8rem}.cheatsheet.svelte-177ikrt .layouts{grid-column:2 / span 1;grid-row:7 / span 10}.cheatsheet.svelte-177ikrt .frontmatter{grid-column:1 / span 1;grid-row:20 / span 5}.cheatsheet.svelte-177ikrt .integrations{grid-column:2 / span 1;grid-row:17 / span 3}}@media(max-width: 750px){.cheatsheet.svelte-177ikrt .container{display:block;height:auto;max-height:inherit;margin:65px 60px}.cheatsheet.svelte-177ikrt .box{display:block;padding:2rem;margin:3rem 0;border-radius:0}}@media(max-width: 550px){.cheatsheet.svelte-177ikrt .container{margin:65px 0 0 0}}.cheatsheet.svelte-177ikrt .config > dl{height:fit-content}",
	map: "{\"version\":3,\"file\":\"Cheatsheet.svx\",\"sources\":[\"Cheatsheet.svx\"],\"sourcesContent\":[\"<style>\\n  :global(body) {\\n    background: #f8f8f8;\\n\\n    /* height: 100vh; */\\n    box-sizing: border-box;\\n  }\\n\\n  .cheatsheet :global(dl) {\\n    list-style: none;\\n    padding: 0;\\n    flex-direction: column;\\n    justify-content: space-between;\\n    height: 90%;\\n    margin: 0;\\n    font-size: 1.9rem;\\n\\n  }\\n\\n  .cheatsheet :global(dd) {\\n    margin: 5px 0 15px 0;\\n    font-style: italic;\\n  }\\n\\n  .cheatsheet :global(dt span) {\\n    font-family: monospace;\\n    font-size: 16px;\\n    padding: 3px 6px;\\n    background: #eee;\\n    display: inline-block;\\n    margin: 10px 0 0 0;\\n    border-radius: 3px;\\n  }\\n\\n  .cheatsheet :global(li:first-child > span) {\\n    margin-top: 14px;\\n  }\\n\\n  .cheatsheet :global(li:last-child > span) {\\n    margin-bottom: 20px;\\n  }\\n  .cheatsheet :global(h2) {\\n    color: #555;\\n  }\\n\\n  .cheatsheet :global(.container) {\\n    height: 850px;\\n    display: grid;\\n    grid-template-columns: repeat(12, 1fr);\\n    grid-template-rows: repeat(12, 1fr);\\n    grid-gap: 30px;\\n    min-height: 850px;\\n    max-height: 850px;\\n    margin: 65px;\\n  }\\n\\n  .cheatsheet :global(.box) {\\n    background: #fff;\\n    padding: 0 20px;\\n    min-width: 0;\\n    min-height: 0;\\n    box-shadow:  0 1px 5px rgba(0, 0, 0, 0.15);\\n  }\\n\\n  .cheatsheet :global(.install) {\\n    grid-column: 1 / span 4;\\n    grid-row: 1 / span 4;\\n  }\\n\\n  .cheatsheet :global(.use) {\\n    grid-column: 5 / span 4;\\n    grid-row: 1 / span 5;\\n  }\\n\\n  .cheatsheet :global(.config) {\\n    grid-column: 9 / span 4;\\n    grid-row: 1 / span 12;\\n    display: grid;\\n    grid-template-rows: repeat(12, 1fr);\\n  }\\n\\n  .cheatsheet :global(.config > div) {\\n    grid-row: 1 / span 1;\\n  }\\n\\n  .cheatsheet :global(.config > dl) {\\n    grid-row: 2 / span 11;\\n    height: 77vh;\\n  }\\n\\n  .cheatsheet :global(.layouts) {\\n    grid-column: 1 / span 4;\\n    grid-row: 5 / span 8;\\n  }\\n\\n  .cheatsheet :global(.frontmatter) {\\n    grid-column: 5 / span 4;\\n    grid-row: 6 / span 4;\\n  }\\n\\n  .cheatsheet :global(.integrations) {\\n    grid-column: 5 / span 4;\\n    grid-row: 10 / span 3;\\n  }\\n\\n  .cheatsheet :global(pre),\\n  .cheatsheet :global(h2) {\\n    margin-top: 2rem;\\n  }\\n\\n  .cheatsheet :global(pre) {\\n    border-radius: 3px;\\n    padding: 1rem 1rem 1.4rem 2rem;\\n    line-height: 1.3;\\n  }\\n\\n  .cheatsheet :global(code) {\\n    border-radius: 3px;\\n    font-size: 14px;\\n    overflow: scroll;\\n  }\\n\\n  .cheatsheet :global(.box) {\\n    position: relative;\\n    display: inline-block;\\n  }\\n\\n\\n  .cheatsheet :global(h2) {\\n    font-weight: normal;\\n    text-transform: lowercase;\\n    font-family: \\\"fira-full\\\";\\n    font-size: 2rem;\\n    margin-bottom: 2rem;\\n  }\\n\\n  .cheatsheet :global(h2 a), .cheatsheet :global(h3 a) {\\n    border: none;\\n  }\\n\\n  .cheatsheet :global(h2 a::before), .cheatsheet :global(h3 a::before) {\\n    content: '#';\\n    color: #bbb;\\n    font-size: 2rem;\\n  }\\n\\n   .cheatsheet :global(h3 a::before) {\\n    font-size: 1.7rem;\\n  }\\n\\n  .cheatsheet :global(h3) {\\n    font-size: 1.7rem;\\n    margin-bottom: 0;\\n    margin-top: 2rem;\\n    font-family: 'fira-full';\\n  }\\n\\n  .cheatsheet :global(h3 + pre) {\\n    margin-top: 0.5rem;\\n  }\\n\\n  .cheatsheet :global(.box > p) {\\n    display: none;\\n    margin-top: 10px;\\n  }\\n\\n  .cheatsheet :global(.box > .keep) {\\n    display: block;\\n  }\\n\\n  @media (max-width: 1100px) {\\n    .cheatsheet :global(.container) {\\n      display: grid;\\n      flex-wrap: wrap;\\n      grid-template-columns: repeat(2, 1fr);\\n      grid-template-rows: repeat(26, 1fr);\\n      grid-gap: 30px;\\n      max-height: 1450px;\\n      height: 1450px;\\n    }\\n\\n    .cheatsheet :global(.install) {\\n      grid-column: 1 / span 1;\\n      grid-row: 1 / span 5;\\n    }\\n\\n    .cheatsheet :global(.use) {\\n      grid-column: 2 / span 1;\\n      grid-row: 1 / span 6;\\n    }\\n\\n    .cheatsheet :global(.config) {\\n      grid-column: 1 / span 1;\\n      grid-row: 6 / span 14;\\n    }\\n\\n    .cheatsheet :global(.config > dl) {\\n      font-size: 1.8rem;\\n    }\\n\\n    .cheatsheet :global(.layouts) {\\n      grid-column: 2 / span 1;\\n      grid-row: 7 / span 10;\\n    }\\n\\n    .cheatsheet :global(.frontmatter) {\\n      grid-column: 1 / span 1;\\n      grid-row: 20 / span 5;\\n    }\\n\\n    .cheatsheet :global(.integrations) {\\n      grid-column: 2 / span 1;\\n      grid-row: 17 / span 3;\\n    }\\n  }\\n\\n  @media (max-width: 750px) {\\n    .cheatsheet :global(.container) {\\n      display: block;\\n      height: auto;\\n      max-height: inherit;\\n      margin: 65px 60px;\\n    }\\n\\n    .cheatsheet :global(.box){\\n      display: block;\\n      padding: 2rem;\\n      margin: 3rem 0;\\n      border-radius: 0;\\n    }\\n  }\\n\\n  @media (max-width: 550px) {\\n    .cheatsheet :global(.container) {\\n      margin: 65px 0 0 0;\\n    }\\n  }\\n\\n  .cheatsheet :global(.config > dl) {\\n    height: fit-content;\\n  }\\n\\n\\n</style>\\n<script>\\n  import cheatsheet from './_cheatsheet.svtext';\\n</script>\\n<div class=\\\"cheatsheet\\\">\\n  {@html cheatsheet}\\n</div>\"],\"names\":[],\"mappings\":\"AACU,IAAM,CACZ,UAAU,CAAE,OAAO,CAGnB,UAAU,CAAE,UACd,CAEA,0BAAW,CAAS,EAAI,CACtB,UAAU,CAAE,IAAI,CAChB,OAAO,CAAE,CAAC,CACV,cAAc,CAAE,MAAM,CACtB,eAAe,CAAE,aAAa,CAC9B,MAAM,CAAE,GAAG,CACX,MAAM,CAAE,CAAC,CACT,SAAS,CAAE,MAEb,CAEA,0BAAW,CAAS,EAAI,CACtB,MAAM,CAAE,GAAG,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACpB,UAAU,CAAE,MACd,CAEA,0BAAW,CAAS,OAAS,CAC3B,WAAW,CAAE,SAAS,CACtB,SAAS,CAAE,IAAI,CACf,OAAO,CAAE,GAAG,CAAC,GAAG,CAChB,UAAU,CAAE,IAAI,CAChB,OAAO,CAAE,YAAY,CACrB,MAAM,CAAE,IAAI,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAClB,aAAa,CAAE,GACjB,CAEA,0BAAW,CAAS,qBAAuB,CACzC,UAAU,CAAE,IACd,CAEA,0BAAW,CAAS,oBAAsB,CACxC,aAAa,CAAE,IACjB,CACA,0BAAW,CAAS,EAAI,CACtB,KAAK,CAAE,IACT,CAEA,0BAAW,CAAS,UAAY,CAC9B,MAAM,CAAE,KAAK,CACb,OAAO,CAAE,IAAI,CACb,qBAAqB,CAAE,OAAO,EAAE,CAAC,CAAC,GAAG,CAAC,CACtC,kBAAkB,CAAE,OAAO,EAAE,CAAC,CAAC,GAAG,CAAC,CACnC,QAAQ,CAAE,IAAI,CACd,UAAU,CAAE,KAAK,CACjB,UAAU,CAAE,KAAK,CACjB,MAAM,CAAE,IACV,CAEA,0BAAW,CAAS,IAAM,CACxB,UAAU,CAAE,IAAI,CAChB,OAAO,CAAE,CAAC,CAAC,IAAI,CACf,SAAS,CAAE,CAAC,CACZ,UAAU,CAAE,CAAC,CACb,UAAU,CAAG,CAAC,CAAC,GAAG,CAAC,GAAG,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,IAAI,CAC3C,CAEA,0BAAW,CAAS,QAAU,CAC5B,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CACrB,CAEA,0BAAW,CAAS,IAAM,CACxB,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CACrB,CAEA,0BAAW,CAAS,OAAS,CAC3B,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,EAAE,CACrB,OAAO,CAAE,IAAI,CACb,kBAAkB,CAAE,OAAO,EAAE,CAAC,CAAC,GAAG,CACpC,CAEA,0BAAW,CAAS,aAAe,CACjC,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CACrB,CAEA,0BAAW,CAAS,YAAc,CAChC,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,EAAE,CACrB,MAAM,CAAE,IACV,CAEA,0BAAW,CAAS,QAAU,CAC5B,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CACrB,CAEA,0BAAW,CAAS,YAAc,CAChC,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CACrB,CAEA,0BAAW,CAAS,aAAe,CACjC,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,EAAE,CAAC,CAAC,CAAC,IAAI,CAAC,CACtB,CAEA,0BAAW,CAAS,GAAI,CACxB,0BAAW,CAAS,EAAI,CACtB,UAAU,CAAE,IACd,CAEA,0BAAW,CAAS,GAAK,CACvB,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,IAAI,CAAC,IAAI,CAAC,MAAM,CAAC,IAAI,CAC9B,WAAW,CAAE,GACf,CAEA,0BAAW,CAAS,IAAM,CACxB,aAAa,CAAE,GAAG,CAClB,SAAS,CAAE,IAAI,CACf,QAAQ,CAAE,MACZ,CAEA,0BAAW,CAAS,IAAM,CACxB,QAAQ,CAAE,QAAQ,CAClB,OAAO,CAAE,YACX,CAGA,0BAAW,CAAS,EAAI,CACtB,WAAW,CAAE,MAAM,CACnB,cAAc,CAAE,SAAS,CACzB,WAAW,CAAE,WAAW,CACxB,SAAS,CAAE,IAAI,CACf,aAAa,CAAE,IACjB,CAEA,0BAAW,CAAS,IAAK,CAAE,0BAAW,CAAS,IAAM,CACnD,MAAM,CAAE,IACV,CAEA,0BAAW,CAAS,YAAa,CAAE,0BAAW,CAAS,YAAc,CACnE,OAAO,CAAE,GAAG,CACZ,KAAK,CAAE,IAAI,CACX,SAAS,CAAE,IACb,CAEC,0BAAW,CAAS,YAAc,CACjC,SAAS,CAAE,MACb,CAEA,0BAAW,CAAS,EAAI,CACtB,SAAS,CAAE,MAAM,CACjB,aAAa,CAAE,CAAC,CAChB,UAAU,CAAE,IAAI,CAChB,WAAW,CAAE,WACf,CAEA,0BAAW,CAAS,QAAU,CAC5B,UAAU,CAAE,MACd,CAEA,0BAAW,CAAS,QAAU,CAC5B,OAAO,CAAE,IAAI,CACb,UAAU,CAAE,IACd,CAEA,0BAAW,CAAS,YAAc,CAChC,OAAO,CAAE,KACX,CAEA,MAAO,YAAY,MAAM,CAAE,CACzB,0BAAW,CAAS,UAAY,CAC9B,OAAO,CAAE,IAAI,CACb,SAAS,CAAE,IAAI,CACf,qBAAqB,CAAE,OAAO,CAAC,CAAC,CAAC,GAAG,CAAC,CACrC,kBAAkB,CAAE,OAAO,EAAE,CAAC,CAAC,GAAG,CAAC,CACnC,QAAQ,CAAE,IAAI,CACd,UAAU,CAAE,MAAM,CAClB,MAAM,CAAE,MACV,CAEA,0BAAW,CAAS,QAAU,CAC5B,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CACrB,CAEA,0BAAW,CAAS,IAAM,CACxB,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CACrB,CAEA,0BAAW,CAAS,OAAS,CAC3B,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,EACrB,CAEA,0BAAW,CAAS,YAAc,CAChC,SAAS,CAAE,MACb,CAEA,0BAAW,CAAS,QAAU,CAC5B,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,EACrB,CAEA,0BAAW,CAAS,YAAc,CAChC,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,EAAE,CAAC,CAAC,CAAC,IAAI,CAAC,CACtB,CAEA,0BAAW,CAAS,aAAe,CACjC,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,QAAQ,CAAE,EAAE,CAAC,CAAC,CAAC,IAAI,CAAC,CACtB,CACF,CAEA,MAAO,YAAY,KAAK,CAAE,CACxB,0BAAW,CAAS,UAAY,CAC9B,OAAO,CAAE,KAAK,CACd,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,OAAO,CACnB,MAAM,CAAE,IAAI,CAAC,IACf,CAEA,0BAAW,CAAS,IAAK,CACvB,OAAO,CAAE,KAAK,CACd,OAAO,CAAE,IAAI,CACb,MAAM,CAAE,IAAI,CAAC,CAAC,CACd,aAAa,CAAE,CACjB,CACF,CAEA,MAAO,YAAY,KAAK,CAAE,CACxB,0BAAW,CAAS,UAAY,CAC9B,MAAM,CAAE,IAAI,CAAC,CAAC,CAAC,CAAC,CAAC,CACnB,CACF,CAEA,0BAAW,CAAS,YAAc,CAChC,MAAM,CAAE,WACV\"}"
};

const Cheatsheet = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	$$result.css.add(css$1);
	return `<div class="cheatsheet svelte-177ikrt">${cheatsheet}</div>`;
});

/* src/routes/docs.svelte generated by Svelte v4.0.0 */

const css = {
	code: "nav.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{padding:2rem 3rem;width:30rem;top:0;height:calc(100% - 7rem);overflow-y:scroll;margin-top:4rem;background:#fafafa}ul.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{list-style-type:none}li.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{margin:3rem 0px;position:relative;text-transform:uppercase;font-weight:bold;font-family:'lato-bold-sub'}ul.svelte-t254dh>li.svelte-t254dh>ul.svelte-t254dh>li.svelte-t254dh{margin:1rem 0px;text-transform:none;font-weight:400;font-family:'lato-sub'}a.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{text-decoration:none;border:none;color:#777;margin-left:25px}a.svelte-t254dh code.svelte-t254dh.svelte-t254dh.svelte-t254dh{position:relative;border-radius:0.3rem;white-space:nowrap;color:#777;-webkit-font-smoothing:initial;background:#eee;padding:0.3rem 0.6rem 0 0.6rem !important;transition:0.3s;font-family:'fira-full';font-size:1.4rem}a.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh:hover,a.svelte-t254dh:hover code.svelte-t254dh.svelte-t254dh.svelte-t254dh,a.active.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{color:#000}a.svelte-t254dh:hover code.svelte-t254dh.svelte-t254dh.svelte-t254dh{background:#ccc}a.active.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{font-weight:bold}a.active.svelte-t254dh code.svelte-t254dh.svelte-t254dh.svelte-t254dh{background:#333;color:#eee}article.svelte-t254dh h1{margin-bottom:4.6rem;font-family:'roboto-sub';font-weight:100;font-size:6rem}article.svelte-t254dh h2{margin:5rem 0 3rem 0;border-bottom:1px solid #ccc;font-family:'roboto-bold-full'}article.svelte-t254dh h3{margin-bottom:2rem;margin-top:3rem;font-family:'roboto-bold-full'}article.svelte-t254dh h4{margin-top:2rem;margin-bottom:2rem;font-family:'roboto-bold-full'}article.svelte-t254dh p{font-family:'roboto-full'}article.svelte-t254dh>ul{margin-left:5rem !important}article.svelte-t254dh code{font-family:'fira-full';position:relative;border-radius:0.3rem;color:#333;-webkit-font-smoothing:initial;background:#eee;padding:0.2rem 0.4rem 0rem 0.4rem;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;font-size:1.4rem}article.svelte-t254dh pre code{white-space:pre;background:none;color:#cbccc6;padding:0;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;tab-size:2rem}article.svelte-t254dh pre{background:#1f2430;color:#cbccc6;border-radius:3px;padding:1rem 2rem;margin:0rem 0 4rem 0;font-size:1.4rem;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:2.5rem}article.svelte-t254dh blockquote{border:1px solid #bebebe}article.svelte-t254dh blockquote p{color:#222;font-size:1.8rem}article.svelte-t254dh h3 code{font-size:2.2rem}article.svelte-t254dh h4 code{font-size:1.8rem;margin-bottom:2rem}article.svelte-t254dh pre.language-sig{display:inline-block;padding:0.2rem 0.7rem 0.2rem;margin:2rem 0 0 0}article.svelte-t254dh a{color:#777;border-bottom:1px solid #999}article.svelte-t254dh a:hover{color:#333;border-bottom:1px solid #333}article.svelte-t254dh h1 a,article.svelte-t254dh h2 a,article.svelte-t254dh h3 a,article.svelte-t254dh h4 a{display:block;height:100%;width:0;padding-top:1.23rem}.mini.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{text-transform:lowercase;margin:0;font-family:'fira-full';font-weight:normal;font-size:1.6rem}.container.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{display:grid;grid-template-columns:repeat(12, 1fr);grid-template-rows:1fr;grid-gap:3rem;margin-top:3rem}.container.svelte-t254dh h1{font-size:4rem;text-align:left}article.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{grid-column:5 / span 8;max-width:100%;min-width:0;clear:both}@media(max-width: 930px){article.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{width:100%;max-width:100%;margin-left:0;margin-top:2rem}article.svelte-t254dh h1{text-align:center}}@media(max-width: 1100px){nav.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{right:0;transition:0.2s;margin-top:0;height:100%;z-index:99;box-shadow:0 1px 4px 2px rgba(1, 1, 1, 0.1);padding-left:5rem;transform:translateX(100%)}article.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{grid-column:1 / span 12;padding:0 6rem}.menu.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{display:block;position:fixed;top:1.8rem;right:1.8rem;z-index:999;height:3.2rem;padding:6px 7px 6px 7px;background:#fff;box-sizing:border-box;border-radius:3px;box-shadow:0 1px 5px rgba(0, 0, 0, 0.15);cursor:pointer}.icon.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{width:2rem;height:2rem;display:inline-block;display:flex;justify-content:center;align-items:center}.icon.svelte-t254dh svg.svelte-t254dh.svelte-t254dh.svelte-t254dh{width:100%;height:100%}li.solo.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh:first-child{margin-top:0}}.menu_show.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{transform:translateX(0)}@media(max-width: 550px){nav.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{width:100%}article.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{padding:0px}.container.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{display:block;overflow:hidden}article.svelte-t254dh>*{margin-left:30px !important;margin-right:30px !important}article.svelte-t254dh>pre:not(.language-sig){margin-left:0 !important;margin-right:0 !important;border-radius:0 !important}article.svelte-t254dh>.language-sig{width:calc(100% - 6rem)}article.svelte-t254dh pre{padding:1rem 3rem}}@media(max-width: 330px){.menu.svelte-t254dh.svelte-t254dh.svelte-t254dh.svelte-t254dh{top:7.8rem}}",
	map: "{\"version\":3,\"file\":\"docs.svelte\",\"sources\":[\"docs.svelte\"],\"sourcesContent\":[\"<script>\\n\\timport { stores } from '@sapper/app';\\n\\timport { onMount } from 'svelte';\\n\\timport { fade } from 'svelte/transition';\\n\\timport docs from './_docs.svtext';\\n\\timport Cheatsheet from '../components/Cheatsheet.svx';\\n\\n\\tlet root;\\n\\tlet scrollY = 0;\\n\\tlet width = 1100;\\n\\tlet current;\\n\\tlet position = '';\\n\\n\\tconst { page } = stores();\\n\\n\\tconst nav = [\\n\\t\\t['Install', 'docs#install-it'],\\n\\t\\t[\\n\\t\\t\\t'Use',\\n\\t\\t\\t'docs#use-it',\\n\\t\\t\\t[\\n\\t\\t\\t\\t['mdsvex', 'docs#mdsvex-1', true],\\n\\t\\t\\t\\t['compile', 'docs#compile', true],\\n\\t\\t\\t],\\n\\t\\t],\\n\\t\\t[\\n\\t\\t\\t'Options',\\n\\t\\t\\t'docs#options',\\n\\t\\t\\t[\\n\\t\\t\\t\\t['extensions', 'docs#extensions', true],\\n\\t\\t\\t\\t['smartypants', 'docs#smartypants', true],\\n\\t\\t\\t\\t['layout', 'docs#layout', true],\\n\\t\\t\\t\\t['remarkPlugins', 'docs#remarkplugins--rehypeplugins', true],\\n\\t\\t\\t\\t['rehypePlugins', 'docs#remarkplugins--rehypeplugins', true],\\n\\t\\t\\t\\t['highlight', 'docs#highlight', true],\\n\\t\\t\\t\\t['frontmatter', 'docs#frontmatter', true],\\n\\t\\t\\t],\\n\\t\\t],\\n\\t\\t[\\n\\t\\t\\t'Layouts',\\n\\t\\t\\t'docs#layouts',\\n\\t\\t\\t[\\n\\t\\t\\t\\t['named layouts', 'docs#named-layouts', false],\\n\\t\\t\\t\\t['disabling layouts', 'docs#disabling-layouts', false],\\n\\t\\t\\t\\t['custom components', 'docs#custom-components', false],\\n\\t\\t\\t],\\n\\t\\t],\\n\\t\\t['Frontmatter', 'docs#frontmatter-1'],\\n\\t\\t[\\n\\t\\t\\t'Integrations',\\n\\t\\t\\t'docs#integrations',\\n\\t\\t\\t[['sapper', 'docs#with-sapper', false]],\\n\\t\\t],\\n\\t\\t['Limitations', 'docs#limitations'],\\n\\t];\\n\\n\\t$: root && typeof scrollY === 'number' && width && calculate_positions();\\n\\n\\tfunction remove_origin(href) {\\n\\t\\tconst re = new RegExp(`http(s*)://${$page.host}/`);\\n\\t\\treturn href.replace(re, '');\\n\\t}\\n\\n\\tfunction calculate_positions() {\\n\\t\\tif (root.getBoundingClientRect().top >= 0 && window.innerWidth > 1100) {\\n\\t\\t\\tposition = 'absolute';\\n\\t\\t} else {\\n\\t\\t\\tposition = 'fixed';\\n\\t\\t}\\n\\n\\t\\tconst nodes = Array.from(root.children).filter(\\n\\t\\t\\tv => v.tagName === 'H2' || v.tagName === 'H3'\\n\\t\\t);\\n\\n\\t\\tconst last = nodes.length - 1;\\n\\t\\tif (~~root.getBoundingClientRect().bottom === window.innerHeight) {\\n\\t\\t\\tconsole.log('boo');\\n\\t\\t\\tcurrent = 'docs' + remove_origin(nodes[last].children[0].href);\\n\\t\\t\\treturn;\\n\\t\\t}\\n\\n\\t\\tfor (let node of nodes) {\\n\\t\\t\\tconst { top } = node.getBoundingClientRect();\\n\\t\\t\\tif (top > 5) {\\n\\t\\t\\t\\tbreak;\\n\\t\\t\\t}\\n\\t\\t\\tcurrent = 'docs' + remove_origin(node.children[0].href);\\n\\t\\t}\\n\\t}\\n\\n\\t// somebody save me\\n\\n\\tonMount(() => {\\n\\t\\tif (window !== undefined && window.location.hash) {\\n\\t\\t\\tconst el = document.getElementById(window.location.hash.replace('#', ''));\\n\\t\\t\\tel && el.scrollIntoView();\\n\\t\\t}\\n\\n\\t\\tcalculate_positions();\\n\\t});\\n\\n\\tlet menu_show = false;\\n</script>\\n\\n<style>\\n\\tnav {\\n\\t\\tpadding: 2rem 3rem;\\n\\t\\twidth: 30rem;\\n\\t\\ttop: 0;\\n\\t\\theight: calc(100% - 7rem);\\n\\t\\toverflow-y: scroll;\\n\\t\\tmargin-top: 4rem;\\n\\t\\tbackground: #fafafa;\\n\\t}\\n\\n\\tul {\\n\\t\\tlist-style-type: none;\\n\\t}\\n\\n\\tli {\\n\\t\\tmargin: 3rem 0px;\\n\\t\\tposition: relative;\\n\\t\\ttext-transform: uppercase;\\n\\t\\tfont-weight: bold;\\n\\t\\tfont-family: 'lato-bold-sub';\\n\\t}\\n\\n\\tul > li > ul > li {\\n\\t\\tmargin: 1rem 0px;\\n\\t\\ttext-transform: none;\\n\\t\\tfont-weight: 400;\\n\\t\\tfont-family: 'lato-sub';\\n\\t}\\n\\n\\ta {\\n\\t\\ttext-decoration: none;\\n\\t\\tborder: none;\\n\\t\\tcolor: #777;\\n\\t\\tmargin-left: 25px;\\n\\t}\\n\\n\\ta code {\\n\\t\\tposition: relative;\\n\\t\\tborder-radius: 0.3rem;\\n\\t\\twhite-space: nowrap;\\n\\t\\tcolor: #777;\\n\\t\\t-webkit-font-smoothing: initial;\\n\\t\\tbackground: #eee;\\n\\t\\tpadding: 0.3rem 0.6rem 0 0.6rem !important;\\n\\t\\ttransition: 0.3s;\\n\\t\\tfont-family: 'fira-full';\\n\\t\\tfont-size: 1.4rem;\\n\\t}\\n\\n\\ta:hover,\\n\\ta:hover code,\\n\\ta.active {\\n\\t\\tcolor: #000;\\n\\t}\\n\\n\\ta:hover code {\\n\\t\\tbackground: #ccc;\\n\\t}\\n\\n\\ta.active {\\n\\t\\tfont-weight: bold;\\n\\t}\\n\\n\\ta.active code {\\n\\t\\tbackground: #333;\\n\\t\\tcolor: #eee;\\n\\t}\\n\\n\\tarticle :global(h1) {\\n\\t\\tmargin-bottom: 4.6rem;\\n\\t\\tfont-family: 'roboto-sub';\\n\\t\\tfont-weight: 100;\\n\\t\\tfont-size: 6rem;\\n\\t}\\n\\n\\tarticle :global(h2) {\\n\\t\\tmargin: 5rem 0 3rem 0;\\n\\t\\tborder-bottom: 1px solid #ccc;\\n\\t\\tfont-family: 'roboto-bold-full';\\n\\t}\\n\\n\\tarticle :global(h3) {\\n\\t\\tmargin-bottom: 2rem;\\n\\t\\tmargin-top: 3rem;\\n\\t\\tfont-family: 'roboto-bold-full';\\n\\t}\\n\\n\\tarticle :global(h4) {\\n\\t\\tmargin-top: 2rem;\\n\\t\\tmargin-bottom: 2rem;\\n\\t\\tfont-family: 'roboto-bold-full';\\n\\t}\\n\\n\\tarticle :global(p) {\\n\\t\\tfont-family: 'roboto-full';\\n\\t}\\n\\n\\tarticle > :global(ul) {\\n\\t\\tmargin-left: 5rem !important;\\n\\t}\\n\\n\\tarticle :global(code) {\\n\\t\\tfont-family: 'fira-full';\\n\\t\\tposition: relative;\\n\\t\\tborder-radius: 0.3rem;\\n\\t\\tcolor: #333;\\n\\t\\t-webkit-font-smoothing: initial;\\n\\t\\tbackground: #eee;\\n\\t\\tpadding: 0.2rem 0.4rem 0rem 0.4rem;\\n\\t\\twhite-space: pre;\\n\\t\\tword-spacing: normal;\\n\\t\\tword-break: normal;\\n\\t\\tword-wrap: normal;\\n\\t\\tfont-size: 1.4rem;\\n\\t}\\n\\n\\tarticle :global(pre code) {\\n\\t\\twhite-space: pre;\\n\\t\\tbackground: none;\\n\\t\\tcolor: #cbccc6;\\n\\t\\tpadding: 0;\\n\\t\\twhite-space: pre;\\n\\t\\tword-spacing: normal;\\n\\t\\tword-break: normal;\\n\\t\\tword-wrap: normal;\\n\\t\\ttab-size: 2rem;\\n\\t}\\n\\n\\tarticle :global(pre) {\\n\\t\\tbackground: #1f2430;\\n\\t\\tcolor: #cbccc6;\\n\\t\\tborder-radius: 3px;\\n\\t\\tpadding: 1rem 2rem;\\n\\t\\tmargin: 0rem 0 4rem 0;\\n\\t\\tfont-size: 1.4rem;\\n\\t\\twhite-space: pre;\\n\\t\\tword-spacing: normal;\\n\\t\\tword-break: normal;\\n\\t\\tword-wrap: normal;\\n\\t\\tline-height: 2.5rem;\\n\\t}\\n\\n\\tarticle :global(blockquote) {\\n\\t\\tborder: 1px solid #bebebe;\\n\\t}\\n\\n\\tarticle :global(blockquote p) {\\n\\t\\tcolor: #222;\\n\\t\\tfont-size: 1.8rem;\\n\\t}\\n\\n\\tarticle :global(h3 code) {\\n\\t\\tfont-size: 2.2rem;\\n\\t\\t/* background: none; */\\n\\t}\\n\\n\\tarticle :global(h4 code) {\\n\\t\\tfont-size: 1.8rem;\\n\\t\\tmargin-bottom: 2rem;\\n\\t}\\n\\n\\tarticle :global(pre.language-sig) {\\n\\t\\tdisplay: inline-block;\\n\\t\\tpadding: 0.2rem 0.7rem 0.2rem;\\n\\t\\tmargin: 2rem 0 0 0;\\n\\t}\\n\\n\\tarticle :global(a) {\\n\\t\\tcolor: #777;\\n\\t\\tborder-bottom: 1px solid #999;\\n\\t}\\n\\n\\tarticle :global(a:hover) {\\n\\t\\tcolor: #333;\\n\\t\\tborder-bottom: 1px solid #333;\\n\\t}\\n\\n\\tarticle :global(h1 a),\\n\\tarticle :global(h2 a),\\n\\tarticle :global(h3 a),\\n\\tarticle :global(h4 a) {\\n\\t\\tdisplay: block;\\n\\t\\theight: 100%;\\n\\t\\twidth: 0;\\n\\t\\tpadding-top: 1.23rem;\\n\\t}\\n\\n\\t.mini {\\n\\t\\ttext-transform: lowercase;\\n\\t\\tmargin: 0;\\n\\t\\tfont-family: 'fira-full';\\n\\t\\tfont-weight: normal;\\n\\t\\tfont-size: 1.6rem;\\n\\t}\\n\\n\\t.container {\\n\\t\\tdisplay: grid;\\n\\t\\tgrid-template-columns: repeat(12, 1fr);\\n\\t\\tgrid-template-rows: 1fr;\\n\\t\\tgrid-gap: 3rem;\\n\\t\\tmargin-top: 3rem;\\n\\t}\\n\\n\\t.container :global(h1) {\\n\\t\\tfont-size: 4rem;\\n\\t\\ttext-align: left;\\n\\t}\\n\\n\\tarticle {\\n\\t\\tgrid-column: 5 / span 8;\\n\\t\\tmax-width: 100%;\\n\\t\\tmin-width: 0;\\n\\t\\tclear: both;\\n\\t}\\n\\n\\t@media (max-width: 930px) {\\n\\t\\tarticle {\\n\\t\\t\\twidth: 100%;\\n\\t\\t\\tmax-width: 100%;\\n\\t\\t\\tmargin-left: 0;\\n\\t\\t\\tmargin-top: 2rem;\\n\\t\\t}\\n\\n\\t\\tarticle :global(h1) {\\n\\t\\t\\ttext-align: center;\\n\\t\\t}\\n\\t}\\n\\n\\t@media (max-width: 1100px) {\\n\\t\\tnav {\\n\\t\\t\\tright: 0;\\n\\t\\t\\ttransition: 0.2s;\\n\\t\\t\\tmargin-top: 0;\\n\\t\\t\\theight: 100%;\\n\\t\\t\\tz-index: 99;\\n\\t\\t\\tbox-shadow: 0 1px 4px 2px rgba(1, 1, 1, 0.1);\\n\\t\\t\\tpadding-left: 5rem;\\n\\t\\t\\ttransform: translateX(100%);\\n\\t\\t}\\n\\n\\t\\tarticle {\\n\\t\\t\\tgrid-column: 1 / span 12;\\n\\t\\t\\tpadding: 0 6rem;\\n\\t\\t}\\n\\n\\t\\t.menu {\\n\\t\\t\\tdisplay: block;\\n\\t\\t\\tposition: fixed;\\n\\t\\t\\ttop: 1.8rem;\\n\\t\\t\\tright: 1.8rem;\\n\\t\\t\\tz-index: 999;\\n\\t\\t\\theight: 3.2rem;\\n\\t\\t\\tpadding: 6px 7px 6px 7px;\\n\\t\\t\\tbackground: #fff;\\n\\t\\t\\tbox-sizing: border-box;\\n\\t\\t\\tborder-radius: 3px;\\n\\t\\t\\t/* border: 1px solid grey; */\\n\\t\\t\\tbox-shadow: 0 1px 5px rgba(0, 0, 0, 0.15);\\n\\t\\t\\tcursor: pointer;\\n\\t\\t}\\n\\n\\t\\t.icon {\\n\\t\\t\\twidth: 2rem;\\n\\t\\t\\theight: 2rem;\\n\\t\\t\\tdisplay: inline-block;\\n\\t\\t\\tdisplay: flex;\\n\\t\\t\\tjustify-content: center;\\n\\t\\t\\talign-items: center;\\n\\t\\t}\\n\\n\\t\\t.icon svg {\\n\\t\\t\\twidth: 100%;\\n\\t\\t\\theight: 100%;\\n\\t\\t}\\n\\n\\t\\tli.solo:first-child {\\n\\t\\t\\tmargin-top: 0;\\n\\t\\t}\\n\\t}\\n\\n\\t.menu_show {\\n\\t\\ttransform: translateX(0);\\n\\t}\\n\\n\\t@media (max-width: 550px) {\\n\\t\\tnav {\\n\\t\\t\\twidth: 100%;\\n\\t\\t}\\n\\n\\t\\tarticle {\\n\\t\\t\\tpadding: 0px;\\n\\t\\t\\t/* display: block;÷ */\\n\\t\\t}\\n\\n\\t\\t.container {\\n\\t\\t\\tdisplay: block;\\n\\t\\t\\toverflow: hidden;\\n\\t\\t}\\n\\n\\t\\tarticle > :global(*) {\\n\\t\\t\\tmargin-left: 30px !important;\\n\\t\\t\\tmargin-right: 30px !important;\\n\\t\\t}\\n\\n\\t\\tarticle > :global(pre:not(.language-sig)) {\\n\\t\\t\\tmargin-left: 0 !important;\\n\\t\\t\\tmargin-right: 0 !important;\\n\\t\\t\\tborder-radius: 0 !important;\\n\\t\\t}\\n\\n\\t\\tarticle > :global(.language-sig) {\\n\\t\\t\\twidth: calc(100% - 6rem);\\n\\t\\t}\\n\\n\\t\\tarticle :global(pre) {\\n\\t\\t\\tpadding: 1rem 3rem;\\n\\t\\t}\\n\\t}\\n\\n\\t@media (max-width: 330px) {\\n\\t\\t.menu {\\n\\t\\t\\ttop: 7.8rem;\\n\\t\\t}\\n\\t}\\n</style>\\n\\n<svelte:window bind:scrollY bind:innerWidth={width} />\\n\\n<svelte:head>\\n\\t<title>mdsvex docs!</title>\\n</svelte:head>\\n\\n{#if width < 1100}\\n\\t<span class=\\\"menu\\\" on:click={() => (menu_show = !menu_show)}>\\n\\t\\t<span class=\\\"icon\\\">\\n\\t\\t\\t{#if !menu_show}\\n\\t\\t\\t\\t<svg\\n\\t\\t\\t\\t\\taria-hidden=\\\"true\\\"\\n\\t\\t\\t\\t\\tfocusable=\\\"false\\\"\\n\\t\\t\\t\\t\\tdata-prefix=\\\"fas\\\"\\n\\t\\t\\t\\t\\tdata-icon=\\\"bars\\\"\\n\\t\\t\\t\\t\\tclass=\\\"svg-inline--fa fa-bars fa-w-14\\\"\\n\\t\\t\\t\\t\\trole=\\\"img\\\"\\n\\t\\t\\t\\t\\txmlns=\\\"http://www.w3.org/2000/svg\\\"\\n\\t\\t\\t\\t\\tviewBox=\\\"0 0 448 512\\\">\\n\\t\\t\\t\\t\\t<path\\n\\t\\t\\t\\t\\t\\tfill=\\\"currentColor\\\"\\n\\t\\t\\t\\t\\t\\td=\\\"M16 132h416c8.837 0 16-7.163\\n\\t\\t\\t\\t\\t\\t16-16V76c0-8.837-7.163-16-16-16H16C7.163 60 0 67.163 0 76v40c0 8.837\\n\\t\\t\\t\\t\\t\\t7.163 16 16 16zm0 160h416c8.837 0 16-7.163\\n\\t\\t\\t\\t\\t\\t16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0\\n\\t\\t\\t\\t\\t\\t8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163\\n\\t\\t\\t\\t\\t\\t16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0\\n\\t\\t\\t\\t\\t\\t8.837 7.163 16 16 16z\\\" />\\n\\t\\t\\t\\t</svg>\\n\\t\\t\\t{:else}\\n\\t\\t\\t\\t<svg\\n\\t\\t\\t\\t\\taria-hidden=\\\"true\\\"\\n\\t\\t\\t\\t\\tfocusable=\\\"false\\\"\\n\\t\\t\\t\\t\\tdata-prefix=\\\"fas\\\"\\n\\t\\t\\t\\t\\tdata-icon=\\\"times\\\"\\n\\t\\t\\t\\t\\tclass=\\\"svg-inline--fa fa-times fa-w-11\\\"\\n\\t\\t\\t\\t\\trole=\\\"img\\\"\\n\\t\\t\\t\\t\\txmlns=\\\"http://www.w3.org/2000/svg\\\"\\n\\t\\t\\t\\t\\tviewBox=\\\"0 0 352 512\\\">\\n\\t\\t\\t\\t\\t<path\\n\\t\\t\\t\\t\\t\\tfill=\\\"currentColor\\\"\\n\\t\\t\\t\\t\\t\\td=\\\"M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19\\n\\t\\t\\t\\t\\t\\t0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28\\n\\t\\t\\t\\t\\t\\t75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28\\n\\t\\t\\t\\t\\t\\t12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28\\n\\t\\t\\t\\t\\t\\t32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176\\n\\t\\t\\t\\t\\t\\t322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48\\n\\t\\t\\t\\t\\t\\t0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z\\\" />\\n\\t\\t\\t\\t</svg>\\n\\t\\t\\t{/if}\\n\\t\\t</span>\\n\\t</span>\\n{/if}\\n\\n<main>\\n\\t<Cheatsheet />\\n\\t<div style=\\\"position: relative;\\\">\\n\\n\\t\\t{#if position}\\n\\t\\t\\t<nav style=\\\"position: {position};\\\" class:menu_show>\\n\\t\\t\\t\\t<ul>\\n\\n\\t\\t\\t\\t\\t{#each nav as [title, href, children]}\\n\\t\\t\\t\\t\\t\\t<li class={children ? 'solo' : 'solo'}>\\n\\t\\t\\t\\t\\t\\t\\t<a\\n\\t\\t\\t\\t\\t\\t\\t\\tclass:active={current === href}\\n\\t\\t\\t\\t\\t\\t\\t\\t{href}\\n\\t\\t\\t\\t\\t\\t\\t\\ton:click={() => (menu_show = false) && (current = href)}>\\n\\t\\t\\t\\t\\t\\t\\t\\t{title}\\n\\t\\t\\t\\t\\t\\t\\t</a>\\n\\t\\t\\t\\t\\t\\t\\t{#if children}\\n\\t\\t\\t\\t\\t\\t\\t\\t<ul>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t{#each children as [child_title, child_link, is_code]}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t<li>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t{#if is_code}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t<a\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tclass:active={current === child_link}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\ton:click={() => (menu_show = false)}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\thref={child_link}>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t<code>{child_title}</code>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t</a>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t{:else}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t<a\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tclass:active={current === child_link}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\ton:click={() => (menu_show = false)}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\thref={child_link}>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t{child_title}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t</a>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t{/if}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t</li>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t{/each}\\n\\t\\t\\t\\t\\t\\t\\t\\t</ul>\\n\\t\\t\\t\\t\\t\\t\\t{/if}\\n\\t\\t\\t\\t\\t\\t</li>\\n\\t\\t\\t\\t\\t{/each}\\n\\t\\t\\t\\t\\t<li class=\\\"mini\\\">\\n\\t\\t\\t\\t\\t\\t<a href=\\\"/playground\\\">playground</a>\\n\\t\\t\\t\\t\\t</li>\\n\\t\\t\\t\\t\\t<li class=\\\"mini\\\">\\n\\t\\t\\t\\t\\t\\t<a href=\\\"https://www.github.com/pngwn/mdsvex\\\">github</a>\\n\\t\\t\\t\\t\\t</li>\\n\\t\\t\\t\\t</ul>\\n\\t\\t\\t</nav>\\n\\t\\t{/if}\\n\\n\\t\\t<div class=\\\"container\\\">\\n\\t\\t\\t<article bind:this={root}>\\n\\t\\t\\t\\t<slot />\\n\\t\\t\\t\\t{@html docs}\\n\\t\\t\\t</article>\\n\\t\\t</div>\\n\\t</div>\\n</main>\\n\"],\"names\":[],\"mappings\":\"AAyGC,2DAAI,CACH,OAAO,CAAE,IAAI,CAAC,IAAI,CAClB,KAAK,CAAE,KAAK,CACZ,GAAG,CAAE,CAAC,CACN,MAAM,CAAE,KAAK,IAAI,CAAC,CAAC,CAAC,IAAI,CAAC,CACzB,UAAU,CAAE,MAAM,CAClB,UAAU,CAAE,IAAI,CAChB,UAAU,CAAE,OACb,CAEA,0DAAG,CACF,eAAe,CAAE,IAClB,CAEA,0DAAG,CACF,MAAM,CAAE,IAAI,CAAC,GAAG,CAChB,QAAQ,CAAE,QAAQ,CAClB,cAAc,CAAE,SAAS,CACzB,WAAW,CAAE,IAAI,CACjB,WAAW,CAAE,eACd,CAEA,gBAAE,CAAG,gBAAE,CAAG,gBAAE,CAAG,gBAAG,CACjB,MAAM,CAAE,IAAI,CAAC,GAAG,CAChB,cAAc,CAAE,IAAI,CACpB,WAAW,CAAE,GAAG,CAChB,WAAW,CAAE,UACd,CAEA,yDAAE,CACD,eAAe,CAAE,IAAI,CACrB,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,IAAI,CACX,WAAW,CAAE,IACd,CAEA,eAAC,CAAC,8CAAK,CACN,QAAQ,CAAE,QAAQ,CAClB,aAAa,CAAE,MAAM,CACrB,WAAW,CAAE,MAAM,CACnB,KAAK,CAAE,IAAI,CACX,sBAAsB,CAAE,OAAO,CAC/B,UAAU,CAAE,IAAI,CAChB,OAAO,CAAE,MAAM,CAAC,MAAM,CAAC,CAAC,CAAC,MAAM,CAAC,UAAU,CAC1C,UAAU,CAAE,IAAI,CAChB,WAAW,CAAE,WAAW,CACxB,SAAS,CAAE,MACZ,CAEA,yDAAC,MAAM,CACP,eAAC,MAAM,CAAC,8CAAI,CACZ,CAAC,+DAAQ,CACR,KAAK,CAAE,IACR,CAEA,eAAC,MAAM,CAAC,8CAAK,CACZ,UAAU,CAAE,IACb,CAEA,CAAC,+DAAQ,CACR,WAAW,CAAE,IACd,CAEA,CAAC,qBAAO,CAAC,8CAAK,CACb,UAAU,CAAE,IAAI,CAChB,KAAK,CAAE,IACR,CAEA,qBAAO,CAAS,EAAI,CACnB,aAAa,CAAE,MAAM,CACrB,WAAW,CAAE,YAAY,CACzB,WAAW,CAAE,GAAG,CAChB,SAAS,CAAE,IACZ,CAEA,qBAAO,CAAS,EAAI,CACnB,MAAM,CAAE,IAAI,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACrB,aAAa,CAAE,GAAG,CAAC,KAAK,CAAC,IAAI,CAC7B,WAAW,CAAE,kBACd,CAEA,qBAAO,CAAS,EAAI,CACnB,aAAa,CAAE,IAAI,CACnB,UAAU,CAAE,IAAI,CAChB,WAAW,CAAE,kBACd,CAEA,qBAAO,CAAS,EAAI,CACnB,UAAU,CAAE,IAAI,CAChB,aAAa,CAAE,IAAI,CACnB,WAAW,CAAE,kBACd,CAEA,qBAAO,CAAS,CAAG,CAClB,WAAW,CAAE,aACd,CAEA,qBAAO,CAAW,EAAI,CACrB,WAAW,CAAE,IAAI,CAAC,UACnB,CAEA,qBAAO,CAAS,IAAM,CACrB,WAAW,CAAE,WAAW,CACxB,QAAQ,CAAE,QAAQ,CAClB,aAAa,CAAE,MAAM,CACrB,KAAK,CAAE,IAAI,CACX,sBAAsB,CAAE,OAAO,CAC/B,UAAU,CAAE,IAAI,CAChB,OAAO,CAAE,MAAM,CAAC,MAAM,CAAC,IAAI,CAAC,MAAM,CAClC,WAAW,CAAE,GAAG,CAChB,YAAY,CAAE,MAAM,CACpB,UAAU,CAAE,MAAM,CAClB,SAAS,CAAE,MAAM,CACjB,SAAS,CAAE,MACZ,CAEA,qBAAO,CAAS,QAAU,CACzB,WAAW,CAAE,GAAG,CAChB,UAAU,CAAE,IAAI,CAChB,KAAK,CAAE,OAAO,CACd,OAAO,CAAE,CAAC,CACV,WAAW,CAAE,GAAG,CAChB,YAAY,CAAE,MAAM,CACpB,UAAU,CAAE,MAAM,CAClB,SAAS,CAAE,MAAM,CACjB,QAAQ,CAAE,IACX,CAEA,qBAAO,CAAS,GAAK,CACpB,UAAU,CAAE,OAAO,CACnB,KAAK,CAAE,OAAO,CACd,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,IAAI,CAAC,IAAI,CAClB,MAAM,CAAE,IAAI,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACrB,SAAS,CAAE,MAAM,CACjB,WAAW,CAAE,GAAG,CAChB,YAAY,CAAE,MAAM,CACpB,UAAU,CAAE,MAAM,CAClB,SAAS,CAAE,MAAM,CACjB,WAAW,CAAE,MACd,CAEA,qBAAO,CAAS,UAAY,CAC3B,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,OACnB,CAEA,qBAAO,CAAS,YAAc,CAC7B,KAAK,CAAE,IAAI,CACX,SAAS,CAAE,MACZ,CAEA,qBAAO,CAAS,OAAS,CACxB,SAAS,CAAE,MAEZ,CAEA,qBAAO,CAAS,OAAS,CACxB,SAAS,CAAE,MAAM,CACjB,aAAa,CAAE,IAChB,CAEA,qBAAO,CAAS,gBAAkB,CACjC,OAAO,CAAE,YAAY,CACrB,OAAO,CAAE,MAAM,CAAC,MAAM,CAAC,MAAM,CAC7B,MAAM,CAAE,IAAI,CAAC,CAAC,CAAC,CAAC,CAAC,CAClB,CAEA,qBAAO,CAAS,CAAG,CAClB,KAAK,CAAE,IAAI,CACX,aAAa,CAAE,GAAG,CAAC,KAAK,CAAC,IAC1B,CAEA,qBAAO,CAAS,OAAS,CACxB,KAAK,CAAE,IAAI,CACX,aAAa,CAAE,GAAG,CAAC,KAAK,CAAC,IAC1B,CAEA,qBAAO,CAAS,IAAK,CACrB,qBAAO,CAAS,IAAK,CACrB,qBAAO,CAAS,IAAK,CACrB,qBAAO,CAAS,IAAM,CACrB,OAAO,CAAE,KAAK,CACd,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,CAAC,CACR,WAAW,CAAE,OACd,CAEA,6DAAM,CACL,cAAc,CAAE,SAAS,CACzB,MAAM,CAAE,CAAC,CACT,WAAW,CAAE,WAAW,CACxB,WAAW,CAAE,MAAM,CACnB,SAAS,CAAE,MACZ,CAEA,kEAAW,CACV,OAAO,CAAE,IAAI,CACb,qBAAqB,CAAE,OAAO,EAAE,CAAC,CAAC,GAAG,CAAC,CACtC,kBAAkB,CAAE,GAAG,CACvB,QAAQ,CAAE,IAAI,CACd,UAAU,CAAE,IACb,CAEA,wBAAU,CAAS,EAAI,CACtB,SAAS,CAAE,IAAI,CACf,UAAU,CAAE,IACb,CAEA,+DAAQ,CACP,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CAAC,CACvB,SAAS,CAAE,IAAI,CACf,SAAS,CAAE,CAAC,CACZ,KAAK,CAAE,IACR,CAEA,MAAO,YAAY,KAAK,CAAE,CACzB,+DAAQ,CACP,KAAK,CAAE,IAAI,CACX,SAAS,CAAE,IAAI,CACf,WAAW,CAAE,CAAC,CACd,UAAU,CAAE,IACb,CAEA,qBAAO,CAAS,EAAI,CACnB,UAAU,CAAE,MACb,CACD,CAEA,MAAO,YAAY,MAAM,CAAE,CAC1B,2DAAI,CACH,KAAK,CAAE,CAAC,CACR,UAAU,CAAE,IAAI,CAChB,UAAU,CAAE,CAAC,CACb,MAAM,CAAE,IAAI,CACZ,OAAO,CAAE,EAAE,CACX,UAAU,CAAE,CAAC,CAAC,GAAG,CAAC,GAAG,CAAC,GAAG,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,GAAG,CAAC,CAC5C,YAAY,CAAE,IAAI,CAClB,SAAS,CAAE,WAAW,IAAI,CAC3B,CAEA,+DAAQ,CACP,WAAW,CAAE,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,EAAE,CACxB,OAAO,CAAE,CAAC,CAAC,IACZ,CAEA,6DAAM,CACL,OAAO,CAAE,KAAK,CACd,QAAQ,CAAE,KAAK,CACf,GAAG,CAAE,MAAM,CACX,KAAK,CAAE,MAAM,CACb,OAAO,CAAE,GAAG,CACZ,MAAM,CAAE,MAAM,CACd,OAAO,CAAE,GAAG,CAAC,GAAG,CAAC,GAAG,CAAC,GAAG,CACxB,UAAU,CAAE,IAAI,CAChB,UAAU,CAAE,UAAU,CACtB,aAAa,CAAE,GAAG,CAElB,UAAU,CAAE,CAAC,CAAC,GAAG,CAAC,GAAG,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,IAAI,CAAC,CACzC,MAAM,CAAE,OACT,CAEA,6DAAM,CACL,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IAAI,CACZ,OAAO,CAAE,YAAY,CACrB,OAAO,CAAE,IAAI,CACb,eAAe,CAAE,MAAM,CACvB,WAAW,CAAE,MACd,CAEA,mBAAK,CAAC,6CAAI,CACT,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IACT,CAEA,EAAE,6DAAK,YAAa,CACnB,UAAU,CAAE,CACb,CACD,CAEA,kEAAW,CACV,SAAS,CAAE,WAAW,CAAC,CACxB,CAEA,MAAO,YAAY,KAAK,CAAE,CACzB,2DAAI,CACH,KAAK,CAAE,IACR,CAEA,+DAAQ,CACP,OAAO,CAAE,GAEV,CAEA,kEAAW,CACV,OAAO,CAAE,KAAK,CACd,QAAQ,CAAE,MACX,CAEA,qBAAO,CAAW,CAAG,CACpB,WAAW,CAAE,IAAI,CAAC,UAAU,CAC5B,YAAY,CAAE,IAAI,CAAC,UACpB,CAEA,qBAAO,CAAW,sBAAwB,CACzC,WAAW,CAAE,CAAC,CAAC,UAAU,CACzB,YAAY,CAAE,CAAC,CAAC,UAAU,CAC1B,aAAa,CAAE,CAAC,CAAC,UAClB,CAEA,qBAAO,CAAW,aAAe,CAChC,KAAK,CAAE,KAAK,IAAI,CAAC,CAAC,CAAC,IAAI,CACxB,CAEA,qBAAO,CAAS,GAAK,CACpB,OAAO,CAAE,IAAI,CAAC,IACf,CACD,CAEA,MAAO,YAAY,KAAK,CAAE,CACzB,6DAAM,CACL,GAAG,CAAE,MACN,CACD\"}"
};

const Docs = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let $page, $$unsubscribe_page;
	let root;
	let current;
	let position = '';
	const { page } = stores$1();
	$$unsubscribe_page = subscribe(page, value => $page = value);

	const nav = [
		['Install', 'docs#install-it'],
		[
			'Use',
			'docs#use-it',
			[['mdsvex', 'docs#mdsvex-1', true], ['compile', 'docs#compile', true]]
		],
		[
			'Options',
			'docs#options',
			[
				['extensions', 'docs#extensions', true],
				['smartypants', 'docs#smartypants', true],
				['layout', 'docs#layout', true],
				['remarkPlugins', 'docs#remarkplugins--rehypeplugins', true],
				['rehypePlugins', 'docs#remarkplugins--rehypeplugins', true],
				['highlight', 'docs#highlight', true],
				['frontmatter', 'docs#frontmatter', true]
			]
		],
		[
			'Layouts',
			'docs#layouts',
			[
				['named layouts', 'docs#named-layouts', false],
				['disabling layouts', 'docs#disabling-layouts', false],
				['custom components', 'docs#custom-components', false]
			]
		],
		['Frontmatter', 'docs#frontmatter-1'],
		['Integrations', 'docs#integrations', [['sapper', 'docs#with-sapper', false]]],
		['Limitations', 'docs#limitations']
	];

	function remove_origin(href) {
		const re = new RegExp(`http(s*)://${$page.host}/`);
		return href.replace(re, '');
	}

	function calculate_positions() {
		if (root.getBoundingClientRect().top >= 0 && window.innerWidth > 1100) {
			position = 'absolute';
		} else {
			position = 'fixed';
		}

		const nodes = Array.from(root.children).filter(v => v.tagName === 'H2' || v.tagName === 'H3');
		const last = nodes.length - 1;

		if (~~root.getBoundingClientRect().bottom === window.innerHeight) {
			console.log('boo');
			current = 'docs' + remove_origin(nodes[last].children[0].href);
			return;
		}

		for (let node of nodes) {
			const { top } = node.getBoundingClientRect();

			if (top > 5) {
				break;
			}

			current = 'docs' + remove_origin(node.children[0].href);
		}
	}

	// somebody save me
	onMount(() => {
		if (window !== undefined && window.location.hash) {
			const el = document.getElementById(window.location.hash.replace('#', ''));
			el && el.scrollIntoView();
		}

		calculate_positions();
	});
	$$result.css.add(css);
	$$unsubscribe_page();

	return ` ${($$result.head += `${($$result.title = `<title>mdsvex docs!</title>`, "")}`, "")} ${``} <main>${validate_component(Cheatsheet, "Cheatsheet").$$render($$result, {}, {}, {})} <div style="position: relative;">${position
	? `<nav style="${"position: " + escape(position, true) + ";"}" class="${["svelte-t254dh", ""].join(' ').trim()}"><ul class="svelte-t254dh">${each(nav, ([title, href, children]) => {
			return `<li class="${escape(null_to_empty(children ? 'solo' : 'solo'), true) + " svelte-t254dh"}"><a${add_attribute("href", href, 0)} class="${["svelte-t254dh", current === href ? "active" : ""].join(' ').trim()}">${escape(title)}</a> ${children
			? `<ul class="svelte-t254dh">${each(children, ([child_title, child_link, is_code]) => {
					return `<li class="svelte-t254dh">${is_code
					? `<a${add_attribute("href", child_link, 0)} class="${["svelte-t254dh", current === child_link ? "active" : ""].join(' ').trim()}"><code class="svelte-t254dh">${escape(child_title)}</code> </a>`
					: `<a${add_attribute("href", child_link, 0)} class="${["svelte-t254dh", current === child_link ? "active" : ""].join(' ').trim()}">${escape(child_title)} </a>`} </li>`;
				})} </ul>`
			: ``} </li>`;
		})} <li class="mini svelte-t254dh"><a href="/playground" class="svelte-t254dh">playground</a></li> <li class="mini svelte-t254dh"><a href="https://www.github.com/pngwn/mdsvex" class="svelte-t254dh">github</a></li></ul></nav>`
	: ``} <div class="container svelte-t254dh"><article class="svelte-t254dh"${add_attribute("this", root, 0)}>${slots.default ? slots.default({}) : ``} ${docs}</article></div></div></main>`;
});

var component_2 = /*#__PURE__*/Object.freeze({
	__proto__: null,
	'default': Docs
});

// This file is generated by Sapper — do not edit it!

const manifest = {
	server_routes: [
		
	],

	pages: [
		{
			// index.svelte
			pattern: /^\/$/,
			parts: [
				{ name: "index", file: "index.svelte", component: component_0 }
			]
		},

		{
			// playground.svelte
			pattern: /^\/playground\/?$/,
			parts: [
				{ name: "playground", file: "playground.svelte", component: component_1 }
			]
		},

		{
			// docs.svelte
			pattern: /^\/docs\/?$/,
			parts: [
				{ name: "docs", file: "docs.svelte", component: component_2 }
			]
		}
	],

	root_comp,
	error: Error$1
};

const build_dir = "__sapper__/build";

/*! *****************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

/**
 * @param typeMap [Object] Map of MIME type -> Array[extensions]
 * @param ...
 */
function Mime() {
  this._types = Object.create(null);
  this._extensions = Object.create(null);

  for (var i = 0; i < arguments.length; i++) {
    this.define(arguments[i]);
  }

  this.define = this.define.bind(this);
  this.getType = this.getType.bind(this);
  this.getExtension = this.getExtension.bind(this);
}

/**
 * Define mimetype -> extension mappings.  Each key is a mime-type that maps
 * to an array of extensions associated with the type.  The first extension is
 * used as the default extension for the type.
 *
 * e.g. mime.define({'audio/ogg', ['oga', 'ogg', 'spx']});
 *
 * If a type declares an extension that has already been defined, an error will
 * be thrown.  To suppress this error and force the extension to be associated
 * with the new type, pass `force`=true.  Alternatively, you may prefix the
 * extension with "*" to map the type to extension, without mapping the
 * extension to the type.
 *
 * e.g. mime.define({'audio/wav', ['wav']}, {'audio/x-wav', ['*wav']});
 *
 *
 * @param map (Object) type definitions
 * @param force (Boolean) if true, force overriding of existing definitions
 */
Mime.prototype.define = function(typeMap, force) {
  for (var type in typeMap) {
    var extensions = typeMap[type].map(function(t) {return t.toLowerCase()});
    type = type.toLowerCase();

    for (var i = 0; i < extensions.length; i++) {
      var ext = extensions[i];

      // '*' prefix = not the preferred type for this extension.  So fixup the
      // extension, and skip it.
      if (ext[0] == '*') {
        continue;
      }

      if (!force && (ext in this._types)) {
        throw new Error(
          'Attempt to change mapping for "' + ext +
          '" extension from "' + this._types[ext] + '" to "' + type +
          '". Pass `force=true` to allow this, otherwise remove "' + ext +
          '" from the list of extensions for "' + type + '".'
        );
      }

      this._types[ext] = type;
    }

    // Use first extension as default
    if (force || !this._extensions[type]) {
      var ext = extensions[0];
      this._extensions[type] = (ext[0] != '*') ? ext : ext.substr(1);
    }
  }
};

/**
 * Lookup a mime type based on extension
 */
Mime.prototype.getType = function(path) {
  path = String(path);
  var last = path.replace(/^.*[/\\]/, '').toLowerCase();
  var ext = last.replace(/^.*\./, '').toLowerCase();

  var hasPath = last.length < path.length;
  var hasDot = ext.length < last.length - 1;

  return (hasDot || !hasPath) && this._types[ext] || null;
};

/**
 * Return file extension associated with a mime type
 */
Mime.prototype.getExtension = function(type) {
  type = /^\s*([^;\s]*)/.test(type) && RegExp.$1;
  return type && this._extensions[type.toLowerCase()] || null;
};

var Mime_1 = Mime;

var standard = {"application/andrew-inset":["ez"],"application/applixware":["aw"],"application/atom+xml":["atom"],"application/atomcat+xml":["atomcat"],"application/atomdeleted+xml":["atomdeleted"],"application/atomsvc+xml":["atomsvc"],"application/atsc-dwd+xml":["dwd"],"application/atsc-held+xml":["held"],"application/atsc-rsat+xml":["rsat"],"application/bdoc":["bdoc"],"application/calendar+xml":["xcs"],"application/ccxml+xml":["ccxml"],"application/cdfx+xml":["cdfx"],"application/cdmi-capability":["cdmia"],"application/cdmi-container":["cdmic"],"application/cdmi-domain":["cdmid"],"application/cdmi-object":["cdmio"],"application/cdmi-queue":["cdmiq"],"application/cu-seeme":["cu"],"application/dash+xml":["mpd"],"application/davmount+xml":["davmount"],"application/docbook+xml":["dbk"],"application/dssc+der":["dssc"],"application/dssc+xml":["xdssc"],"application/ecmascript":["ecma","es"],"application/emma+xml":["emma"],"application/emotionml+xml":["emotionml"],"application/epub+zip":["epub"],"application/exi":["exi"],"application/fdt+xml":["fdt"],"application/font-tdpfr":["pfr"],"application/geo+json":["geojson"],"application/gml+xml":["gml"],"application/gpx+xml":["gpx"],"application/gxf":["gxf"],"application/gzip":["gz"],"application/hjson":["hjson"],"application/hyperstudio":["stk"],"application/inkml+xml":["ink","inkml"],"application/ipfix":["ipfix"],"application/its+xml":["its"],"application/java-archive":["jar","war","ear"],"application/java-serialized-object":["ser"],"application/java-vm":["class"],"application/javascript":["js","mjs"],"application/json":["json","map"],"application/json5":["json5"],"application/jsonml+json":["jsonml"],"application/ld+json":["jsonld"],"application/lgr+xml":["lgr"],"application/lost+xml":["lostxml"],"application/mac-binhex40":["hqx"],"application/mac-compactpro":["cpt"],"application/mads+xml":["mads"],"application/manifest+json":["webmanifest"],"application/marc":["mrc"],"application/marcxml+xml":["mrcx"],"application/mathematica":["ma","nb","mb"],"application/mathml+xml":["mathml"],"application/mbox":["mbox"],"application/mediaservercontrol+xml":["mscml"],"application/metalink+xml":["metalink"],"application/metalink4+xml":["meta4"],"application/mets+xml":["mets"],"application/mmt-aei+xml":["maei"],"application/mmt-usd+xml":["musd"],"application/mods+xml":["mods"],"application/mp21":["m21","mp21"],"application/mp4":["mp4s","m4p"],"application/mrb-consumer+xml":["*xdf"],"application/mrb-publish+xml":["*xdf"],"application/msword":["doc","dot"],"application/mxf":["mxf"],"application/n-quads":["nq"],"application/n-triples":["nt"],"application/node":["cjs"],"application/octet-stream":["bin","dms","lrf","mar","so","dist","distz","pkg","bpk","dump","elc","deploy","exe","dll","deb","dmg","iso","img","msi","msp","msm","buffer"],"application/oda":["oda"],"application/oebps-package+xml":["opf"],"application/ogg":["ogx"],"application/omdoc+xml":["omdoc"],"application/onenote":["onetoc","onetoc2","onetmp","onepkg"],"application/oxps":["oxps"],"application/p2p-overlay+xml":["relo"],"application/patch-ops-error+xml":["*xer"],"application/pdf":["pdf"],"application/pgp-encrypted":["pgp"],"application/pgp-signature":["asc","sig"],"application/pics-rules":["prf"],"application/pkcs10":["p10"],"application/pkcs7-mime":["p7m","p7c"],"application/pkcs7-signature":["p7s"],"application/pkcs8":["p8"],"application/pkix-attr-cert":["ac"],"application/pkix-cert":["cer"],"application/pkix-crl":["crl"],"application/pkix-pkipath":["pkipath"],"application/pkixcmp":["pki"],"application/pls+xml":["pls"],"application/postscript":["ai","eps","ps"],"application/provenance+xml":["provx"],"application/pskc+xml":["pskcxml"],"application/raml+yaml":["raml"],"application/rdf+xml":["rdf","owl"],"application/reginfo+xml":["rif"],"application/relax-ng-compact-syntax":["rnc"],"application/resource-lists+xml":["rl"],"application/resource-lists-diff+xml":["rld"],"application/rls-services+xml":["rs"],"application/route-apd+xml":["rapd"],"application/route-s-tsid+xml":["sls"],"application/route-usd+xml":["rusd"],"application/rpki-ghostbusters":["gbr"],"application/rpki-manifest":["mft"],"application/rpki-roa":["roa"],"application/rsd+xml":["rsd"],"application/rss+xml":["rss"],"application/rtf":["rtf"],"application/sbml+xml":["sbml"],"application/scvp-cv-request":["scq"],"application/scvp-cv-response":["scs"],"application/scvp-vp-request":["spq"],"application/scvp-vp-response":["spp"],"application/sdp":["sdp"],"application/senml+xml":["senmlx"],"application/sensml+xml":["sensmlx"],"application/set-payment-initiation":["setpay"],"application/set-registration-initiation":["setreg"],"application/shf+xml":["shf"],"application/sieve":["siv","sieve"],"application/smil+xml":["smi","smil"],"application/sparql-query":["rq"],"application/sparql-results+xml":["srx"],"application/srgs":["gram"],"application/srgs+xml":["grxml"],"application/sru+xml":["sru"],"application/ssdl+xml":["ssdl"],"application/ssml+xml":["ssml"],"application/swid+xml":["swidtag"],"application/tei+xml":["tei","teicorpus"],"application/thraud+xml":["tfi"],"application/timestamped-data":["tsd"],"application/toml":["toml"],"application/ttml+xml":["ttml"],"application/urc-ressheet+xml":["rsheet"],"application/voicexml+xml":["vxml"],"application/wasm":["wasm"],"application/widget":["wgt"],"application/winhlp":["hlp"],"application/wsdl+xml":["wsdl"],"application/wspolicy+xml":["wspolicy"],"application/xaml+xml":["xaml"],"application/xcap-att+xml":["xav"],"application/xcap-caps+xml":["xca"],"application/xcap-diff+xml":["xdf"],"application/xcap-el+xml":["xel"],"application/xcap-error+xml":["xer"],"application/xcap-ns+xml":["xns"],"application/xenc+xml":["xenc"],"application/xhtml+xml":["xhtml","xht"],"application/xliff+xml":["xlf"],"application/xml":["xml","xsl","xsd","rng"],"application/xml-dtd":["dtd"],"application/xop+xml":["xop"],"application/xproc+xml":["xpl"],"application/xslt+xml":["xslt"],"application/xspf+xml":["xspf"],"application/xv+xml":["mxml","xhvml","xvml","xvm"],"application/yang":["yang"],"application/yin+xml":["yin"],"application/zip":["zip"],"audio/3gpp":["*3gpp"],"audio/adpcm":["adp"],"audio/basic":["au","snd"],"audio/midi":["mid","midi","kar","rmi"],"audio/mobile-xmf":["mxmf"],"audio/mp3":["*mp3"],"audio/mp4":["m4a","mp4a"],"audio/mpeg":["mpga","mp2","mp2a","mp3","m2a","m3a"],"audio/ogg":["oga","ogg","spx"],"audio/s3m":["s3m"],"audio/silk":["sil"],"audio/wav":["wav"],"audio/wave":["*wav"],"audio/webm":["weba"],"audio/xm":["xm"],"font/collection":["ttc"],"font/otf":["otf"],"font/ttf":["ttf"],"font/woff":["woff"],"font/woff2":["woff2"],"image/aces":["exr"],"image/apng":["apng"],"image/bmp":["bmp"],"image/cgm":["cgm"],"image/dicom-rle":["drle"],"image/emf":["emf"],"image/fits":["fits"],"image/g3fax":["g3"],"image/gif":["gif"],"image/heic":["heic"],"image/heic-sequence":["heics"],"image/heif":["heif"],"image/heif-sequence":["heifs"],"image/hej2k":["hej2"],"image/hsj2":["hsj2"],"image/ief":["ief"],"image/jls":["jls"],"image/jp2":["jp2","jpg2"],"image/jpeg":["jpeg","jpg","jpe"],"image/jph":["jph"],"image/jphc":["jhc"],"image/jpm":["jpm"],"image/jpx":["jpx","jpf"],"image/jxr":["jxr"],"image/jxra":["jxra"],"image/jxrs":["jxrs"],"image/jxs":["jxs"],"image/jxsc":["jxsc"],"image/jxsi":["jxsi"],"image/jxss":["jxss"],"image/ktx":["ktx"],"image/png":["png"],"image/sgi":["sgi"],"image/svg+xml":["svg","svgz"],"image/t38":["t38"],"image/tiff":["tif","tiff"],"image/tiff-fx":["tfx"],"image/webp":["webp"],"image/wmf":["wmf"],"message/disposition-notification":["disposition-notification"],"message/global":["u8msg"],"message/global-delivery-status":["u8dsn"],"message/global-disposition-notification":["u8mdn"],"message/global-headers":["u8hdr"],"message/rfc822":["eml","mime"],"model/3mf":["3mf"],"model/gltf+json":["gltf"],"model/gltf-binary":["glb"],"model/iges":["igs","iges"],"model/mesh":["msh","mesh","silo"],"model/mtl":["mtl"],"model/obj":["obj"],"model/stl":["stl"],"model/vrml":["wrl","vrml"],"model/x3d+binary":["*x3db","x3dbz"],"model/x3d+fastinfoset":["x3db"],"model/x3d+vrml":["*x3dv","x3dvz"],"model/x3d+xml":["x3d","x3dz"],"model/x3d-vrml":["x3dv"],"text/cache-manifest":["appcache","manifest"],"text/calendar":["ics","ifb"],"text/coffeescript":["coffee","litcoffee"],"text/css":["css"],"text/csv":["csv"],"text/html":["html","htm","shtml"],"text/jade":["jade"],"text/jsx":["jsx"],"text/less":["less"],"text/markdown":["markdown","md"],"text/mathml":["mml"],"text/mdx":["mdx"],"text/n3":["n3"],"text/plain":["txt","text","conf","def","list","log","in","ini"],"text/richtext":["rtx"],"text/rtf":["*rtf"],"text/sgml":["sgml","sgm"],"text/shex":["shex"],"text/slim":["slim","slm"],"text/stylus":["stylus","styl"],"text/tab-separated-values":["tsv"],"text/troff":["t","tr","roff","man","me","ms"],"text/turtle":["ttl"],"text/uri-list":["uri","uris","urls"],"text/vcard":["vcard"],"text/vtt":["vtt"],"text/xml":["*xml"],"text/yaml":["yaml","yml"],"video/3gpp":["3gp","3gpp"],"video/3gpp2":["3g2"],"video/h261":["h261"],"video/h263":["h263"],"video/h264":["h264"],"video/jpeg":["jpgv"],"video/jpm":["*jpm","jpgm"],"video/mj2":["mj2","mjp2"],"video/mp2t":["ts"],"video/mp4":["mp4","mp4v","mpg4"],"video/mpeg":["mpeg","mpg","mpe","m1v","m2v"],"video/ogg":["ogv"],"video/quicktime":["qt","mov"],"video/webm":["webm"]};

var lite = new Mime_1(standard);

function get_server_route_handler(routes) {
    function handle_route(route, req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            req.params = route.params(route.pattern.exec(req.path));
            const method = req.method.toLowerCase();
            // 'delete' cannot be exported from a module because it is a keyword,
            // so check for 'del' instead
            const method_export = method === 'delete' ? 'del' : method;
            const handle_method = route.handlers[method_export];
            if (handle_method) {
                if (process.env.SAPPER_EXPORT) {
                    const { write, end, setHeader } = res;
                    const chunks = [];
                    const headers = {};
                    // intercept data so that it can be exported
                    res.write = function (chunk) {
                        chunks.push(Buffer.from(chunk));
                        return write.apply(res, [chunk]);
                    };
                    res.setHeader = function (name, value) {
                        headers[name.toLowerCase()] = value;
                        setHeader.apply(res, [name, value]);
                    };
                    res.end = function (chunk) {
                        if (chunk)
                            chunks.push(Buffer.from(chunk));
                        end.apply(res, [chunk]);
                        process.send({
                            __sapper__: true,
                            event: 'file',
                            url: req.url,
                            method: req.method,
                            status: res.statusCode,
                            type: headers['content-type'],
                            body: Buffer.concat(chunks)
                        });
                    };
                }
                const handle_next = (err) => {
                    if (err) {
                        res.statusCode = 500;
                        res.end(err.message);
                    }
                    else {
                        process.nextTick(next);
                    }
                };
                try {
                    yield handle_method(req, res, handle_next);
                }
                catch (err) {
                    console.error(err);
                    handle_next(err);
                }
            }
            else {
                // no matching handler for method
                process.nextTick(next);
            }
        });
    }
    return function find_route(req, res, next) {
        for (const route of routes) {
            if (route.pattern.test(req.path)) {
                handle_route(route, req, res, next);
                return;
            }
        }
        next();
    };
}

/*!
 * cookie
 * Copyright(c) 2012-2014 Roman Shtylman
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Module exports.
 * @public
 */

var parse_1 = parse;

/**
 * Module variables.
 * @private
 */

var decode = decodeURIComponent;
var pairSplitRegExp = /; */;

/**
 * Parse a cookie header.
 *
 * Parse the given cookie header string into an object
 * The object has the various cookies as keys(names) => values
 *
 * @param {string} str
 * @param {object} [options]
 * @return {object}
 * @public
 */

function parse(str, options) {
  if (typeof str !== 'string') {
    throw new TypeError('argument str must be a string');
  }

  var obj = {};
  var opt = options || {};
  var pairs = str.split(pairSplitRegExp);
  var dec = opt.decode || decode;

  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    var eq_idx = pair.indexOf('=');

    // skip things that don't look like key=value
    if (eq_idx < 0) {
      continue;
    }

    var key = pair.substr(0, eq_idx).trim();
    var val = pair.substr(++eq_idx, pair.length).trim();

    // quoted values
    if ('"' == val[0]) {
      val = val.slice(1, -1);
    }

    // only assign once
    if (undefined == obj[key]) {
      obj[key] = tryDecode(val, dec);
    }
  }

  return obj;
}

/**
 * Try decoding a string using a decoding function.
 *
 * @param {string} str
 * @param {function} decode
 * @private
 */

function tryDecode(str, decode) {
  try {
    return decode(str);
  } catch (e) {
    return str;
  }
}

var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$';
var unsafeChars = /[<>\b\f\n\r\t\0\u2028\u2029]/g;
var reserved = /^(?:do|if|in|for|int|let|new|try|var|byte|case|char|else|enum|goto|long|this|void|with|await|break|catch|class|const|final|float|short|super|throw|while|yield|delete|double|export|import|native|return|switch|throws|typeof|boolean|default|extends|finally|package|private|abstract|continue|debugger|function|volatile|interface|protected|transient|implements|instanceof|synchronized)$/;
var escaped = {
    '<': '\\u003C',
    '>': '\\u003E',
    '/': '\\u002F',
    '\\': '\\\\',
    '\b': '\\b',
    '\f': '\\f',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
    '\0': '\\0',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029'
};
var objectProtoOwnPropertyNames = Object.getOwnPropertyNames(Object.prototype).sort().join('\0');
function devalue(value) {
    var counts = new Map();
    function walk(thing) {
        if (typeof thing === 'function') {
            throw new Error("Cannot stringify a function");
        }
        if (counts.has(thing)) {
            counts.set(thing, counts.get(thing) + 1);
            return;
        }
        counts.set(thing, 1);
        if (!isPrimitive(thing)) {
            var type = getType(thing);
            switch (type) {
                case 'Number':
                case 'String':
                case 'Boolean':
                case 'Date':
                case 'RegExp':
                    return;
                case 'Array':
                    thing.forEach(walk);
                    break;
                case 'Set':
                case 'Map':
                    Array.from(thing).forEach(walk);
                    break;
                default:
                    var proto = Object.getPrototypeOf(thing);
                    if (proto !== Object.prototype &&
                        proto !== null &&
                        Object.getOwnPropertyNames(proto).sort().join('\0') !== objectProtoOwnPropertyNames) {
                        throw new Error("Cannot stringify arbitrary non-POJOs");
                    }
                    if (Object.getOwnPropertySymbols(thing).length > 0) {
                        throw new Error("Cannot stringify POJOs with symbolic keys");
                    }
                    Object.keys(thing).forEach(function (key) { return walk(thing[key]); });
            }
        }
    }
    walk(value);
    var names = new Map();
    Array.from(counts)
        .filter(function (entry) { return entry[1] > 1; })
        .sort(function (a, b) { return b[1] - a[1]; })
        .forEach(function (entry, i) {
        names.set(entry[0], getName(i));
    });
    function stringify(thing) {
        if (names.has(thing)) {
            return names.get(thing);
        }
        if (isPrimitive(thing)) {
            return stringifyPrimitive(thing);
        }
        var type = getType(thing);
        switch (type) {
            case 'Number':
            case 'String':
            case 'Boolean':
                return "Object(" + stringify(thing.valueOf()) + ")";
            case 'RegExp':
                return "new RegExp(" + stringifyString(thing.source) + ", \"" + thing.flags + "\")";
            case 'Date':
                return "new Date(" + thing.getTime() + ")";
            case 'Array':
                var members = thing.map(function (v, i) { return i in thing ? stringify(v) : ''; });
                var tail = thing.length === 0 || (thing.length - 1 in thing) ? '' : ',';
                return "[" + members.join(',') + tail + "]";
            case 'Set':
            case 'Map':
                return "new " + type + "([" + Array.from(thing).map(stringify).join(',') + "])";
            default:
                var obj = "{" + Object.keys(thing).map(function (key) { return safeKey(key) + ":" + stringify(thing[key]); }).join(',') + "}";
                var proto = Object.getPrototypeOf(thing);
                if (proto === null) {
                    return Object.keys(thing).length > 0
                        ? "Object.assign(Object.create(null)," + obj + ")"
                        : "Object.create(null)";
                }
                return obj;
        }
    }
    var str = stringify(value);
    if (names.size) {
        var params_1 = [];
        var statements_1 = [];
        var values_1 = [];
        names.forEach(function (name, thing) {
            params_1.push(name);
            if (isPrimitive(thing)) {
                values_1.push(stringifyPrimitive(thing));
                return;
            }
            var type = getType(thing);
            switch (type) {
                case 'Number':
                case 'String':
                case 'Boolean':
                    values_1.push("Object(" + stringify(thing.valueOf()) + ")");
                    break;
                case 'RegExp':
                    values_1.push(thing.toString());
                    break;
                case 'Date':
                    values_1.push("new Date(" + thing.getTime() + ")");
                    break;
                case 'Array':
                    values_1.push("Array(" + thing.length + ")");
                    thing.forEach(function (v, i) {
                        statements_1.push(name + "[" + i + "]=" + stringify(v));
                    });
                    break;
                case 'Set':
                    values_1.push("new Set");
                    statements_1.push(name + "." + Array.from(thing).map(function (v) { return "add(" + stringify(v) + ")"; }).join('.'));
                    break;
                case 'Map':
                    values_1.push("new Map");
                    statements_1.push(name + "." + Array.from(thing).map(function (_a) {
                        var k = _a[0], v = _a[1];
                        return "set(" + stringify(k) + ", " + stringify(v) + ")";
                    }).join('.'));
                    break;
                default:
                    values_1.push(Object.getPrototypeOf(thing) === null ? 'Object.create(null)' : '{}');
                    Object.keys(thing).forEach(function (key) {
                        statements_1.push("" + name + safeProp(key) + "=" + stringify(thing[key]));
                    });
            }
        });
        statements_1.push("return " + str);
        return "(function(" + params_1.join(',') + "){" + statements_1.join(';') + "}(" + values_1.join(',') + "))";
    }
    else {
        return str;
    }
}
function getName(num) {
    var name = '';
    do {
        name = chars[num % chars.length] + name;
        num = ~~(num / chars.length) - 1;
    } while (num >= 0);
    return reserved.test(name) ? name + "_" : name;
}
function isPrimitive(thing) {
    return Object(thing) !== thing;
}
function stringifyPrimitive(thing) {
    if (typeof thing === 'string')
        return stringifyString(thing);
    if (thing === void 0)
        return 'void 0';
    if (thing === 0 && 1 / thing < 0)
        return '-0';
    var str = String(thing);
    if (typeof thing === 'number')
        return str.replace(/^(-)?0\./, '$1.');
    return str;
}
function getType(thing) {
    return Object.prototype.toString.call(thing).slice(8, -1);
}
function escapeUnsafeChar(c) {
    return escaped[c] || c;
}
function escapeUnsafeChars(str) {
    return str.replace(unsafeChars, escapeUnsafeChar);
}
function safeKey(key) {
    return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? key : escapeUnsafeChars(JSON.stringify(key));
}
function safeProp(key) {
    return /^[_$a-zA-Z][_$a-zA-Z0-9]*$/.test(key) ? "." + key : "[" + escapeUnsafeChars(JSON.stringify(key)) + "]";
}
function stringifyString(str) {
    var result = '"';
    for (var i = 0; i < str.length; i += 1) {
        var char = str.charAt(i);
        var code = char.charCodeAt(0);
        if (char === '"') {
            result += '\\"';
        }
        else if (char in escaped) {
            result += escaped[char];
        }
        else if (code >= 0xd800 && code <= 0xdfff) {
            var next = str.charCodeAt(i + 1);
            // If this is the beginning of a [high, low] surrogate pair,
            // add the next two characters, otherwise escape
            if (code <= 0xdbff && (next >= 0xdc00 && next <= 0xdfff)) {
                result += char + str[++i];
            }
            else {
                result += "\\u" + code.toString(16).toUpperCase();
            }
        }
        else {
            result += char;
        }
    }
    result += '"';
    return result;
}

// Based on https://github.com/tmpvar/jsdom/blob/aa85b2abf07766ff7bf5c1f6daafb3726f2f2db5/lib/jsdom/living/blob.js

// fix for "Readable" isn't a named export issue
const Readable = Stream.Readable;

const BUFFER = Symbol('buffer');
const TYPE = Symbol('type');

class Blob {
	constructor() {
		this[TYPE] = '';

		const blobParts = arguments[0];
		const options = arguments[1];

		const buffers = [];
		let size = 0;

		if (blobParts) {
			const a = blobParts;
			const length = Number(a.length);
			for (let i = 0; i < length; i++) {
				const element = a[i];
				let buffer;
				if (element instanceof Buffer) {
					buffer = element;
				} else if (ArrayBuffer.isView(element)) {
					buffer = Buffer.from(element.buffer, element.byteOffset, element.byteLength);
				} else if (element instanceof ArrayBuffer) {
					buffer = Buffer.from(element);
				} else if (element instanceof Blob) {
					buffer = element[BUFFER];
				} else {
					buffer = Buffer.from(typeof element === 'string' ? element : String(element));
				}
				size += buffer.length;
				buffers.push(buffer);
			}
		}

		this[BUFFER] = Buffer.concat(buffers);

		let type = options && options.type !== undefined && String(options.type).toLowerCase();
		if (type && !/[^\u0020-\u007E]/.test(type)) {
			this[TYPE] = type;
		}
	}
	get size() {
		return this[BUFFER].length;
	}
	get type() {
		return this[TYPE];
	}
	text() {
		return Promise.resolve(this[BUFFER].toString());
	}
	arrayBuffer() {
		const buf = this[BUFFER];
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		return Promise.resolve(ab);
	}
	stream() {
		const readable = new Readable();
		readable._read = function () {};
		readable.push(this[BUFFER]);
		readable.push(null);
		return readable;
	}
	toString() {
		return '[object Blob]';
	}
	slice() {
		const size = this.size;

		const start = arguments[0];
		const end = arguments[1];
		let relativeStart, relativeEnd;
		if (start === undefined) {
			relativeStart = 0;
		} else if (start < 0) {
			relativeStart = Math.max(size + start, 0);
		} else {
			relativeStart = Math.min(start, size);
		}
		if (end === undefined) {
			relativeEnd = size;
		} else if (end < 0) {
			relativeEnd = Math.max(size + end, 0);
		} else {
			relativeEnd = Math.min(end, size);
		}
		const span = Math.max(relativeEnd - relativeStart, 0);

		const buffer = this[BUFFER];
		const slicedBuffer = buffer.slice(relativeStart, relativeStart + span);
		const blob = new Blob([], { type: arguments[2] });
		blob[BUFFER] = slicedBuffer;
		return blob;
	}
}

Object.defineProperties(Blob.prototype, {
	size: { enumerable: true },
	type: { enumerable: true },
	slice: { enumerable: true }
});

Object.defineProperty(Blob.prototype, Symbol.toStringTag, {
	value: 'Blob',
	writable: false,
	enumerable: false,
	configurable: true
});

/**
 * fetch-error.js
 *
 * FetchError interface for operational errors
 */

/**
 * Create FetchError instance
 *
 * @param   String      message      Error message for human
 * @param   String      type         Error type for machine
 * @param   String      systemError  For Node.js system error
 * @return  FetchError
 */
function FetchError(message, type, systemError) {
  Error.call(this, message);

  this.message = message;
  this.type = type;

  // when err.type is `system`, err.code contains system error code
  if (systemError) {
    this.code = this.errno = systemError.code;
  }

  // hide custom error implementation details from end-users
  Error.captureStackTrace(this, this.constructor);
}

FetchError.prototype = Object.create(Error.prototype);
FetchError.prototype.constructor = FetchError;
FetchError.prototype.name = 'FetchError';

let convert;
try {
	convert = require('encoding').convert;
} catch (e) {}

const INTERNALS = Symbol('Body internals');

// fix an issue where "PassThrough" isn't a named export for node <10
const PassThrough = Stream.PassThrough;

/**
 * Body mixin
 *
 * Ref: https://fetch.spec.whatwg.org/#body
 *
 * @param   Stream  body  Readable stream
 * @param   Object  opts  Response options
 * @return  Void
 */
function Body(body) {
	var _this = this;

	var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
	    _ref$size = _ref.size;

	let size = _ref$size === undefined ? 0 : _ref$size;
	var _ref$timeout = _ref.timeout;
	let timeout = _ref$timeout === undefined ? 0 : _ref$timeout;

	if (body == null) {
		// body is undefined or null
		body = null;
	} else if (isURLSearchParams(body)) {
		// body is a URLSearchParams
		body = Buffer.from(body.toString());
	} else if (isBlob(body)) ; else if (Buffer.isBuffer(body)) ; else if (Object.prototype.toString.call(body) === '[object ArrayBuffer]') {
		// body is ArrayBuffer
		body = Buffer.from(body);
	} else if (ArrayBuffer.isView(body)) {
		// body is ArrayBufferView
		body = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
	} else if (body instanceof Stream) ; else {
		// none of the above
		// coerce to string then buffer
		body = Buffer.from(String(body));
	}
	this[INTERNALS] = {
		body,
		disturbed: false,
		error: null
	};
	this.size = size;
	this.timeout = timeout;

	if (body instanceof Stream) {
		body.on('error', function (err) {
			const error = err.name === 'AbortError' ? err : new FetchError(`Invalid response body while trying to fetch ${_this.url}: ${err.message}`, 'system', err);
			_this[INTERNALS].error = error;
		});
	}
}

Body.prototype = {
	get body() {
		return this[INTERNALS].body;
	},

	get bodyUsed() {
		return this[INTERNALS].disturbed;
	},

	/**
  * Decode response as ArrayBuffer
  *
  * @return  Promise
  */
	arrayBuffer() {
		return consumeBody.call(this).then(function (buf) {
			return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		});
	},

	/**
  * Return raw response as Blob
  *
  * @return Promise
  */
	blob() {
		let ct = this.headers && this.headers.get('content-type') || '';
		return consumeBody.call(this).then(function (buf) {
			return Object.assign(
			// Prevent copying
			new Blob([], {
				type: ct.toLowerCase()
			}), {
				[BUFFER]: buf
			});
		});
	},

	/**
  * Decode response as json
  *
  * @return  Promise
  */
	json() {
		var _this2 = this;

		return consumeBody.call(this).then(function (buffer) {
			try {
				return JSON.parse(buffer.toString());
			} catch (err) {
				return Body.Promise.reject(new FetchError(`invalid json response body at ${_this2.url} reason: ${err.message}`, 'invalid-json'));
			}
		});
	},

	/**
  * Decode response as text
  *
  * @return  Promise
  */
	text() {
		return consumeBody.call(this).then(function (buffer) {
			return buffer.toString();
		});
	},

	/**
  * Decode response as buffer (non-spec api)
  *
  * @return  Promise
  */
	buffer() {
		return consumeBody.call(this);
	},

	/**
  * Decode response as text, while automatically detecting the encoding and
  * trying to decode to UTF-8 (non-spec api)
  *
  * @return  Promise
  */
	textConverted() {
		var _this3 = this;

		return consumeBody.call(this).then(function (buffer) {
			return convertBody(buffer, _this3.headers);
		});
	}
};

// In browsers, all properties are enumerable.
Object.defineProperties(Body.prototype, {
	body: { enumerable: true },
	bodyUsed: { enumerable: true },
	arrayBuffer: { enumerable: true },
	blob: { enumerable: true },
	json: { enumerable: true },
	text: { enumerable: true }
});

Body.mixIn = function (proto) {
	for (const name of Object.getOwnPropertyNames(Body.prototype)) {
		// istanbul ignore else: future proof
		if (!(name in proto)) {
			const desc = Object.getOwnPropertyDescriptor(Body.prototype, name);
			Object.defineProperty(proto, name, desc);
		}
	}
};

/**
 * Consume and convert an entire Body to a Buffer.
 *
 * Ref: https://fetch.spec.whatwg.org/#concept-body-consume-body
 *
 * @return  Promise
 */
function consumeBody() {
	var _this4 = this;

	if (this[INTERNALS].disturbed) {
		return Body.Promise.reject(new TypeError(`body used already for: ${this.url}`));
	}

	this[INTERNALS].disturbed = true;

	if (this[INTERNALS].error) {
		return Body.Promise.reject(this[INTERNALS].error);
	}

	let body = this.body;

	// body is null
	if (body === null) {
		return Body.Promise.resolve(Buffer.alloc(0));
	}

	// body is blob
	if (isBlob(body)) {
		body = body.stream();
	}

	// body is buffer
	if (Buffer.isBuffer(body)) {
		return Body.Promise.resolve(body);
	}

	// istanbul ignore if: should never happen
	if (!(body instanceof Stream)) {
		return Body.Promise.resolve(Buffer.alloc(0));
	}

	// body is stream
	// get ready to actually consume the body
	let accum = [];
	let accumBytes = 0;
	let abort = false;

	return new Body.Promise(function (resolve, reject) {
		let resTimeout;

		// allow timeout on slow response body
		if (_this4.timeout) {
			resTimeout = setTimeout(function () {
				abort = true;
				reject(new FetchError(`Response timeout while trying to fetch ${_this4.url} (over ${_this4.timeout}ms)`, 'body-timeout'));
			}, _this4.timeout);
		}

		// handle stream errors
		body.on('error', function (err) {
			if (err.name === 'AbortError') {
				// if the request was aborted, reject with this Error
				abort = true;
				reject(err);
			} else {
				// other errors, such as incorrect content-encoding
				reject(new FetchError(`Invalid response body while trying to fetch ${_this4.url}: ${err.message}`, 'system', err));
			}
		});

		body.on('data', function (chunk) {
			if (abort || chunk === null) {
				return;
			}

			if (_this4.size && accumBytes + chunk.length > _this4.size) {
				abort = true;
				reject(new FetchError(`content size at ${_this4.url} over limit: ${_this4.size}`, 'max-size'));
				return;
			}

			accumBytes += chunk.length;
			accum.push(chunk);
		});

		body.on('end', function () {
			if (abort) {
				return;
			}

			clearTimeout(resTimeout);

			try {
				resolve(Buffer.concat(accum, accumBytes));
			} catch (err) {
				// handle streams that have accumulated too much data (issue #414)
				reject(new FetchError(`Could not create Buffer from response body for ${_this4.url}: ${err.message}`, 'system', err));
			}
		});
	});
}

/**
 * Detect buffer encoding and convert to target encoding
 * ref: http://www.w3.org/TR/2011/WD-html5-20110113/parsing.html#determining-the-character-encoding
 *
 * @param   Buffer  buffer    Incoming buffer
 * @param   String  encoding  Target encoding
 * @return  String
 */
function convertBody(buffer, headers) {
	if (typeof convert !== 'function') {
		throw new Error('The package `encoding` must be installed to use the textConverted() function');
	}

	const ct = headers.get('content-type');
	let charset = 'utf-8';
	let res, str;

	// header
	if (ct) {
		res = /charset=([^;]*)/i.exec(ct);
	}

	// no charset in content type, peek at response body for at most 1024 bytes
	str = buffer.slice(0, 1024).toString();

	// html5
	if (!res && str) {
		res = /<meta.+?charset=(['"])(.+?)\1/i.exec(str);
	}

	// html4
	if (!res && str) {
		res = /<meta[\s]+?http-equiv=(['"])content-type\1[\s]+?content=(['"])(.+?)\2/i.exec(str);
		if (!res) {
			res = /<meta[\s]+?content=(['"])(.+?)\1[\s]+?http-equiv=(['"])content-type\3/i.exec(str);
			if (res) {
				res.pop(); // drop last quote
			}
		}

		if (res) {
			res = /charset=(.*)/i.exec(res.pop());
		}
	}

	// xml
	if (!res && str) {
		res = /<\?xml.+?encoding=(['"])(.+?)\1/i.exec(str);
	}

	// found charset
	if (res) {
		charset = res.pop();

		// prevent decode issues when sites use incorrect encoding
		// ref: https://hsivonen.fi/encoding-menu/
		if (charset === 'gb2312' || charset === 'gbk') {
			charset = 'gb18030';
		}
	}

	// turn raw buffers into a single utf-8 buffer
	return convert(buffer, 'UTF-8', charset).toString();
}

/**
 * Detect a URLSearchParams object
 * ref: https://github.com/bitinn/node-fetch/issues/296#issuecomment-307598143
 *
 * @param   Object  obj     Object to detect by type or brand
 * @return  String
 */
function isURLSearchParams(obj) {
	// Duck-typing as a necessary condition.
	if (typeof obj !== 'object' || typeof obj.append !== 'function' || typeof obj.delete !== 'function' || typeof obj.get !== 'function' || typeof obj.getAll !== 'function' || typeof obj.has !== 'function' || typeof obj.set !== 'function') {
		return false;
	}

	// Brand-checking and more duck-typing as optional condition.
	return obj.constructor.name === 'URLSearchParams' || Object.prototype.toString.call(obj) === '[object URLSearchParams]' || typeof obj.sort === 'function';
}

/**
 * Check if `obj` is a W3C `Blob` object (which `File` inherits from)
 * @param  {*} obj
 * @return {boolean}
 */
function isBlob(obj) {
	return typeof obj === 'object' && typeof obj.arrayBuffer === 'function' && typeof obj.type === 'string' && typeof obj.stream === 'function' && typeof obj.constructor === 'function' && typeof obj.constructor.name === 'string' && /^(Blob|File)$/.test(obj.constructor.name) && /^(Blob|File)$/.test(obj[Symbol.toStringTag]);
}

/**
 * Clone body given Res/Req instance
 *
 * @param   Mixed  instance  Response or Request instance
 * @return  Mixed
 */
function clone(instance) {
	let p1, p2;
	let body = instance.body;

	// don't allow cloning a used body
	if (instance.bodyUsed) {
		throw new Error('cannot clone body after it is used');
	}

	// check that body is a stream and not form-data object
	// note: we can't clone the form-data object without having it as a dependency
	if (body instanceof Stream && typeof body.getBoundary !== 'function') {
		// tee instance body
		p1 = new PassThrough();
		p2 = new PassThrough();
		body.pipe(p1);
		body.pipe(p2);
		// set instance body to teed body and return the other teed body
		instance[INTERNALS].body = p1;
		body = p2;
	}

	return body;
}

/**
 * Performs the operation "extract a `Content-Type` value from |object|" as
 * specified in the specification:
 * https://fetch.spec.whatwg.org/#concept-bodyinit-extract
 *
 * This function assumes that instance.body is present.
 *
 * @param   Mixed  instance  Any options.body input
 */
function extractContentType(body) {
	if (body === null) {
		// body is null
		return null;
	} else if (typeof body === 'string') {
		// body is string
		return 'text/plain;charset=UTF-8';
	} else if (isURLSearchParams(body)) {
		// body is a URLSearchParams
		return 'application/x-www-form-urlencoded;charset=UTF-8';
	} else if (isBlob(body)) {
		// body is blob
		return body.type || null;
	} else if (Buffer.isBuffer(body)) {
		// body is buffer
		return null;
	} else if (Object.prototype.toString.call(body) === '[object ArrayBuffer]') {
		// body is ArrayBuffer
		return null;
	} else if (ArrayBuffer.isView(body)) {
		// body is ArrayBufferView
		return null;
	} else if (typeof body.getBoundary === 'function') {
		// detect form data input from form-data module
		return `multipart/form-data;boundary=${body.getBoundary()}`;
	} else if (body instanceof Stream) {
		// body is stream
		// can't really do much about this
		return null;
	} else {
		// Body constructor defaults other things to string
		return 'text/plain;charset=UTF-8';
	}
}

/**
 * The Fetch Standard treats this as if "total bytes" is a property on the body.
 * For us, we have to explicitly get it with a function.
 *
 * ref: https://fetch.spec.whatwg.org/#concept-body-total-bytes
 *
 * @param   Body    instance   Instance of Body
 * @return  Number?            Number of bytes, or null if not possible
 */
function getTotalBytes(instance) {
	const body = instance.body;


	if (body === null) {
		// body is null
		return 0;
	} else if (isBlob(body)) {
		return body.size;
	} else if (Buffer.isBuffer(body)) {
		// body is buffer
		return body.length;
	} else if (body && typeof body.getLengthSync === 'function') {
		// detect form data input from form-data module
		if (body._lengthRetrievers && body._lengthRetrievers.length == 0 || // 1.x
		body.hasKnownLength && body.hasKnownLength()) {
			// 2.x
			return body.getLengthSync();
		}
		return null;
	} else {
		// body is stream
		return null;
	}
}

/**
 * Write a Body to a Node.js WritableStream (e.g. http.Request) object.
 *
 * @param   Body    instance   Instance of Body
 * @return  Void
 */
function writeToStream(dest, instance) {
	const body = instance.body;


	if (body === null) {
		// body is null
		dest.end();
	} else if (isBlob(body)) {
		body.stream().pipe(dest);
	} else if (Buffer.isBuffer(body)) {
		// body is buffer
		dest.write(body);
		dest.end();
	} else {
		// body is stream
		body.pipe(dest);
	}
}

// expose Promise
Body.Promise = global.Promise;

/**
 * headers.js
 *
 * Headers class offers convenient helpers
 */

const invalidTokenRegex = /[^\^_`a-zA-Z\-0-9!#$%&'*+.|~]/;
const invalidHeaderCharRegex = /[^\t\x20-\x7e\x80-\xff]/;

function validateName(name) {
	name = `${name}`;
	if (invalidTokenRegex.test(name) || name === '') {
		throw new TypeError(`${name} is not a legal HTTP header name`);
	}
}

function validateValue(value) {
	value = `${value}`;
	if (invalidHeaderCharRegex.test(value)) {
		throw new TypeError(`${value} is not a legal HTTP header value`);
	}
}

/**
 * Find the key in the map object given a header name.
 *
 * Returns undefined if not found.
 *
 * @param   String  name  Header name
 * @return  String|Undefined
 */
function find(map, name) {
	name = name.toLowerCase();
	for (const key in map) {
		if (key.toLowerCase() === name) {
			return key;
		}
	}
	return undefined;
}

const MAP = Symbol('map');
class Headers {
	/**
  * Headers class
  *
  * @param   Object  headers  Response headers
  * @return  Void
  */
	constructor() {
		let init = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : undefined;

		this[MAP] = Object.create(null);

		if (init instanceof Headers) {
			const rawHeaders = init.raw();
			const headerNames = Object.keys(rawHeaders);

			for (const headerName of headerNames) {
				for (const value of rawHeaders[headerName]) {
					this.append(headerName, value);
				}
			}

			return;
		}

		// We don't worry about converting prop to ByteString here as append()
		// will handle it.
		if (init == null) ; else if (typeof init === 'object') {
			const method = init[Symbol.iterator];
			if (method != null) {
				if (typeof method !== 'function') {
					throw new TypeError('Header pairs must be iterable');
				}

				// sequence<sequence<ByteString>>
				// Note: per spec we have to first exhaust the lists then process them
				const pairs = [];
				for (const pair of init) {
					if (typeof pair !== 'object' || typeof pair[Symbol.iterator] !== 'function') {
						throw new TypeError('Each header pair must be iterable');
					}
					pairs.push(Array.from(pair));
				}

				for (const pair of pairs) {
					if (pair.length !== 2) {
						throw new TypeError('Each header pair must be a name/value tuple');
					}
					this.append(pair[0], pair[1]);
				}
			} else {
				// record<ByteString, ByteString>
				for (const key of Object.keys(init)) {
					const value = init[key];
					this.append(key, value);
				}
			}
		} else {
			throw new TypeError('Provided initializer must be an object');
		}
	}

	/**
  * Return combined header value given name
  *
  * @param   String  name  Header name
  * @return  Mixed
  */
	get(name) {
		name = `${name}`;
		validateName(name);
		const key = find(this[MAP], name);
		if (key === undefined) {
			return null;
		}

		return this[MAP][key].join(', ');
	}

	/**
  * Iterate over all headers
  *
  * @param   Function  callback  Executed for each item with parameters (value, name, thisArg)
  * @param   Boolean   thisArg   `this` context for callback function
  * @return  Void
  */
	forEach(callback) {
		let thisArg = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : undefined;

		let pairs = getHeaders(this);
		let i = 0;
		while (i < pairs.length) {
			var _pairs$i = pairs[i];
			const name = _pairs$i[0],
			      value = _pairs$i[1];

			callback.call(thisArg, value, name, this);
			pairs = getHeaders(this);
			i++;
		}
	}

	/**
  * Overwrite header values given name
  *
  * @param   String  name   Header name
  * @param   String  value  Header value
  * @return  Void
  */
	set(name, value) {
		name = `${name}`;
		value = `${value}`;
		validateName(name);
		validateValue(value);
		const key = find(this[MAP], name);
		this[MAP][key !== undefined ? key : name] = [value];
	}

	/**
  * Append a value onto existing header
  *
  * @param   String  name   Header name
  * @param   String  value  Header value
  * @return  Void
  */
	append(name, value) {
		name = `${name}`;
		value = `${value}`;
		validateName(name);
		validateValue(value);
		const key = find(this[MAP], name);
		if (key !== undefined) {
			this[MAP][key].push(value);
		} else {
			this[MAP][name] = [value];
		}
	}

	/**
  * Check for header name existence
  *
  * @param   String   name  Header name
  * @return  Boolean
  */
	has(name) {
		name = `${name}`;
		validateName(name);
		return find(this[MAP], name) !== undefined;
	}

	/**
  * Delete all header values given name
  *
  * @param   String  name  Header name
  * @return  Void
  */
	delete(name) {
		name = `${name}`;
		validateName(name);
		const key = find(this[MAP], name);
		if (key !== undefined) {
			delete this[MAP][key];
		}
	}

	/**
  * Return raw headers (non-spec api)
  *
  * @return  Object
  */
	raw() {
		return this[MAP];
	}

	/**
  * Get an iterator on keys.
  *
  * @return  Iterator
  */
	keys() {
		return createHeadersIterator(this, 'key');
	}

	/**
  * Get an iterator on values.
  *
  * @return  Iterator
  */
	values() {
		return createHeadersIterator(this, 'value');
	}

	/**
  * Get an iterator on entries.
  *
  * This is the default iterator of the Headers object.
  *
  * @return  Iterator
  */
	[Symbol.iterator]() {
		return createHeadersIterator(this, 'key+value');
	}
}
Headers.prototype.entries = Headers.prototype[Symbol.iterator];

Object.defineProperty(Headers.prototype, Symbol.toStringTag, {
	value: 'Headers',
	writable: false,
	enumerable: false,
	configurable: true
});

Object.defineProperties(Headers.prototype, {
	get: { enumerable: true },
	forEach: { enumerable: true },
	set: { enumerable: true },
	append: { enumerable: true },
	has: { enumerable: true },
	delete: { enumerable: true },
	keys: { enumerable: true },
	values: { enumerable: true },
	entries: { enumerable: true }
});

function getHeaders(headers) {
	let kind = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'key+value';

	const keys = Object.keys(headers[MAP]).sort();
	return keys.map(kind === 'key' ? function (k) {
		return k.toLowerCase();
	} : kind === 'value' ? function (k) {
		return headers[MAP][k].join(', ');
	} : function (k) {
		return [k.toLowerCase(), headers[MAP][k].join(', ')];
	});
}

const INTERNAL = Symbol('internal');

function createHeadersIterator(target, kind) {
	const iterator = Object.create(HeadersIteratorPrototype);
	iterator[INTERNAL] = {
		target,
		kind,
		index: 0
	};
	return iterator;
}

const HeadersIteratorPrototype = Object.setPrototypeOf({
	next() {
		// istanbul ignore if
		if (!this || Object.getPrototypeOf(this) !== HeadersIteratorPrototype) {
			throw new TypeError('Value of `this` is not a HeadersIterator');
		}

		var _INTERNAL = this[INTERNAL];
		const target = _INTERNAL.target,
		      kind = _INTERNAL.kind,
		      index = _INTERNAL.index;

		const values = getHeaders(target, kind);
		const len = values.length;
		if (index >= len) {
			return {
				value: undefined,
				done: true
			};
		}

		this[INTERNAL].index = index + 1;

		return {
			value: values[index],
			done: false
		};
	}
}, Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())));

Object.defineProperty(HeadersIteratorPrototype, Symbol.toStringTag, {
	value: 'HeadersIterator',
	writable: false,
	enumerable: false,
	configurable: true
});

/**
 * Export the Headers object in a form that Node.js can consume.
 *
 * @param   Headers  headers
 * @return  Object
 */
function exportNodeCompatibleHeaders(headers) {
	const obj = Object.assign({ __proto__: null }, headers[MAP]);

	// http.request() only supports string as Host header. This hack makes
	// specifying custom Host header possible.
	const hostHeaderKey = find(headers[MAP], 'Host');
	if (hostHeaderKey !== undefined) {
		obj[hostHeaderKey] = obj[hostHeaderKey][0];
	}

	return obj;
}

/**
 * Create a Headers object from an object of headers, ignoring those that do
 * not conform to HTTP grammar productions.
 *
 * @param   Object  obj  Object of headers
 * @return  Headers
 */
function createHeadersLenient(obj) {
	const headers = new Headers();
	for (const name of Object.keys(obj)) {
		if (invalidTokenRegex.test(name)) {
			continue;
		}
		if (Array.isArray(obj[name])) {
			for (const val of obj[name]) {
				if (invalidHeaderCharRegex.test(val)) {
					continue;
				}
				if (headers[MAP][name] === undefined) {
					headers[MAP][name] = [val];
				} else {
					headers[MAP][name].push(val);
				}
			}
		} else if (!invalidHeaderCharRegex.test(obj[name])) {
			headers[MAP][name] = [obj[name]];
		}
	}
	return headers;
}

const INTERNALS$1 = Symbol('Response internals');

// fix an issue where "STATUS_CODES" aren't a named export for node <10
const STATUS_CODES = http.STATUS_CODES;

/**
 * Response class
 *
 * @param   Stream  body  Readable stream
 * @param   Object  opts  Response options
 * @return  Void
 */
class Response {
	constructor() {
		let body = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
		let opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

		Body.call(this, body, opts);

		const status = opts.status || 200;
		const headers = new Headers(opts.headers);

		if (body != null && !headers.has('Content-Type')) {
			const contentType = extractContentType(body);
			if (contentType) {
				headers.append('Content-Type', contentType);
			}
		}

		this[INTERNALS$1] = {
			url: opts.url,
			status,
			statusText: opts.statusText || STATUS_CODES[status],
			headers,
			counter: opts.counter
		};
	}

	get url() {
		return this[INTERNALS$1].url || '';
	}

	get status() {
		return this[INTERNALS$1].status;
	}

	/**
  * Convenience property representing if the request ended normally
  */
	get ok() {
		return this[INTERNALS$1].status >= 200 && this[INTERNALS$1].status < 300;
	}

	get redirected() {
		return this[INTERNALS$1].counter > 0;
	}

	get statusText() {
		return this[INTERNALS$1].statusText;
	}

	get headers() {
		return this[INTERNALS$1].headers;
	}

	/**
  * Clone this response
  *
  * @return  Response
  */
	clone() {
		return new Response(clone(this), {
			url: this.url,
			status: this.status,
			statusText: this.statusText,
			headers: this.headers,
			ok: this.ok,
			redirected: this.redirected
		});
	}
}

Body.mixIn(Response.prototype);

Object.defineProperties(Response.prototype, {
	url: { enumerable: true },
	status: { enumerable: true },
	ok: { enumerable: true },
	redirected: { enumerable: true },
	statusText: { enumerable: true },
	headers: { enumerable: true },
	clone: { enumerable: true }
});

Object.defineProperty(Response.prototype, Symbol.toStringTag, {
	value: 'Response',
	writable: false,
	enumerable: false,
	configurable: true
});

const INTERNALS$2 = Symbol('Request internals');

// fix an issue where "format", "parse" aren't a named export for node <10
const parse_url = Url.parse;
const format_url = Url.format;

const streamDestructionSupported = 'destroy' in Stream.Readable.prototype;

/**
 * Check if a value is an instance of Request.
 *
 * @param   Mixed   input
 * @return  Boolean
 */
function isRequest(input) {
	return typeof input === 'object' && typeof input[INTERNALS$2] === 'object';
}

function isAbortSignal(signal) {
	const proto = signal && typeof signal === 'object' && Object.getPrototypeOf(signal);
	return !!(proto && proto.constructor.name === 'AbortSignal');
}

/**
 * Request class
 *
 * @param   Mixed   input  Url or Request instance
 * @param   Object  init   Custom options
 * @return  Void
 */
class Request {
	constructor(input) {
		let init = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

		let parsedURL;

		// normalize input
		if (!isRequest(input)) {
			if (input && input.href) {
				// in order to support Node.js' Url objects; though WHATWG's URL objects
				// will fall into this branch also (since their `toString()` will return
				// `href` property anyway)
				parsedURL = parse_url(input.href);
			} else {
				// coerce input to a string before attempting to parse
				parsedURL = parse_url(`${input}`);
			}
			input = {};
		} else {
			parsedURL = parse_url(input.url);
		}

		let method = init.method || input.method || 'GET';
		method = method.toUpperCase();

		if ((init.body != null || isRequest(input) && input.body !== null) && (method === 'GET' || method === 'HEAD')) {
			throw new TypeError('Request with GET/HEAD method cannot have body');
		}

		let inputBody = init.body != null ? init.body : isRequest(input) && input.body !== null ? clone(input) : null;

		Body.call(this, inputBody, {
			timeout: init.timeout || input.timeout || 0,
			size: init.size || input.size || 0
		});

		const headers = new Headers(init.headers || input.headers || {});

		if (inputBody != null && !headers.has('Content-Type')) {
			const contentType = extractContentType(inputBody);
			if (contentType) {
				headers.append('Content-Type', contentType);
			}
		}

		let signal = isRequest(input) ? input.signal : null;
		if ('signal' in init) signal = init.signal;

		if (signal != null && !isAbortSignal(signal)) {
			throw new TypeError('Expected signal to be an instanceof AbortSignal');
		}

		this[INTERNALS$2] = {
			method,
			redirect: init.redirect || input.redirect || 'follow',
			headers,
			parsedURL,
			signal
		};

		// node-fetch-only options
		this.follow = init.follow !== undefined ? init.follow : input.follow !== undefined ? input.follow : 20;
		this.compress = init.compress !== undefined ? init.compress : input.compress !== undefined ? input.compress : true;
		this.counter = init.counter || input.counter || 0;
		this.agent = init.agent || input.agent;
	}

	get method() {
		return this[INTERNALS$2].method;
	}

	get url() {
		return format_url(this[INTERNALS$2].parsedURL);
	}

	get headers() {
		return this[INTERNALS$2].headers;
	}

	get redirect() {
		return this[INTERNALS$2].redirect;
	}

	get signal() {
		return this[INTERNALS$2].signal;
	}

	/**
  * Clone this request
  *
  * @return  Request
  */
	clone() {
		return new Request(this);
	}
}

Body.mixIn(Request.prototype);

Object.defineProperty(Request.prototype, Symbol.toStringTag, {
	value: 'Request',
	writable: false,
	enumerable: false,
	configurable: true
});

Object.defineProperties(Request.prototype, {
	method: { enumerable: true },
	url: { enumerable: true },
	headers: { enumerable: true },
	redirect: { enumerable: true },
	clone: { enumerable: true },
	signal: { enumerable: true }
});

/**
 * Convert a Request to Node.js http request options.
 *
 * @param   Request  A Request instance
 * @return  Object   The options object to be passed to http.request
 */
function getNodeRequestOptions(request) {
	const parsedURL = request[INTERNALS$2].parsedURL;
	const headers = new Headers(request[INTERNALS$2].headers);

	// fetch step 1.3
	if (!headers.has('Accept')) {
		headers.set('Accept', '*/*');
	}

	// Basic fetch
	if (!parsedURL.protocol || !parsedURL.hostname) {
		throw new TypeError('Only absolute URLs are supported');
	}

	if (!/^https?:$/.test(parsedURL.protocol)) {
		throw new TypeError('Only HTTP(S) protocols are supported');
	}

	if (request.signal && request.body instanceof Stream.Readable && !streamDestructionSupported) {
		throw new Error('Cancellation of streamed requests with AbortSignal is not supported in node < 8');
	}

	// HTTP-network-or-cache fetch steps 2.4-2.7
	let contentLengthValue = null;
	if (request.body == null && /^(POST|PUT)$/i.test(request.method)) {
		contentLengthValue = '0';
	}
	if (request.body != null) {
		const totalBytes = getTotalBytes(request);
		if (typeof totalBytes === 'number') {
			contentLengthValue = String(totalBytes);
		}
	}
	if (contentLengthValue) {
		headers.set('Content-Length', contentLengthValue);
	}

	// HTTP-network-or-cache fetch step 2.11
	if (!headers.has('User-Agent')) {
		headers.set('User-Agent', 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)');
	}

	// HTTP-network-or-cache fetch step 2.15
	if (request.compress && !headers.has('Accept-Encoding')) {
		headers.set('Accept-Encoding', 'gzip,deflate');
	}

	let agent = request.agent;
	if (typeof agent === 'function') {
		agent = agent(parsedURL);
	}

	if (!headers.has('Connection') && !agent) {
		headers.set('Connection', 'close');
	}

	// HTTP-network fetch step 4.2
	// chunked encoding is handled by Node.js

	return Object.assign({}, parsedURL, {
		method: request.method,
		headers: exportNodeCompatibleHeaders(headers),
		agent
	});
}

/**
 * abort-error.js
 *
 * AbortError interface for cancelled requests
 */

/**
 * Create AbortError instance
 *
 * @param   String      message      Error message for human
 * @return  AbortError
 */
function AbortError(message) {
  Error.call(this, message);

  this.type = 'aborted';
  this.message = message;

  // hide custom error implementation details from end-users
  Error.captureStackTrace(this, this.constructor);
}

AbortError.prototype = Object.create(Error.prototype);
AbortError.prototype.constructor = AbortError;
AbortError.prototype.name = 'AbortError';

// fix an issue where "PassThrough", "resolve" aren't a named export for node <10
const PassThrough$1 = Stream.PassThrough;
const resolve_url = Url.resolve;

/**
 * Fetch function
 *
 * @param   Mixed    url   Absolute url or Request instance
 * @param   Object   opts  Fetch options
 * @return  Promise
 */
function fetch(url, opts) {

	// allow custom promise
	if (!fetch.Promise) {
		throw new Error('native promise missing, set fetch.Promise to your favorite alternative');
	}

	Body.Promise = fetch.Promise;

	// wrap http.request into fetch
	return new fetch.Promise(function (resolve, reject) {
		// build request object
		const request = new Request(url, opts);
		const options = getNodeRequestOptions(request);

		const send = (options.protocol === 'https:' ? https : http).request;
		const signal = request.signal;

		let response = null;

		const abort = function abort() {
			let error = new AbortError('The user aborted a request.');
			reject(error);
			if (request.body && request.body instanceof Stream.Readable) {
				request.body.destroy(error);
			}
			if (!response || !response.body) return;
			response.body.emit('error', error);
		};

		if (signal && signal.aborted) {
			abort();
			return;
		}

		const abortAndFinalize = function abortAndFinalize() {
			abort();
			finalize();
		};

		// send request
		const req = send(options);
		let reqTimeout;

		if (signal) {
			signal.addEventListener('abort', abortAndFinalize);
		}

		function finalize() {
			req.abort();
			if (signal) signal.removeEventListener('abort', abortAndFinalize);
			clearTimeout(reqTimeout);
		}

		if (request.timeout) {
			req.once('socket', function (socket) {
				reqTimeout = setTimeout(function () {
					reject(new FetchError(`network timeout at: ${request.url}`, 'request-timeout'));
					finalize();
				}, request.timeout);
			});
		}

		req.on('error', function (err) {
			reject(new FetchError(`request to ${request.url} failed, reason: ${err.message}`, 'system', err));
			finalize();
		});

		req.on('response', function (res) {
			clearTimeout(reqTimeout);

			const headers = createHeadersLenient(res.headers);

			// HTTP fetch step 5
			if (fetch.isRedirect(res.statusCode)) {
				// HTTP fetch step 5.2
				const location = headers.get('Location');

				// HTTP fetch step 5.3
				const locationURL = location === null ? null : resolve_url(request.url, location);

				// HTTP fetch step 5.5
				switch (request.redirect) {
					case 'error':
						reject(new FetchError(`uri requested responds with a redirect, redirect mode is set to error: ${request.url}`, 'no-redirect'));
						finalize();
						return;
					case 'manual':
						// node-fetch-specific step: make manual redirect a bit easier to use by setting the Location header value to the resolved URL.
						if (locationURL !== null) {
							// handle corrupted header
							try {
								headers.set('Location', locationURL);
							} catch (err) {
								// istanbul ignore next: nodejs server prevent invalid response headers, we can't test this through normal request
								reject(err);
							}
						}
						break;
					case 'follow':
						// HTTP-redirect fetch step 2
						if (locationURL === null) {
							break;
						}

						// HTTP-redirect fetch step 5
						if (request.counter >= request.follow) {
							reject(new FetchError(`maximum redirect reached at: ${request.url}`, 'max-redirect'));
							finalize();
							return;
						}

						// HTTP-redirect fetch step 6 (counter increment)
						// Create a new Request object.
						const requestOpts = {
							headers: new Headers(request.headers),
							follow: request.follow,
							counter: request.counter + 1,
							agent: request.agent,
							compress: request.compress,
							method: request.method,
							body: request.body,
							signal: request.signal,
							timeout: request.timeout,
							size: request.size
						};

						// HTTP-redirect fetch step 9
						if (res.statusCode !== 303 && request.body && getTotalBytes(request) === null) {
							reject(new FetchError('Cannot follow redirect with body being a readable stream', 'unsupported-redirect'));
							finalize();
							return;
						}

						// HTTP-redirect fetch step 11
						if (res.statusCode === 303 || (res.statusCode === 301 || res.statusCode === 302) && request.method === 'POST') {
							requestOpts.method = 'GET';
							requestOpts.body = undefined;
							requestOpts.headers.delete('content-length');
						}

						// HTTP-redirect fetch step 15
						resolve(fetch(new Request(locationURL, requestOpts)));
						finalize();
						return;
				}
			}

			// prepare response
			res.once('end', function () {
				if (signal) signal.removeEventListener('abort', abortAndFinalize);
			});
			let body = res.pipe(new PassThrough$1());

			const response_options = {
				url: request.url,
				status: res.statusCode,
				statusText: res.statusMessage,
				headers: headers,
				size: request.size,
				timeout: request.timeout,
				counter: request.counter
			};

			// HTTP-network fetch step 12.1.1.3
			const codings = headers.get('Content-Encoding');

			// HTTP-network fetch step 12.1.1.4: handle content codings

			// in following scenarios we ignore compression support
			// 1. compression support is disabled
			// 2. HEAD request
			// 3. no Content-Encoding header
			// 4. no content response (204)
			// 5. content not modified response (304)
			if (!request.compress || request.method === 'HEAD' || codings === null || res.statusCode === 204 || res.statusCode === 304) {
				response = new Response(body, response_options);
				resolve(response);
				return;
			}

			// For Node v6+
			// Be less strict when decoding compressed responses, since sometimes
			// servers send slightly invalid responses that are still accepted
			// by common browsers.
			// Always using Z_SYNC_FLUSH is what cURL does.
			const zlibOptions = {
				flush: zlib.Z_SYNC_FLUSH,
				finishFlush: zlib.Z_SYNC_FLUSH
			};

			// for gzip
			if (codings == 'gzip' || codings == 'x-gzip') {
				body = body.pipe(zlib.createGunzip(zlibOptions));
				response = new Response(body, response_options);
				resolve(response);
				return;
			}

			// for deflate
			if (codings == 'deflate' || codings == 'x-deflate') {
				// handle the infamous raw deflate response from old servers
				// a hack for old IIS and Apache servers
				const raw = res.pipe(new PassThrough$1());
				raw.once('data', function (chunk) {
					// see http://stackoverflow.com/questions/37519828
					if ((chunk[0] & 0x0F) === 0x08) {
						body = body.pipe(zlib.createInflate());
					} else {
						body = body.pipe(zlib.createInflateRaw());
					}
					response = new Response(body, response_options);
					resolve(response);
				});
				return;
			}

			// for br
			if (codings == 'br' && typeof zlib.createBrotliDecompress === 'function') {
				body = body.pipe(zlib.createBrotliDecompress());
				response = new Response(body, response_options);
				resolve(response);
				return;
			}

			// otherwise, use response as-is
			response = new Response(body, response_options);
			resolve(response);
		});

		writeToStream(req, request);
	});
}
/**
 * Redirect code matching
 *
 * @param   Number   code  Status code
 * @return  Boolean
 */
fetch.isRedirect = function (code) {
	return code === 301 || code === 302 || code === 303 || code === 307 || code === 308;
};

// expose Promise
fetch.Promise = global.Promise;

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

var intToCharMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('');

/**
 * Encode an integer in the range of 0 to 63 to a single base 64 digit.
 */
var encode = function (number) {
  if (0 <= number && number < intToCharMap.length) {
    return intToCharMap[number];
  }
  throw new TypeError("Must be between 0 and 63: " + number);
};

/**
 * Decode a single base 64 character code digit to an integer. Returns -1 on
 * failure.
 */
var decode$1 = function (charCode) {
  var bigA = 65;     // 'A'
  var bigZ = 90;     // 'Z'

  var littleA = 97;  // 'a'
  var littleZ = 122; // 'z'

  var zero = 48;     // '0'
  var nine = 57;     // '9'

  var plus = 43;     // '+'
  var slash = 47;    // '/'

  var littleOffset = 26;
  var numberOffset = 52;

  // 0 - 25: ABCDEFGHIJKLMNOPQRSTUVWXYZ
  if (bigA <= charCode && charCode <= bigZ) {
    return (charCode - bigA);
  }

  // 26 - 51: abcdefghijklmnopqrstuvwxyz
  if (littleA <= charCode && charCode <= littleZ) {
    return (charCode - littleA + littleOffset);
  }

  // 52 - 61: 0123456789
  if (zero <= charCode && charCode <= nine) {
    return (charCode - zero + numberOffset);
  }

  // 62: +
  if (charCode == plus) {
    return 62;
  }

  // 63: /
  if (charCode == slash) {
    return 63;
  }

  // Invalid base64 digit.
  return -1;
};

var base64 = {
	encode: encode,
	decode: decode$1
};

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */



// A single base 64 digit can contain 6 bits of data. For the base 64 variable
// length quantities we use in the source map spec, the first bit is the sign,
// the next four bits are the actual value, and the 6th bit is the
// continuation bit. The continuation bit tells us whether there are more
// digits in this value following this digit.
//
//   Continuation
//   |    Sign
//   |    |
//   V    V
//   101011

var VLQ_BASE_SHIFT = 5;

// binary: 100000
var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

// binary: 011111
var VLQ_BASE_MASK = VLQ_BASE - 1;

// binary: 100000
var VLQ_CONTINUATION_BIT = VLQ_BASE;

/**
 * Converts from a two-complement value to a value where the sign bit is
 * placed in the least significant bit.  For example, as decimals:
 *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
 *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
 */
function toVLQSigned(aValue) {
  return aValue < 0
    ? ((-aValue) << 1) + 1
    : (aValue << 1) + 0;
}

/**
 * Converts to a two-complement value from a value where the sign bit is
 * placed in the least significant bit.  For example, as decimals:
 *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
 *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
 */
function fromVLQSigned(aValue) {
  var isNegative = (aValue & 1) === 1;
  var shifted = aValue >> 1;
  return isNegative
    ? -shifted
    : shifted;
}

/**
 * Returns the base 64 VLQ encoded value.
 */
var encode$1 = function base64VLQ_encode(aValue) {
  var encoded = "";
  var digit;

  var vlq = toVLQSigned(aValue);

  do {
    digit = vlq & VLQ_BASE_MASK;
    vlq >>>= VLQ_BASE_SHIFT;
    if (vlq > 0) {
      // There are still more digits in this value, so we must make sure the
      // continuation bit is marked.
      digit |= VLQ_CONTINUATION_BIT;
    }
    encoded += base64.encode(digit);
  } while (vlq > 0);

  return encoded;
};

/**
 * Decodes the next base 64 VLQ value from the given string and returns the
 * value and the rest of the string via the out parameter.
 */
var decode$2 = function base64VLQ_decode(aStr, aIndex, aOutParam) {
  var strLen = aStr.length;
  var result = 0;
  var shift = 0;
  var continuation, digit;

  do {
    if (aIndex >= strLen) {
      throw new Error("Expected more digits in base 64 VLQ value.");
    }

    digit = base64.decode(aStr.charCodeAt(aIndex++));
    if (digit === -1) {
      throw new Error("Invalid base64 digit: " + aStr.charAt(aIndex - 1));
    }

    continuation = !!(digit & VLQ_CONTINUATION_BIT);
    digit &= VLQ_BASE_MASK;
    result = result + (digit << shift);
    shift += VLQ_BASE_SHIFT;
  } while (continuation);

  aOutParam.value = fromVLQSigned(result);
  aOutParam.rest = aIndex;
};

var base64Vlq = {
	encode: encode$1,
	decode: decode$2
};

function createCommonjsModule(fn, basedir, module) {
	return module = {
	  path: basedir,
	  exports: {},
	  require: function (path, base) {
      return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
    }
	}, fn(module, module.exports), module.exports;
}

function commonjsRequire () {
	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
}

var util = createCommonjsModule(function (module, exports) {
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

/**
 * This is a helper function for getting values from parameter/options
 * objects.
 *
 * @param args The object we are extracting values from
 * @param name The name of the property we are getting.
 * @param defaultValue An optional value to return if the property is missing
 * from the object. If this is not specified and the property is missing, an
 * error will be thrown.
 */
function getArg(aArgs, aName, aDefaultValue) {
  if (aName in aArgs) {
    return aArgs[aName];
  } else if (arguments.length === 3) {
    return aDefaultValue;
  } else {
    throw new Error('"' + aName + '" is a required argument.');
  }
}
exports.getArg = getArg;

var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.-]*)(?::(\d+))?(.*)$/;
var dataUrlRegexp = /^data:.+\,.+$/;

function urlParse(aUrl) {
  var match = aUrl.match(urlRegexp);
  if (!match) {
    return null;
  }
  return {
    scheme: match[1],
    auth: match[2],
    host: match[3],
    port: match[4],
    path: match[5]
  };
}
exports.urlParse = urlParse;

function urlGenerate(aParsedUrl) {
  var url = '';
  if (aParsedUrl.scheme) {
    url += aParsedUrl.scheme + ':';
  }
  url += '//';
  if (aParsedUrl.auth) {
    url += aParsedUrl.auth + '@';
  }
  if (aParsedUrl.host) {
    url += aParsedUrl.host;
  }
  if (aParsedUrl.port) {
    url += ":" + aParsedUrl.port;
  }
  if (aParsedUrl.path) {
    url += aParsedUrl.path;
  }
  return url;
}
exports.urlGenerate = urlGenerate;

/**
 * Normalizes a path, or the path portion of a URL:
 *
 * - Replaces consecutive slashes with one slash.
 * - Removes unnecessary '.' parts.
 * - Removes unnecessary '<dir>/..' parts.
 *
 * Based on code in the Node.js 'path' core module.
 *
 * @param aPath The path or url to normalize.
 */
function normalize(aPath) {
  var path = aPath;
  var url = urlParse(aPath);
  if (url) {
    if (!url.path) {
      return aPath;
    }
    path = url.path;
  }
  var isAbsolute = exports.isAbsolute(path);

  var parts = path.split(/\/+/);
  for (var part, up = 0, i = parts.length - 1; i >= 0; i--) {
    part = parts[i];
    if (part === '.') {
      parts.splice(i, 1);
    } else if (part === '..') {
      up++;
    } else if (up > 0) {
      if (part === '') {
        // The first part is blank if the path is absolute. Trying to go
        // above the root is a no-op. Therefore we can remove all '..' parts
        // directly after the root.
        parts.splice(i + 1, up);
        up = 0;
      } else {
        parts.splice(i, 2);
        up--;
      }
    }
  }
  path = parts.join('/');

  if (path === '') {
    path = isAbsolute ? '/' : '.';
  }

  if (url) {
    url.path = path;
    return urlGenerate(url);
  }
  return path;
}
exports.normalize = normalize;

/**
 * Joins two paths/URLs.
 *
 * @param aRoot The root path or URL.
 * @param aPath The path or URL to be joined with the root.
 *
 * - If aPath is a URL or a data URI, aPath is returned, unless aPath is a
 *   scheme-relative URL: Then the scheme of aRoot, if any, is prepended
 *   first.
 * - Otherwise aPath is a path. If aRoot is a URL, then its path portion
 *   is updated with the result and aRoot is returned. Otherwise the result
 *   is returned.
 *   - If aPath is absolute, the result is aPath.
 *   - Otherwise the two paths are joined with a slash.
 * - Joining for example 'http://' and 'www.example.com' is also supported.
 */
function join(aRoot, aPath) {
  if (aRoot === "") {
    aRoot = ".";
  }
  if (aPath === "") {
    aPath = ".";
  }
  var aPathUrl = urlParse(aPath);
  var aRootUrl = urlParse(aRoot);
  if (aRootUrl) {
    aRoot = aRootUrl.path || '/';
  }

  // `join(foo, '//www.example.org')`
  if (aPathUrl && !aPathUrl.scheme) {
    if (aRootUrl) {
      aPathUrl.scheme = aRootUrl.scheme;
    }
    return urlGenerate(aPathUrl);
  }

  if (aPathUrl || aPath.match(dataUrlRegexp)) {
    return aPath;
  }

  // `join('http://', 'www.example.com')`
  if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
    aRootUrl.host = aPath;
    return urlGenerate(aRootUrl);
  }

  var joined = aPath.charAt(0) === '/'
    ? aPath
    : normalize(aRoot.replace(/\/+$/, '') + '/' + aPath);

  if (aRootUrl) {
    aRootUrl.path = joined;
    return urlGenerate(aRootUrl);
  }
  return joined;
}
exports.join = join;

exports.isAbsolute = function (aPath) {
  return aPath.charAt(0) === '/' || urlRegexp.test(aPath);
};

/**
 * Make a path relative to a URL or another path.
 *
 * @param aRoot The root path or URL.
 * @param aPath The path or URL to be made relative to aRoot.
 */
function relative(aRoot, aPath) {
  if (aRoot === "") {
    aRoot = ".";
  }

  aRoot = aRoot.replace(/\/$/, '');

  // It is possible for the path to be above the root. In this case, simply
  // checking whether the root is a prefix of the path won't work. Instead, we
  // need to remove components from the root one by one, until either we find
  // a prefix that fits, or we run out of components to remove.
  var level = 0;
  while (aPath.indexOf(aRoot + '/') !== 0) {
    var index = aRoot.lastIndexOf("/");
    if (index < 0) {
      return aPath;
    }

    // If the only part of the root that is left is the scheme (i.e. http://,
    // file:///, etc.), one or more slashes (/), or simply nothing at all, we
    // have exhausted all components, so the path is not relative to the root.
    aRoot = aRoot.slice(0, index);
    if (aRoot.match(/^([^\/]+:\/)?\/*$/)) {
      return aPath;
    }

    ++level;
  }

  // Make sure we add a "../" for each component we removed from the root.
  return Array(level + 1).join("../") + aPath.substr(aRoot.length + 1);
}
exports.relative = relative;

var supportsNullProto = (function () {
  var obj = Object.create(null);
  return !('__proto__' in obj);
}());

function identity (s) {
  return s;
}

/**
 * Because behavior goes wacky when you set `__proto__` on objects, we
 * have to prefix all the strings in our set with an arbitrary character.
 *
 * See https://github.com/mozilla/source-map/pull/31 and
 * https://github.com/mozilla/source-map/issues/30
 *
 * @param String aStr
 */
function toSetString(aStr) {
  if (isProtoString(aStr)) {
    return '$' + aStr;
  }

  return aStr;
}
exports.toSetString = supportsNullProto ? identity : toSetString;

function fromSetString(aStr) {
  if (isProtoString(aStr)) {
    return aStr.slice(1);
  }

  return aStr;
}
exports.fromSetString = supportsNullProto ? identity : fromSetString;

function isProtoString(s) {
  if (!s) {
    return false;
  }

  var length = s.length;

  if (length < 9 /* "__proto__".length */) {
    return false;
  }

  if (s.charCodeAt(length - 1) !== 95  /* '_' */ ||
      s.charCodeAt(length - 2) !== 95  /* '_' */ ||
      s.charCodeAt(length - 3) !== 111 /* 'o' */ ||
      s.charCodeAt(length - 4) !== 116 /* 't' */ ||
      s.charCodeAt(length - 5) !== 111 /* 'o' */ ||
      s.charCodeAt(length - 6) !== 114 /* 'r' */ ||
      s.charCodeAt(length - 7) !== 112 /* 'p' */ ||
      s.charCodeAt(length - 8) !== 95  /* '_' */ ||
      s.charCodeAt(length - 9) !== 95  /* '_' */) {
    return false;
  }

  for (var i = length - 10; i >= 0; i--) {
    if (s.charCodeAt(i) !== 36 /* '$' */) {
      return false;
    }
  }

  return true;
}

/**
 * Comparator between two mappings where the original positions are compared.
 *
 * Optionally pass in `true` as `onlyCompareGenerated` to consider two
 * mappings with the same original source/line/column, but different generated
 * line and column the same. Useful when searching for a mapping with a
 * stubbed out mapping.
 */
function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
  var cmp = strcmp(mappingA.source, mappingB.source);
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalLine - mappingB.originalLine;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalColumn - mappingB.originalColumn;
  if (cmp !== 0 || onlyCompareOriginal) {
    return cmp;
  }

  cmp = mappingA.generatedColumn - mappingB.generatedColumn;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.generatedLine - mappingB.generatedLine;
  if (cmp !== 0) {
    return cmp;
  }

  return strcmp(mappingA.name, mappingB.name);
}
exports.compareByOriginalPositions = compareByOriginalPositions;

/**
 * Comparator between two mappings with deflated source and name indices where
 * the generated positions are compared.
 *
 * Optionally pass in `true` as `onlyCompareGenerated` to consider two
 * mappings with the same generated line and column, but different
 * source/name/original line and column the same. Useful when searching for a
 * mapping with a stubbed out mapping.
 */
function compareByGeneratedPositionsDeflated(mappingA, mappingB, onlyCompareGenerated) {
  var cmp = mappingA.generatedLine - mappingB.generatedLine;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.generatedColumn - mappingB.generatedColumn;
  if (cmp !== 0 || onlyCompareGenerated) {
    return cmp;
  }

  cmp = strcmp(mappingA.source, mappingB.source);
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalLine - mappingB.originalLine;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalColumn - mappingB.originalColumn;
  if (cmp !== 0) {
    return cmp;
  }

  return strcmp(mappingA.name, mappingB.name);
}
exports.compareByGeneratedPositionsDeflated = compareByGeneratedPositionsDeflated;

function strcmp(aStr1, aStr2) {
  if (aStr1 === aStr2) {
    return 0;
  }

  if (aStr1 === null) {
    return 1; // aStr2 !== null
  }

  if (aStr2 === null) {
    return -1; // aStr1 !== null
  }

  if (aStr1 > aStr2) {
    return 1;
  }

  return -1;
}

/**
 * Comparator between two mappings with inflated source and name strings where
 * the generated positions are compared.
 */
function compareByGeneratedPositionsInflated(mappingA, mappingB) {
  var cmp = mappingA.generatedLine - mappingB.generatedLine;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.generatedColumn - mappingB.generatedColumn;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = strcmp(mappingA.source, mappingB.source);
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalLine - mappingB.originalLine;
  if (cmp !== 0) {
    return cmp;
  }

  cmp = mappingA.originalColumn - mappingB.originalColumn;
  if (cmp !== 0) {
    return cmp;
  }

  return strcmp(mappingA.name, mappingB.name);
}
exports.compareByGeneratedPositionsInflated = compareByGeneratedPositionsInflated;

/**
 * Strip any JSON XSSI avoidance prefix from the string (as documented
 * in the source maps specification), and then parse the string as
 * JSON.
 */
function parseSourceMapInput(str) {
  return JSON.parse(str.replace(/^\)]}'[^\n]*\n/, ''));
}
exports.parseSourceMapInput = parseSourceMapInput;

/**
 * Compute the URL of a source given the the source root, the source's
 * URL, and the source map's URL.
 */
function computeSourceURL(sourceRoot, sourceURL, sourceMapURL) {
  sourceURL = sourceURL || '';

  if (sourceRoot) {
    // This follows what Chrome does.
    if (sourceRoot[sourceRoot.length - 1] !== '/' && sourceURL[0] !== '/') {
      sourceRoot += '/';
    }
    // The spec says:
    //   Line 4: An optional source root, useful for relocating source
    //   files on a server or removing repeated values in the
    //   “sources” entry.  This value is prepended to the individual
    //   entries in the “source” field.
    sourceURL = sourceRoot + sourceURL;
  }

  // Historically, SourceMapConsumer did not take the sourceMapURL as
  // a parameter.  This mode is still somewhat supported, which is why
  // this code block is conditional.  However, it's preferable to pass
  // the source map URL to SourceMapConsumer, so that this function
  // can implement the source URL resolution algorithm as outlined in
  // the spec.  This block is basically the equivalent of:
  //    new URL(sourceURL, sourceMapURL).toString()
  // ... except it avoids using URL, which wasn't available in the
  // older releases of node still supported by this library.
  //
  // The spec says:
  //   If the sources are not absolute URLs after prepending of the
  //   “sourceRoot”, the sources are resolved relative to the
  //   SourceMap (like resolving script src in a html document).
  if (sourceMapURL) {
    var parsed = urlParse(sourceMapURL);
    if (!parsed) {
      throw new Error("sourceMapURL could not be parsed");
    }
    if (parsed.path) {
      // Strip the last path component, but keep the "/".
      var index = parsed.path.lastIndexOf('/');
      if (index >= 0) {
        parsed.path = parsed.path.substring(0, index + 1);
      }
    }
    sourceURL = join(urlGenerate(parsed), sourceURL);
  }

  return normalize(sourceURL);
}
exports.computeSourceURL = computeSourceURL;
});

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */


var has = Object.prototype.hasOwnProperty;
var hasNativeMap = typeof Map !== "undefined";

/**
 * A data structure which is a combination of an array and a set. Adding a new
 * member is O(1), testing for membership is O(1), and finding the index of an
 * element is O(1). Removing elements from the set is not supported. Only
 * strings are supported for membership.
 */
function ArraySet() {
  this._array = [];
  this._set = hasNativeMap ? new Map() : Object.create(null);
}

/**
 * Static method for creating ArraySet instances from an existing array.
 */
ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
  var set = new ArraySet();
  for (var i = 0, len = aArray.length; i < len; i++) {
    set.add(aArray[i], aAllowDuplicates);
  }
  return set;
};

/**
 * Return how many unique items are in this ArraySet. If duplicates have been
 * added, than those do not count towards the size.
 *
 * @returns Number
 */
ArraySet.prototype.size = function ArraySet_size() {
  return hasNativeMap ? this._set.size : Object.getOwnPropertyNames(this._set).length;
};

/**
 * Add the given string to this set.
 *
 * @param String aStr
 */
ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
  var sStr = hasNativeMap ? aStr : util.toSetString(aStr);
  var isDuplicate = hasNativeMap ? this.has(aStr) : has.call(this._set, sStr);
  var idx = this._array.length;
  if (!isDuplicate || aAllowDuplicates) {
    this._array.push(aStr);
  }
  if (!isDuplicate) {
    if (hasNativeMap) {
      this._set.set(aStr, idx);
    } else {
      this._set[sStr] = idx;
    }
  }
};

/**
 * Is the given string a member of this set?
 *
 * @param String aStr
 */
ArraySet.prototype.has = function ArraySet_has(aStr) {
  if (hasNativeMap) {
    return this._set.has(aStr);
  } else {
    var sStr = util.toSetString(aStr);
    return has.call(this._set, sStr);
  }
};

/**
 * What is the index of the given string in the array?
 *
 * @param String aStr
 */
ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
  if (hasNativeMap) {
    var idx = this._set.get(aStr);
    if (idx >= 0) {
        return idx;
    }
  } else {
    var sStr = util.toSetString(aStr);
    if (has.call(this._set, sStr)) {
      return this._set[sStr];
    }
  }

  throw new Error('"' + aStr + '" is not in the set.');
};

/**
 * What is the element at the given index?
 *
 * @param Number aIdx
 */
ArraySet.prototype.at = function ArraySet_at(aIdx) {
  if (aIdx >= 0 && aIdx < this._array.length) {
    return this._array[aIdx];
  }
  throw new Error('No element indexed by ' + aIdx);
};

/**
 * Returns the array representation of this set (which has the proper indices
 * indicated by indexOf). Note that this is a copy of the internal array used
 * for storing the members so that no one can mess with internal state.
 */
ArraySet.prototype.toArray = function ArraySet_toArray() {
  return this._array.slice();
};

var ArraySet_1 = ArraySet;

var arraySet = {
	ArraySet: ArraySet_1
};

var binarySearch = createCommonjsModule(function (module, exports) {
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

exports.GREATEST_LOWER_BOUND = 1;
exports.LEAST_UPPER_BOUND = 2;

/**
 * Recursive implementation of binary search.
 *
 * @param aLow Indices here and lower do not contain the needle.
 * @param aHigh Indices here and higher do not contain the needle.
 * @param aNeedle The element being searched for.
 * @param aHaystack The non-empty array being searched.
 * @param aCompare Function which takes two elements and returns -1, 0, or 1.
 * @param aBias Either 'binarySearch.GREATEST_LOWER_BOUND' or
 *     'binarySearch.LEAST_UPPER_BOUND'. Specifies whether to return the
 *     closest element that is smaller than or greater than the one we are
 *     searching for, respectively, if the exact element cannot be found.
 */
function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare, aBias) {
  // This function terminates when one of the following is true:
  //
  //   1. We find the exact element we are looking for.
  //
  //   2. We did not find the exact element, but we can return the index of
  //      the next-closest element.
  //
  //   3. We did not find the exact element, and there is no next-closest
  //      element than the one we are searching for, so we return -1.
  var mid = Math.floor((aHigh - aLow) / 2) + aLow;
  var cmp = aCompare(aNeedle, aHaystack[mid], true);
  if (cmp === 0) {
    // Found the element we are looking for.
    return mid;
  }
  else if (cmp > 0) {
    // Our needle is greater than aHaystack[mid].
    if (aHigh - mid > 1) {
      // The element is in the upper half.
      return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare, aBias);
    }

    // The exact needle element was not found in this haystack. Determine if
    // we are in termination case (3) or (2) and return the appropriate thing.
    if (aBias == exports.LEAST_UPPER_BOUND) {
      return aHigh < aHaystack.length ? aHigh : -1;
    } else {
      return mid;
    }
  }
  else {
    // Our needle is less than aHaystack[mid].
    if (mid - aLow > 1) {
      // The element is in the lower half.
      return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare, aBias);
    }

    // we are in termination case (3) or (2) and return the appropriate thing.
    if (aBias == exports.LEAST_UPPER_BOUND) {
      return mid;
    } else {
      return aLow < 0 ? -1 : aLow;
    }
  }
}

/**
 * This is an implementation of binary search which will always try and return
 * the index of the closest element if there is no exact hit. This is because
 * mappings between original and generated line/col pairs are single points,
 * and there is an implicit region between each of them, so a miss just means
 * that you aren't on the very start of a region.
 *
 * @param aNeedle The element you are looking for.
 * @param aHaystack The array that is being searched.
 * @param aCompare A function which takes the needle and an element in the
 *     array and returns -1, 0, or 1 depending on whether the needle is less
 *     than, equal to, or greater than the element, respectively.
 * @param aBias Either 'binarySearch.GREATEST_LOWER_BOUND' or
 *     'binarySearch.LEAST_UPPER_BOUND'. Specifies whether to return the
 *     closest element that is smaller than or greater than the one we are
 *     searching for, respectively, if the exact element cannot be found.
 *     Defaults to 'binarySearch.GREATEST_LOWER_BOUND'.
 */
exports.search = function search(aNeedle, aHaystack, aCompare, aBias) {
  if (aHaystack.length === 0) {
    return -1;
  }

  var index = recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack,
                              aCompare, aBias || exports.GREATEST_LOWER_BOUND);
  if (index < 0) {
    return -1;
  }

  // We have found either the exact element, or the next-closest element than
  // the one we are searching for. However, there may be more than one such
  // element. Make sure we always return the smallest of these.
  while (index - 1 >= 0) {
    if (aCompare(aHaystack[index], aHaystack[index - 1], true) !== 0) {
      break;
    }
    --index;
  }

  return index;
};
});

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

// It turns out that some (most?) JavaScript engines don't self-host
// `Array.prototype.sort`. This makes sense because C++ will likely remain
// faster than JS when doing raw CPU-intensive sorting. However, when using a
// custom comparator function, calling back and forth between the VM's C++ and
// JIT'd JS is rather slow *and* loses JIT type information, resulting in
// worse generated code for the comparator function than would be optimal. In
// fact, when sorting with a comparator, these costs outweigh the benefits of
// sorting in C++. By using our own JS-implemented Quick Sort (below), we get
// a ~3500ms mean speed-up in `bench/bench.html`.

/**
 * Swap the elements indexed by `x` and `y` in the array `ary`.
 *
 * @param {Array} ary
 *        The array.
 * @param {Number} x
 *        The index of the first item.
 * @param {Number} y
 *        The index of the second item.
 */
function swap(ary, x, y) {
  var temp = ary[x];
  ary[x] = ary[y];
  ary[y] = temp;
}

/**
 * Returns a random integer within the range `low .. high` inclusive.
 *
 * @param {Number} low
 *        The lower bound on the range.
 * @param {Number} high
 *        The upper bound on the range.
 */
function randomIntInRange(low, high) {
  return Math.round(low + (Math.random() * (high - low)));
}

/**
 * The Quick Sort algorithm.
 *
 * @param {Array} ary
 *        An array to sort.
 * @param {function} comparator
 *        Function to use to compare two items.
 * @param {Number} p
 *        Start index of the array
 * @param {Number} r
 *        End index of the array
 */
function doQuickSort(ary, comparator, p, r) {
  // If our lower bound is less than our upper bound, we (1) partition the
  // array into two pieces and (2) recurse on each half. If it is not, this is
  // the empty array and our base case.

  if (p < r) {
    // (1) Partitioning.
    //
    // The partitioning chooses a pivot between `p` and `r` and moves all
    // elements that are less than or equal to the pivot to the before it, and
    // all the elements that are greater than it after it. The effect is that
    // once partition is done, the pivot is in the exact place it will be when
    // the array is put in sorted order, and it will not need to be moved
    // again. This runs in O(n) time.

    // Always choose a random pivot so that an input array which is reverse
    // sorted does not cause O(n^2) running time.
    var pivotIndex = randomIntInRange(p, r);
    var i = p - 1;

    swap(ary, pivotIndex, r);
    var pivot = ary[r];

    // Immediately after `j` is incremented in this loop, the following hold
    // true:
    //
    //   * Every element in `ary[p .. i]` is less than or equal to the pivot.
    //
    //   * Every element in `ary[i+1 .. j-1]` is greater than the pivot.
    for (var j = p; j < r; j++) {
      if (comparator(ary[j], pivot) <= 0) {
        i += 1;
        swap(ary, i, j);
      }
    }

    swap(ary, i + 1, j);
    var q = i + 1;

    // (2) Recurse on each half.

    doQuickSort(ary, comparator, p, q - 1);
    doQuickSort(ary, comparator, q + 1, r);
  }
}

/**
 * Sort the given array in-place with the given comparator function.
 *
 * @param {Array} ary
 *        An array to sort.
 * @param {function} comparator
 *        Function to use to compare two items.
 */
var quickSort_1 = function (ary, comparator) {
  doQuickSort(ary, comparator, 0, ary.length - 1);
};

var quickSort = {
	quickSort: quickSort_1
};

/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */



var ArraySet$1 = arraySet.ArraySet;

var quickSort$1 = quickSort.quickSort;

function SourceMapConsumer(aSourceMap, aSourceMapURL) {
  var sourceMap = aSourceMap;
  if (typeof aSourceMap === 'string') {
    sourceMap = util.parseSourceMapInput(aSourceMap);
  }

  return sourceMap.sections != null
    ? new IndexedSourceMapConsumer(sourceMap, aSourceMapURL)
    : new BasicSourceMapConsumer(sourceMap, aSourceMapURL);
}

SourceMapConsumer.fromSourceMap = function(aSourceMap, aSourceMapURL) {
  return BasicSourceMapConsumer.fromSourceMap(aSourceMap, aSourceMapURL);
};

/**
 * The version of the source mapping spec that we are consuming.
 */
SourceMapConsumer.prototype._version = 3;

// `__generatedMappings` and `__originalMappings` are arrays that hold the
// parsed mapping coordinates from the source map's "mappings" attribute. They
// are lazily instantiated, accessed via the `_generatedMappings` and
// `_originalMappings` getters respectively, and we only parse the mappings
// and create these arrays once queried for a source location. We jump through
// these hoops because there can be many thousands of mappings, and parsing
// them is expensive, so we only want to do it if we must.
//
// Each object in the arrays is of the form:
//
//     {
//       generatedLine: The line number in the generated code,
//       generatedColumn: The column number in the generated code,
//       source: The path to the original source file that generated this
//               chunk of code,
//       originalLine: The line number in the original source that
//                     corresponds to this chunk of generated code,
//       originalColumn: The column number in the original source that
//                       corresponds to this chunk of generated code,
//       name: The name of the original symbol which generated this chunk of
//             code.
//     }
//
// All properties except for `generatedLine` and `generatedColumn` can be
// `null`.
//
// `_generatedMappings` is ordered by the generated positions.
//
// `_originalMappings` is ordered by the original positions.

SourceMapConsumer.prototype.__generatedMappings = null;
Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
  configurable: true,
  enumerable: true,
  get: function () {
    if (!this.__generatedMappings) {
      this._parseMappings(this._mappings, this.sourceRoot);
    }

    return this.__generatedMappings;
  }
});

SourceMapConsumer.prototype.__originalMappings = null;
Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
  configurable: true,
  enumerable: true,
  get: function () {
    if (!this.__originalMappings) {
      this._parseMappings(this._mappings, this.sourceRoot);
    }

    return this.__originalMappings;
  }
});

SourceMapConsumer.prototype._charIsMappingSeparator =
  function SourceMapConsumer_charIsMappingSeparator(aStr, index) {
    var c = aStr.charAt(index);
    return c === ";" || c === ",";
  };

/**
 * Parse the mappings in a string in to a data structure which we can easily
 * query (the ordered arrays in the `this.__generatedMappings` and
 * `this.__originalMappings` properties).
 */
SourceMapConsumer.prototype._parseMappings =
  function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
    throw new Error("Subclasses must implement _parseMappings");
  };

SourceMapConsumer.GENERATED_ORDER = 1;
SourceMapConsumer.ORIGINAL_ORDER = 2;

SourceMapConsumer.GREATEST_LOWER_BOUND = 1;
SourceMapConsumer.LEAST_UPPER_BOUND = 2;

/**
 * Iterate over each mapping between an original source/line/column and a
 * generated line/column in this source map.
 *
 * @param Function aCallback
 *        The function that is called with each mapping.
 * @param Object aContext
 *        Optional. If specified, this object will be the value of `this` every
 *        time that `aCallback` is called.
 * @param aOrder
 *        Either `SourceMapConsumer.GENERATED_ORDER` or
 *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
 *        iterate over the mappings sorted by the generated file's line/column
 *        order or the original's source/line/column order, respectively. Defaults to
 *        `SourceMapConsumer.GENERATED_ORDER`.
 */
SourceMapConsumer.prototype.eachMapping =
  function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
    var context = aContext || null;
    var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

    var mappings;
    switch (order) {
    case SourceMapConsumer.GENERATED_ORDER:
      mappings = this._generatedMappings;
      break;
    case SourceMapConsumer.ORIGINAL_ORDER:
      mappings = this._originalMappings;
      break;
    default:
      throw new Error("Unknown order of iteration.");
    }

    var sourceRoot = this.sourceRoot;
    mappings.map(function (mapping) {
      var source = mapping.source === null ? null : this._sources.at(mapping.source);
      source = util.computeSourceURL(sourceRoot, source, this._sourceMapURL);
      return {
        source: source,
        generatedLine: mapping.generatedLine,
        generatedColumn: mapping.generatedColumn,
        originalLine: mapping.originalLine,
        originalColumn: mapping.originalColumn,
        name: mapping.name === null ? null : this._names.at(mapping.name)
      };
    }, this).forEach(aCallback, context);
  };

/**
 * Returns all generated line and column information for the original source,
 * line, and column provided. If no column is provided, returns all mappings
 * corresponding to a either the line we are searching for or the next
 * closest line that has any mappings. Otherwise, returns all mappings
 * corresponding to the given line and either the column we are searching for
 * or the next closest column that has any offsets.
 *
 * The only argument is an object with the following properties:
 *
 *   - source: The filename of the original source.
 *   - line: The line number in the original source.  The line number is 1-based.
 *   - column: Optional. the column number in the original source.
 *    The column number is 0-based.
 *
 * and an array of objects is returned, each with the following properties:
 *
 *   - line: The line number in the generated source, or null.  The
 *    line number is 1-based.
 *   - column: The column number in the generated source, or null.
 *    The column number is 0-based.
 */
SourceMapConsumer.prototype.allGeneratedPositionsFor =
  function SourceMapConsumer_allGeneratedPositionsFor(aArgs) {
    var line = util.getArg(aArgs, 'line');

    // When there is no exact match, BasicSourceMapConsumer.prototype._findMapping
    // returns the index of the closest mapping less than the needle. By
    // setting needle.originalColumn to 0, we thus find the last mapping for
    // the given line, provided such a mapping exists.
    var needle = {
      source: util.getArg(aArgs, 'source'),
      originalLine: line,
      originalColumn: util.getArg(aArgs, 'column', 0)
    };

    needle.source = this._findSourceIndex(needle.source);
    if (needle.source < 0) {
      return [];
    }

    var mappings = [];

    var index = this._findMapping(needle,
                                  this._originalMappings,
                                  "originalLine",
                                  "originalColumn",
                                  util.compareByOriginalPositions,
                                  binarySearch.LEAST_UPPER_BOUND);
    if (index >= 0) {
      var mapping = this._originalMappings[index];

      if (aArgs.column === undefined) {
        var originalLine = mapping.originalLine;

        // Iterate until either we run out of mappings, or we run into
        // a mapping for a different line than the one we found. Since
        // mappings are sorted, this is guaranteed to find all mappings for
        // the line we found.
        while (mapping && mapping.originalLine === originalLine) {
          mappings.push({
            line: util.getArg(mapping, 'generatedLine', null),
            column: util.getArg(mapping, 'generatedColumn', null),
            lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
          });

          mapping = this._originalMappings[++index];
        }
      } else {
        var originalColumn = mapping.originalColumn;

        // Iterate until either we run out of mappings, or we run into
        // a mapping for a different line than the one we were searching for.
        // Since mappings are sorted, this is guaranteed to find all mappings for
        // the line we are searching for.
        while (mapping &&
               mapping.originalLine === line &&
               mapping.originalColumn == originalColumn) {
          mappings.push({
            line: util.getArg(mapping, 'generatedLine', null),
            column: util.getArg(mapping, 'generatedColumn', null),
            lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
          });

          mapping = this._originalMappings[++index];
        }
      }
    }

    return mappings;
  };

var SourceMapConsumer_1 = SourceMapConsumer;

/**
 * A BasicSourceMapConsumer instance represents a parsed source map which we can
 * query for information about the original file positions by giving it a file
 * position in the generated source.
 *
 * The first parameter is the raw source map (either as a JSON string, or
 * already parsed to an object). According to the spec, source maps have the
 * following attributes:
 *
 *   - version: Which version of the source map spec this map is following.
 *   - sources: An array of URLs to the original source files.
 *   - names: An array of identifiers which can be referrenced by individual mappings.
 *   - sourceRoot: Optional. The URL root from which all sources are relative.
 *   - sourcesContent: Optional. An array of contents of the original source files.
 *   - mappings: A string of base64 VLQs which contain the actual mappings.
 *   - file: Optional. The generated file this source map is associated with.
 *
 * Here is an example source map, taken from the source map spec[0]:
 *
 *     {
 *       version : 3,
 *       file: "out.js",
 *       sourceRoot : "",
 *       sources: ["foo.js", "bar.js"],
 *       names: ["src", "maps", "are", "fun"],
 *       mappings: "AA,AB;;ABCDE;"
 *     }
 *
 * The second parameter, if given, is a string whose value is the URL
 * at which the source map was found.  This URL is used to compute the
 * sources array.
 *
 * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
 */
function BasicSourceMapConsumer(aSourceMap, aSourceMapURL) {
  var sourceMap = aSourceMap;
  if (typeof aSourceMap === 'string') {
    sourceMap = util.parseSourceMapInput(aSourceMap);
  }

  var version = util.getArg(sourceMap, 'version');
  var sources = util.getArg(sourceMap, 'sources');
  // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
  // requires the array) to play nice here.
  var names = util.getArg(sourceMap, 'names', []);
  var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
  var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
  var mappings = util.getArg(sourceMap, 'mappings');
  var file = util.getArg(sourceMap, 'file', null);

  // Once again, Sass deviates from the spec and supplies the version as a
  // string rather than a number, so we use loose equality checking here.
  if (version != this._version) {
    throw new Error('Unsupported version: ' + version);
  }

  if (sourceRoot) {
    sourceRoot = util.normalize(sourceRoot);
  }

  sources = sources
    .map(String)
    // Some source maps produce relative source paths like "./foo.js" instead of
    // "foo.js".  Normalize these first so that future comparisons will succeed.
    // See bugzil.la/1090768.
    .map(util.normalize)
    // Always ensure that absolute sources are internally stored relative to
    // the source root, if the source root is absolute. Not doing this would
    // be particularly problematic when the source root is a prefix of the
    // source (valid, but why??). See github issue #199 and bugzil.la/1188982.
    .map(function (source) {
      return sourceRoot && util.isAbsolute(sourceRoot) && util.isAbsolute(source)
        ? util.relative(sourceRoot, source)
        : source;
    });

  // Pass `true` below to allow duplicate names and sources. While source maps
  // are intended to be compressed and deduplicated, the TypeScript compiler
  // sometimes generates source maps with duplicates in them. See Github issue
  // #72 and bugzil.la/889492.
  this._names = ArraySet$1.fromArray(names.map(String), true);
  this._sources = ArraySet$1.fromArray(sources, true);

  this._absoluteSources = this._sources.toArray().map(function (s) {
    return util.computeSourceURL(sourceRoot, s, aSourceMapURL);
  });

  this.sourceRoot = sourceRoot;
  this.sourcesContent = sourcesContent;
  this._mappings = mappings;
  this._sourceMapURL = aSourceMapURL;
  this.file = file;
}

BasicSourceMapConsumer.prototype = Object.create(SourceMapConsumer.prototype);
BasicSourceMapConsumer.prototype.consumer = SourceMapConsumer;

/**
 * Utility function to find the index of a source.  Returns -1 if not
 * found.
 */
BasicSourceMapConsumer.prototype._findSourceIndex = function(aSource) {
  var relativeSource = aSource;
  if (this.sourceRoot != null) {
    relativeSource = util.relative(this.sourceRoot, relativeSource);
  }

  if (this._sources.has(relativeSource)) {
    return this._sources.indexOf(relativeSource);
  }

  // Maybe aSource is an absolute URL as returned by |sources|.  In
  // this case we can't simply undo the transform.
  var i;
  for (i = 0; i < this._absoluteSources.length; ++i) {
    if (this._absoluteSources[i] == aSource) {
      return i;
    }
  }

  return -1;
};

/**
 * Create a BasicSourceMapConsumer from a SourceMapGenerator.
 *
 * @param SourceMapGenerator aSourceMap
 *        The source map that will be consumed.
 * @param String aSourceMapURL
 *        The URL at which the source map can be found (optional)
 * @returns BasicSourceMapConsumer
 */
BasicSourceMapConsumer.fromSourceMap =
  function SourceMapConsumer_fromSourceMap(aSourceMap, aSourceMapURL) {
    var smc = Object.create(BasicSourceMapConsumer.prototype);

    var names = smc._names = ArraySet$1.fromArray(aSourceMap._names.toArray(), true);
    var sources = smc._sources = ArraySet$1.fromArray(aSourceMap._sources.toArray(), true);
    smc.sourceRoot = aSourceMap._sourceRoot;
    smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
                                                            smc.sourceRoot);
    smc.file = aSourceMap._file;
    smc._sourceMapURL = aSourceMapURL;
    smc._absoluteSources = smc._sources.toArray().map(function (s) {
      return util.computeSourceURL(smc.sourceRoot, s, aSourceMapURL);
    });

    // Because we are modifying the entries (by converting string sources and
    // names to indices into the sources and names ArraySets), we have to make
    // a copy of the entry or else bad things happen. Shared mutable state
    // strikes again! See github issue #191.

    var generatedMappings = aSourceMap._mappings.toArray().slice();
    var destGeneratedMappings = smc.__generatedMappings = [];
    var destOriginalMappings = smc.__originalMappings = [];

    for (var i = 0, length = generatedMappings.length; i < length; i++) {
      var srcMapping = generatedMappings[i];
      var destMapping = new Mapping;
      destMapping.generatedLine = srcMapping.generatedLine;
      destMapping.generatedColumn = srcMapping.generatedColumn;

      if (srcMapping.source) {
        destMapping.source = sources.indexOf(srcMapping.source);
        destMapping.originalLine = srcMapping.originalLine;
        destMapping.originalColumn = srcMapping.originalColumn;

        if (srcMapping.name) {
          destMapping.name = names.indexOf(srcMapping.name);
        }

        destOriginalMappings.push(destMapping);
      }

      destGeneratedMappings.push(destMapping);
    }

    quickSort$1(smc.__originalMappings, util.compareByOriginalPositions);

    return smc;
  };

/**
 * The version of the source mapping spec that we are consuming.
 */
BasicSourceMapConsumer.prototype._version = 3;

/**
 * The list of original sources.
 */
Object.defineProperty(BasicSourceMapConsumer.prototype, 'sources', {
  get: function () {
    return this._absoluteSources.slice();
  }
});

/**
 * Provide the JIT with a nice shape / hidden class.
 */
function Mapping() {
  this.generatedLine = 0;
  this.generatedColumn = 0;
  this.source = null;
  this.originalLine = null;
  this.originalColumn = null;
  this.name = null;
}

/**
 * Parse the mappings in a string in to a data structure which we can easily
 * query (the ordered arrays in the `this.__generatedMappings` and
 * `this.__originalMappings` properties).
 */
BasicSourceMapConsumer.prototype._parseMappings =
  function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
    var generatedLine = 1;
    var previousGeneratedColumn = 0;
    var previousOriginalLine = 0;
    var previousOriginalColumn = 0;
    var previousSource = 0;
    var previousName = 0;
    var length = aStr.length;
    var index = 0;
    var cachedSegments = {};
    var temp = {};
    var originalMappings = [];
    var generatedMappings = [];
    var mapping, str, segment, end, value;

    while (index < length) {
      if (aStr.charAt(index) === ';') {
        generatedLine++;
        index++;
        previousGeneratedColumn = 0;
      }
      else if (aStr.charAt(index) === ',') {
        index++;
      }
      else {
        mapping = new Mapping();
        mapping.generatedLine = generatedLine;

        // Because each offset is encoded relative to the previous one,
        // many segments often have the same encoding. We can exploit this
        // fact by caching the parsed variable length fields of each segment,
        // allowing us to avoid a second parse if we encounter the same
        // segment again.
        for (end = index; end < length; end++) {
          if (this._charIsMappingSeparator(aStr, end)) {
            break;
          }
        }
        str = aStr.slice(index, end);

        segment = cachedSegments[str];
        if (segment) {
          index += str.length;
        } else {
          segment = [];
          while (index < end) {
            base64Vlq.decode(aStr, index, temp);
            value = temp.value;
            index = temp.rest;
            segment.push(value);
          }

          if (segment.length === 2) {
            throw new Error('Found a source, but no line and column');
          }

          if (segment.length === 3) {
            throw new Error('Found a source and line, but no column');
          }

          cachedSegments[str] = segment;
        }

        // Generated column.
        mapping.generatedColumn = previousGeneratedColumn + segment[0];
        previousGeneratedColumn = mapping.generatedColumn;

        if (segment.length > 1) {
          // Original source.
          mapping.source = previousSource + segment[1];
          previousSource += segment[1];

          // Original line.
          mapping.originalLine = previousOriginalLine + segment[2];
          previousOriginalLine = mapping.originalLine;
          // Lines are stored 0-based
          mapping.originalLine += 1;

          // Original column.
          mapping.originalColumn = previousOriginalColumn + segment[3];
          previousOriginalColumn = mapping.originalColumn;

          if (segment.length > 4) {
            // Original name.
            mapping.name = previousName + segment[4];
            previousName += segment[4];
          }
        }

        generatedMappings.push(mapping);
        if (typeof mapping.originalLine === 'number') {
          originalMappings.push(mapping);
        }
      }
    }

    quickSort$1(generatedMappings, util.compareByGeneratedPositionsDeflated);
    this.__generatedMappings = generatedMappings;

    quickSort$1(originalMappings, util.compareByOriginalPositions);
    this.__originalMappings = originalMappings;
  };

/**
 * Find the mapping that best matches the hypothetical "needle" mapping that
 * we are searching for in the given "haystack" of mappings.
 */
BasicSourceMapConsumer.prototype._findMapping =
  function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                         aColumnName, aComparator, aBias) {
    // To return the position we are searching for, we must first find the
    // mapping for the given position and then return the opposite position it
    // points to. Because the mappings are sorted, we can use binary search to
    // find the best mapping.

    if (aNeedle[aLineName] <= 0) {
      throw new TypeError('Line must be greater than or equal to 1, got '
                          + aNeedle[aLineName]);
    }
    if (aNeedle[aColumnName] < 0) {
      throw new TypeError('Column must be greater than or equal to 0, got '
                          + aNeedle[aColumnName]);
    }

    return binarySearch.search(aNeedle, aMappings, aComparator, aBias);
  };

/**
 * Compute the last column for each generated mapping. The last column is
 * inclusive.
 */
BasicSourceMapConsumer.prototype.computeColumnSpans =
  function SourceMapConsumer_computeColumnSpans() {
    for (var index = 0; index < this._generatedMappings.length; ++index) {
      var mapping = this._generatedMappings[index];

      // Mappings do not contain a field for the last generated columnt. We
      // can come up with an optimistic estimate, however, by assuming that
      // mappings are contiguous (i.e. given two consecutive mappings, the
      // first mapping ends where the second one starts).
      if (index + 1 < this._generatedMappings.length) {
        var nextMapping = this._generatedMappings[index + 1];

        if (mapping.generatedLine === nextMapping.generatedLine) {
          mapping.lastGeneratedColumn = nextMapping.generatedColumn - 1;
          continue;
        }
      }

      // The last mapping for each line spans the entire line.
      mapping.lastGeneratedColumn = Infinity;
    }
  };

/**
 * Returns the original source, line, and column information for the generated
 * source's line and column positions provided. The only argument is an object
 * with the following properties:
 *
 *   - line: The line number in the generated source.  The line number
 *     is 1-based.
 *   - column: The column number in the generated source.  The column
 *     number is 0-based.
 *   - bias: Either 'SourceMapConsumer.GREATEST_LOWER_BOUND' or
 *     'SourceMapConsumer.LEAST_UPPER_BOUND'. Specifies whether to return the
 *     closest element that is smaller than or greater than the one we are
 *     searching for, respectively, if the exact element cannot be found.
 *     Defaults to 'SourceMapConsumer.GREATEST_LOWER_BOUND'.
 *
 * and an object is returned with the following properties:
 *
 *   - source: The original source file, or null.
 *   - line: The line number in the original source, or null.  The
 *     line number is 1-based.
 *   - column: The column number in the original source, or null.  The
 *     column number is 0-based.
 *   - name: The original identifier, or null.
 */
BasicSourceMapConsumer.prototype.originalPositionFor =
  function SourceMapConsumer_originalPositionFor(aArgs) {
    var needle = {
      generatedLine: util.getArg(aArgs, 'line'),
      generatedColumn: util.getArg(aArgs, 'column')
    };

    var index = this._findMapping(
      needle,
      this._generatedMappings,
      "generatedLine",
      "generatedColumn",
      util.compareByGeneratedPositionsDeflated,
      util.getArg(aArgs, 'bias', SourceMapConsumer.GREATEST_LOWER_BOUND)
    );

    if (index >= 0) {
      var mapping = this._generatedMappings[index];

      if (mapping.generatedLine === needle.generatedLine) {
        var source = util.getArg(mapping, 'source', null);
        if (source !== null) {
          source = this._sources.at(source);
          source = util.computeSourceURL(this.sourceRoot, source, this._sourceMapURL);
        }
        var name = util.getArg(mapping, 'name', null);
        if (name !== null) {
          name = this._names.at(name);
        }
        return {
          source: source,
          line: util.getArg(mapping, 'originalLine', null),
          column: util.getArg(mapping, 'originalColumn', null),
          name: name
        };
      }
    }

    return {
      source: null,
      line: null,
      column: null,
      name: null
    };
  };

/**
 * Return true if we have the source content for every source in the source
 * map, false otherwise.
 */
BasicSourceMapConsumer.prototype.hasContentsOfAllSources =
  function BasicSourceMapConsumer_hasContentsOfAllSources() {
    if (!this.sourcesContent) {
      return false;
    }
    return this.sourcesContent.length >= this._sources.size() &&
      !this.sourcesContent.some(function (sc) { return sc == null; });
  };

/**
 * Returns the original source content. The only argument is the url of the
 * original source file. Returns null if no original source content is
 * available.
 */
BasicSourceMapConsumer.prototype.sourceContentFor =
  function SourceMapConsumer_sourceContentFor(aSource, nullOnMissing) {
    if (!this.sourcesContent) {
      return null;
    }

    var index = this._findSourceIndex(aSource);
    if (index >= 0) {
      return this.sourcesContent[index];
    }

    var relativeSource = aSource;
    if (this.sourceRoot != null) {
      relativeSource = util.relative(this.sourceRoot, relativeSource);
    }

    var url;
    if (this.sourceRoot != null
        && (url = util.urlParse(this.sourceRoot))) {
      // XXX: file:// URIs and absolute paths lead to unexpected behavior for
      // many users. We can help them out when they expect file:// URIs to
      // behave like it would if they were running a local HTTP server. See
      // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
      var fileUriAbsPath = relativeSource.replace(/^file:\/\//, "");
      if (url.scheme == "file"
          && this._sources.has(fileUriAbsPath)) {
        return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
      }

      if ((!url.path || url.path == "/")
          && this._sources.has("/" + relativeSource)) {
        return this.sourcesContent[this._sources.indexOf("/" + relativeSource)];
      }
    }

    // This function is used recursively from
    // IndexedSourceMapConsumer.prototype.sourceContentFor. In that case, we
    // don't want to throw if we can't find the source - we just want to
    // return null, so we provide a flag to exit gracefully.
    if (nullOnMissing) {
      return null;
    }
    else {
      throw new Error('"' + relativeSource + '" is not in the SourceMap.');
    }
  };

/**
 * Returns the generated line and column information for the original source,
 * line, and column positions provided. The only argument is an object with
 * the following properties:
 *
 *   - source: The filename of the original source.
 *   - line: The line number in the original source.  The line number
 *     is 1-based.
 *   - column: The column number in the original source.  The column
 *     number is 0-based.
 *   - bias: Either 'SourceMapConsumer.GREATEST_LOWER_BOUND' or
 *     'SourceMapConsumer.LEAST_UPPER_BOUND'. Specifies whether to return the
 *     closest element that is smaller than or greater than the one we are
 *     searching for, respectively, if the exact element cannot be found.
 *     Defaults to 'SourceMapConsumer.GREATEST_LOWER_BOUND'.
 *
 * and an object is returned with the following properties:
 *
 *   - line: The line number in the generated source, or null.  The
 *     line number is 1-based.
 *   - column: The column number in the generated source, or null.
 *     The column number is 0-based.
 */
BasicSourceMapConsumer.prototype.generatedPositionFor =
  function SourceMapConsumer_generatedPositionFor(aArgs) {
    var source = util.getArg(aArgs, 'source');
    source = this._findSourceIndex(source);
    if (source < 0) {
      return {
        line: null,
        column: null,
        lastColumn: null
      };
    }

    var needle = {
      source: source,
      originalLine: util.getArg(aArgs, 'line'),
      originalColumn: util.getArg(aArgs, 'column')
    };

    var index = this._findMapping(
      needle,
      this._originalMappings,
      "originalLine",
      "originalColumn",
      util.compareByOriginalPositions,
      util.getArg(aArgs, 'bias', SourceMapConsumer.GREATEST_LOWER_BOUND)
    );

    if (index >= 0) {
      var mapping = this._originalMappings[index];

      if (mapping.source === needle.source) {
        return {
          line: util.getArg(mapping, 'generatedLine', null),
          column: util.getArg(mapping, 'generatedColumn', null),
          lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
        };
      }
    }

    return {
      line: null,
      column: null,
      lastColumn: null
    };
  };

var BasicSourceMapConsumer_1 = BasicSourceMapConsumer;

/**
 * An IndexedSourceMapConsumer instance represents a parsed source map which
 * we can query for information. It differs from BasicSourceMapConsumer in
 * that it takes "indexed" source maps (i.e. ones with a "sections" field) as
 * input.
 *
 * The first parameter is a raw source map (either as a JSON string, or already
 * parsed to an object). According to the spec for indexed source maps, they
 * have the following attributes:
 *
 *   - version: Which version of the source map spec this map is following.
 *   - file: Optional. The generated file this source map is associated with.
 *   - sections: A list of section definitions.
 *
 * Each value under the "sections" field has two fields:
 *   - offset: The offset into the original specified at which this section
 *       begins to apply, defined as an object with a "line" and "column"
 *       field.
 *   - map: A source map definition. This source map could also be indexed,
 *       but doesn't have to be.
 *
 * Instead of the "map" field, it's also possible to have a "url" field
 * specifying a URL to retrieve a source map from, but that's currently
 * unsupported.
 *
 * Here's an example source map, taken from the source map spec[0], but
 * modified to omit a section which uses the "url" field.
 *
 *  {
 *    version : 3,
 *    file: "app.js",
 *    sections: [{
 *      offset: {line:100, column:10},
 *      map: {
 *        version : 3,
 *        file: "section.js",
 *        sources: ["foo.js", "bar.js"],
 *        names: ["src", "maps", "are", "fun"],
 *        mappings: "AAAA,E;;ABCDE;"
 *      }
 *    }],
 *  }
 *
 * The second parameter, if given, is a string whose value is the URL
 * at which the source map was found.  This URL is used to compute the
 * sources array.
 *
 * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit#heading=h.535es3xeprgt
 */
function IndexedSourceMapConsumer(aSourceMap, aSourceMapURL) {
  var sourceMap = aSourceMap;
  if (typeof aSourceMap === 'string') {
    sourceMap = util.parseSourceMapInput(aSourceMap);
  }

  var version = util.getArg(sourceMap, 'version');
  var sections = util.getArg(sourceMap, 'sections');

  if (version != this._version) {
    throw new Error('Unsupported version: ' + version);
  }

  this._sources = new ArraySet$1();
  this._names = new ArraySet$1();

  var lastOffset = {
    line: -1,
    column: 0
  };
  this._sections = sections.map(function (s) {
    if (s.url) {
      // The url field will require support for asynchronicity.
      // See https://github.com/mozilla/source-map/issues/16
      throw new Error('Support for url field in sections not implemented.');
    }
    var offset = util.getArg(s, 'offset');
    var offsetLine = util.getArg(offset, 'line');
    var offsetColumn = util.getArg(offset, 'column');

    if (offsetLine < lastOffset.line ||
        (offsetLine === lastOffset.line && offsetColumn < lastOffset.column)) {
      throw new Error('Section offsets must be ordered and non-overlapping.');
    }
    lastOffset = offset;

    return {
      generatedOffset: {
        // The offset fields are 0-based, but we use 1-based indices when
        // encoding/decoding from VLQ.
        generatedLine: offsetLine + 1,
        generatedColumn: offsetColumn + 1
      },
      consumer: new SourceMapConsumer(util.getArg(s, 'map'), aSourceMapURL)
    }
  });
}

IndexedSourceMapConsumer.prototype = Object.create(SourceMapConsumer.prototype);
IndexedSourceMapConsumer.prototype.constructor = SourceMapConsumer;

/**
 * The version of the source mapping spec that we are consuming.
 */
IndexedSourceMapConsumer.prototype._version = 3;

/**
 * The list of original sources.
 */
Object.defineProperty(IndexedSourceMapConsumer.prototype, 'sources', {
  get: function () {
    var sources = [];
    for (var i = 0; i < this._sections.length; i++) {
      for (var j = 0; j < this._sections[i].consumer.sources.length; j++) {
        sources.push(this._sections[i].consumer.sources[j]);
      }
    }
    return sources;
  }
});

/**
 * Returns the original source, line, and column information for the generated
 * source's line and column positions provided. The only argument is an object
 * with the following properties:
 *
 *   - line: The line number in the generated source.  The line number
 *     is 1-based.
 *   - column: The column number in the generated source.  The column
 *     number is 0-based.
 *
 * and an object is returned with the following properties:
 *
 *   - source: The original source file, or null.
 *   - line: The line number in the original source, or null.  The
 *     line number is 1-based.
 *   - column: The column number in the original source, or null.  The
 *     column number is 0-based.
 *   - name: The original identifier, or null.
 */
IndexedSourceMapConsumer.prototype.originalPositionFor =
  function IndexedSourceMapConsumer_originalPositionFor(aArgs) {
    var needle = {
      generatedLine: util.getArg(aArgs, 'line'),
      generatedColumn: util.getArg(aArgs, 'column')
    };

    // Find the section containing the generated position we're trying to map
    // to an original position.
    var sectionIndex = binarySearch.search(needle, this._sections,
      function(needle, section) {
        var cmp = needle.generatedLine - section.generatedOffset.generatedLine;
        if (cmp) {
          return cmp;
        }

        return (needle.generatedColumn -
                section.generatedOffset.generatedColumn);
      });
    var section = this._sections[sectionIndex];

    if (!section) {
      return {
        source: null,
        line: null,
        column: null,
        name: null
      };
    }

    return section.consumer.originalPositionFor({
      line: needle.generatedLine -
        (section.generatedOffset.generatedLine - 1),
      column: needle.generatedColumn -
        (section.generatedOffset.generatedLine === needle.generatedLine
         ? section.generatedOffset.generatedColumn - 1
         : 0),
      bias: aArgs.bias
    });
  };

/**
 * Return true if we have the source content for every source in the source
 * map, false otherwise.
 */
IndexedSourceMapConsumer.prototype.hasContentsOfAllSources =
  function IndexedSourceMapConsumer_hasContentsOfAllSources() {
    return this._sections.every(function (s) {
      return s.consumer.hasContentsOfAllSources();
    });
  };

/**
 * Returns the original source content. The only argument is the url of the
 * original source file. Returns null if no original source content is
 * available.
 */
IndexedSourceMapConsumer.prototype.sourceContentFor =
  function IndexedSourceMapConsumer_sourceContentFor(aSource, nullOnMissing) {
    for (var i = 0; i < this._sections.length; i++) {
      var section = this._sections[i];

      var content = section.consumer.sourceContentFor(aSource, true);
      if (content) {
        return content;
      }
    }
    if (nullOnMissing) {
      return null;
    }
    else {
      throw new Error('"' + aSource + '" is not in the SourceMap.');
    }
  };

/**
 * Returns the generated line and column information for the original source,
 * line, and column positions provided. The only argument is an object with
 * the following properties:
 *
 *   - source: The filename of the original source.
 *   - line: The line number in the original source.  The line number
 *     is 1-based.
 *   - column: The column number in the original source.  The column
 *     number is 0-based.
 *
 * and an object is returned with the following properties:
 *
 *   - line: The line number in the generated source, or null.  The
 *     line number is 1-based. 
 *   - column: The column number in the generated source, or null.
 *     The column number is 0-based.
 */
IndexedSourceMapConsumer.prototype.generatedPositionFor =
  function IndexedSourceMapConsumer_generatedPositionFor(aArgs) {
    for (var i = 0; i < this._sections.length; i++) {
      var section = this._sections[i];

      // Only consider this section if the requested source is in the list of
      // sources of the consumer.
      if (section.consumer._findSourceIndex(util.getArg(aArgs, 'source')) === -1) {
        continue;
      }
      var generatedPosition = section.consumer.generatedPositionFor(aArgs);
      if (generatedPosition) {
        var ret = {
          line: generatedPosition.line +
            (section.generatedOffset.generatedLine - 1),
          column: generatedPosition.column +
            (section.generatedOffset.generatedLine === generatedPosition.line
             ? section.generatedOffset.generatedColumn - 1
             : 0)
        };
        return ret;
      }
    }

    return {
      line: null,
      column: null
    };
  };

/**
 * Parse the mappings in a string in to a data structure which we can easily
 * query (the ordered arrays in the `this.__generatedMappings` and
 * `this.__originalMappings` properties).
 */
IndexedSourceMapConsumer.prototype._parseMappings =
  function IndexedSourceMapConsumer_parseMappings(aStr, aSourceRoot) {
    this.__generatedMappings = [];
    this.__originalMappings = [];
    for (var i = 0; i < this._sections.length; i++) {
      var section = this._sections[i];
      var sectionMappings = section.consumer._generatedMappings;
      for (var j = 0; j < sectionMappings.length; j++) {
        var mapping = sectionMappings[j];

        var source = section.consumer._sources.at(mapping.source);
        source = util.computeSourceURL(section.consumer.sourceRoot, source, this._sourceMapURL);
        this._sources.add(source);
        source = this._sources.indexOf(source);

        var name = null;
        if (mapping.name) {
          name = section.consumer._names.at(mapping.name);
          this._names.add(name);
          name = this._names.indexOf(name);
        }

        // The mappings coming from the consumer for the section have
        // generated positions relative to the start of the section, so we
        // need to offset them to be relative to the start of the concatenated
        // generated file.
        var adjustedMapping = {
          source: source,
          generatedLine: mapping.generatedLine +
            (section.generatedOffset.generatedLine - 1),
          generatedColumn: mapping.generatedColumn +
            (section.generatedOffset.generatedLine === mapping.generatedLine
            ? section.generatedOffset.generatedColumn - 1
            : 0),
          originalLine: mapping.originalLine,
          originalColumn: mapping.originalColumn,
          name: name
        };

        this.__generatedMappings.push(adjustedMapping);
        if (typeof adjustedMapping.originalLine === 'number') {
          this.__originalMappings.push(adjustedMapping);
        }
      }
    }

    quickSort$1(this.__generatedMappings, util.compareByGeneratedPositionsDeflated);
    quickSort$1(this.__originalMappings, util.compareByOriginalPositions);
  };

var IndexedSourceMapConsumer_1 = IndexedSourceMapConsumer;

var sourceMapConsumer = {
	SourceMapConsumer: SourceMapConsumer_1,
	BasicSourceMapConsumer: BasicSourceMapConsumer_1,
	IndexedSourceMapConsumer: IndexedSourceMapConsumer_1
};

var SourceMapConsumer$1 = sourceMapConsumer.SourceMapConsumer;

function get_sourcemap_url(contents) {
    const reversed = contents
        .split('\n')
        .reverse()
        .join('\n');
    const match = /\/[/*]#[ \t]+sourceMappingURL=([^\s'"]+?)(?:[ \t]+|$)/gm.exec(reversed);
    if (match)
        return match[1];
    return undefined;
}
const file_cache = new Map();
function get_file_contents(file_path) {
    if (file_cache.has(file_path)) {
        return file_cache.get(file_path);
    }
    try {
        const data = fs.readFileSync(file_path, 'utf8');
        file_cache.set(file_path, data);
        return data;
    }
    catch (_a) {
        return undefined;
    }
}
function sourcemap_stacktrace(stack) {
    const replace = (line) => line.replace(/^ {4}at (?:(.+?)\s+\()?(?:(.+?):(\d+)(?::(\d+))?)\)?/, (input, var_name, file_path, line_num, column) => {
        if (!file_path)
            return input;
        const contents = get_file_contents(file_path);
        if (!contents)
            return input;
        const sourcemap_url = get_sourcemap_url(contents);
        if (!sourcemap_url)
            return input;
        let dir = path.dirname(file_path);
        let sourcemap_data;
        if (/^data:application\/json[^,]+base64,/.test(sourcemap_url)) {
            const raw_data = sourcemap_url.slice(sourcemap_url.indexOf(',') + 1);
            try {
                sourcemap_data = Buffer.from(raw_data, 'base64').toString();
            }
            catch (_a) {
                return input;
            }
        }
        else {
            const sourcemap_path = path.resolve(dir, sourcemap_url);
            const data = get_file_contents(sourcemap_path);
            if (!data)
                return input;
            sourcemap_data = data;
            dir = path.dirname(sourcemap_path);
        }
        let raw_sourcemap;
        try {
            raw_sourcemap = JSON.parse(sourcemap_data);
        }
        catch (_b) {
            return input;
        }
        const consumer = new SourceMapConsumer$1(raw_sourcemap);
        const pos = consumer.originalPositionFor({
            line: Number(line_num),
            column: Number(column),
            bias: SourceMapConsumer$1.LEAST_UPPER_BOUND
        });
        if (!pos.source)
            return input;
        const source_path = path.resolve(dir, pos.source);
        const source = `${source_path}:${pos.line || 0}:${pos.column || 0}`;
        if (!var_name)
            return `    at ${source}`;
        return `    at ${var_name} (${source})`;
    });
    file_cache.clear();
    return stack
        .split('\n')
        .map(replace)
        .join('\n');
}

function convertThrownError(fn, convertError) {
    try {
        const result = fn();
        if (result instanceof Promise) {
            return result.catch(e => {
                throw convertError(e);
            });
        }
        else {
            return result;
        }
    }
    catch (e) {
        throw convertError(e);
    }
}
/**
 * If the code executing in fn() tries to access `window` or `document`, throw
 * an explanatory error. Also works if fn() is async.
 */
function detectClientOnlyReferences(fn) {
    return convertThrownError(fn, e => {
        const m = e.message.match('(document|window) is not defined');
        if (m && e.name === 'ReferenceError') {
            e.message = `Server-side code is attempting to access the global variable "${m[1]}", which is client only. See https://sapper.svelte.dev/docs/#Server-side_rendering`;
        }
        return e;
    });
}

function get_page_handler(manifest, session_getter) {
    const get_build_info = (assets => () => assets)(JSON.parse(fs.readFileSync(path.join(build_dir, 'build.json'), 'utf-8')));
    const template = (str => () => str)(read_template(build_dir));
    const has_service_worker = fs.existsSync(path.join(build_dir, 'service-worker.js'));
    const { pages, error: error_route } = manifest;
    function bail(res, err) {
        console.error(err);
        const message = 'Internal server error';
        res.statusCode = 500;
        res.end(`<pre>${message}</pre>`);
    }
    function handle_error(req, res, statusCode, error) {
        handle_page({
            pattern: null,
            parts: [
                { name: null, component: { default: error_route } }
            ]
        }, req, res, statusCode, error || 'Unknown error');
    }
    function handle_page(page, req, res, status = 200, error = null) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const is_service_worker_index = req.path === '/service-worker-index.html';
            const build_info = get_build_info();
            res.setHeader('Content-Type', 'text/html');
            // preload main js and css
            // TODO detect other stuff we can preload like fonts?
            let preload_files = Array.isArray(build_info.assets.main) ? build_info.assets.main : [build_info.assets.main];
            if ((_a = build_info === null || build_info === void 0 ? void 0 : build_info.css) === null || _a === void 0 ? void 0 : _a.main) {
                preload_files = preload_files.concat((_b = build_info === null || build_info === void 0 ? void 0 : build_info.css) === null || _b === void 0 ? void 0 : _b.main);
            }
            let es6_preload = false;
            if (build_info.bundler === 'rollup') {
                es6_preload = true;
                const route = page.parts[page.parts.length - 1].file;
                const deps = build_info.dependencies[route];
                if (deps) {
                    preload_files = preload_files.concat(deps);
                }
            }
            else if (!error && !is_service_worker_index) {
                page.parts.forEach(part => {
                    if (!part)
                        return;
                    // using concat because it could be a string or an array. thanks webpack!
                    preload_files = preload_files.concat(build_info.assets[part.name]);
                });
            }
            const link = preload_files
                .filter((v, i, a) => a.indexOf(v) === i) // remove any duplicates
                .filter(file => file && !file.match(/\.map$/)) // exclude source maps
                .map((file) => {
                const as = /\.css$/.test(file) ? 'style' : 'script';
                const rel = es6_preload && as === 'script' ? 'modulepreload' : 'preload';
                return `<${req.baseUrl}/client/${file}>;rel="${rel}";as="${as}"`;
            })
                .join(', ');
            res.setHeader('Link', link);
            let session;
            try {
                session = yield session_getter(req, res);
            }
            catch (err) {
                return bail(res, err);
            }
            let redirect;
            let preload_error;
            const preload_context = {
                redirect: (statusCode, location) => {
                    if (redirect && (redirect.statusCode !== statusCode || redirect.location !== location)) {
                        throw new Error('Conflicting redirects');
                    }
                    location = location.replace(/^\//g, ''); // leading slash (only)
                    redirect = { statusCode, location };
                },
                error: (statusCode, message) => {
                    preload_error = { statusCode, message };
                },
                fetch: (url, opts) => {
                    const protocol = req.socket.encrypted ? 'https' : 'http';
                    const parsed = new Url.URL(url, `${protocol}://127.0.0.1:${process.env.PORT}${req.baseUrl ? req.baseUrl + '/' : ''}`);
                    opts = Object.assign({}, opts);
                    const include_credentials = (opts.credentials === 'include' ||
                        opts.credentials !== 'omit' && parsed.origin === `${protocol}://127.0.0.1:${process.env.PORT}`);
                    if (include_credentials) {
                        opts.headers = Object.assign({}, opts.headers);
                        const cookies = Object.assign({}, parse_1(req.headers.cookie || ''), parse_1(opts.headers.cookie || ''));
                        const set_cookie = res.getHeader('Set-Cookie');
                        (Array.isArray(set_cookie) ? set_cookie : [set_cookie]).forEach((s) => {
                            const m = /([^=]+)=([^;]+)/.exec(s);
                            if (m)
                                cookies[m[1]] = m[2];
                        });
                        const str = Object.keys(cookies)
                            .map(key => `${key}=${cookies[key]}`)
                            .join('; ');
                        opts.headers.cookie = str;
                        if (!opts.headers.authorization && req.headers.authorization) {
                            opts.headers.authorization = req.headers.authorization;
                        }
                    }
                    return fetch(parsed.href, opts);
                }
            };
            let preloaded;
            let match;
            let params;
            try {
                const root_preload = manifest.root_comp.preload || (() => { });
                const root_preloaded = detectClientOnlyReferences(() => root_preload.call(preload_context, {
                    host: req.headers.host,
                    path: req.path,
                    query: req.query,
                    params: {}
                }, session));
                match = error ? null : page.pattern.exec(req.path);
                let toPreload = [root_preloaded];
                if (!is_service_worker_index) {
                    toPreload = toPreload.concat(page.parts.map(part => {
                        if (!part)
                            return null;
                        // the deepest level is used below, to initialise the store
                        params = part.params ? part.params(match) : {};
                        return part.component.preload
                            ? detectClientOnlyReferences(() => part.component.preload.call(preload_context, {
                                host: req.headers.host,
                                path: req.path,
                                query: req.query,
                                params
                            }, session))
                            : {};
                    }));
                }
                preloaded = yield Promise.all(toPreload);
            }
            catch (err) {
                if (error) {
                    return bail(res, err);
                }
                preload_error = { statusCode: 500, message: err };
                preloaded = []; // appease TypeScript
            }
            try {
                if (redirect) {
                    const location = Url.resolve((req.baseUrl || '') + '/', redirect.location);
                    res.statusCode = redirect.statusCode;
                    res.setHeader('Location', location);
                    res.end();
                    return;
                }
                if (preload_error) {
                    if (!error) {
                        handle_error(req, res, preload_error.statusCode, preload_error.message);
                    }
                    else {
                        bail(res, preload_error.message);
                    }
                    return;
                }
                const segments = req.path.split('/').filter(Boolean);
                // TODO make this less confusing
                const layout_segments = [segments[0]];
                let l = 1;
                page.parts.forEach((part, i) => {
                    layout_segments[l] = segments[i + 1];
                    if (!part)
                        return null;
                    l++;
                });
                if (error instanceof Error && error.stack) {
                    error.stack = sourcemap_stacktrace(error.stack);
                }
                const pageContext = {
                    host: req.headers.host,
                    path: req.path,
                    query: req.query,
                    params,
                    error: error
                        ? error instanceof Error
                            ? error
                            : { message: error, name: 'PreloadError' }
                        : null
                };
                const props = {
                    stores: {
                        page: {
                            subscribe: writable(pageContext).subscribe
                        },
                        preloading: {
                            subscribe: writable(null).subscribe
                        },
                        session: writable(session)
                    },
                    segments: layout_segments,
                    status: error ? status : 200,
                    error: pageContext.error,
                    level0: {
                        props: preloaded[0]
                    },
                    level1: {
                        segment: segments[0],
                        props: {}
                    }
                };
                if (!is_service_worker_index) {
                    let level_index = 1;
                    for (let i = 0; i < page.parts.length; i += 1) {
                        const part = page.parts[i];
                        if (!part)
                            continue;
                        props[`level${level_index++}`] = {
                            component: part.component.default,
                            props: preloaded[i + 1] || {},
                            segment: segments[i]
                        };
                    }
                }
                const { html, head, css } = detectClientOnlyReferences(() => App.render(props));
                const serialized = {
                    preloaded: `[${preloaded.map(data => try_serialize(data, err => {
                        console.error(`Failed to serialize preloaded data to transmit to the client at the /${segments.join('/')} route: ${err.message}`);
                        console.warn('The client will re-render over the server-rendered page fresh instead of continuing where it left off. See https://sapper.svelte.dev/docs#Return_value for more information');
                    })).join(',')}]`,
                    session: session && try_serialize(session, err => {
                        throw new Error(`Failed to serialize session data: ${err.message}`);
                    }),
                    error: error && serialize_error(props.error)
                };
                let script = `__SAPPER__={${[
                    error && `error:${serialized.error},status:${status}`,
                    `baseUrl:"${req.baseUrl}"`,
                    serialized.preloaded && `preloaded:${serialized.preloaded}`,
                    serialized.session && `session:${serialized.session}`
                ].filter(Boolean).join(',')}};`;
                if (has_service_worker) {
                    script += `if('serviceWorker' in navigator)navigator.serviceWorker.register('${req.baseUrl}/service-worker.js');`;
                }
                const file = [].concat(build_info.assets.main).filter(f => f && /\.js$/.test(f))[0];
                const main = `${req.baseUrl}/client/${file}`;
                // users can set a CSP nonce using res.locals.nonce
                const nonce_value = (res.locals && res.locals.nonce) ? res.locals.nonce : '';
                const nonce_attr = nonce_value ? ` nonce="${nonce_value}"` : '';
                if (build_info.bundler === 'rollup') {
                    if (build_info.legacy_assets) {
                        const legacy_main = `${req.baseUrl}/client/legacy/${build_info.legacy_assets.main}`;
                        script += `(function(){try{eval("async function x(){}");var main="${main}"}catch(e){main="${legacy_main}"};var s=document.createElement("script");try{new Function("if(0)import('')")();s.src=main;s.type="module";s.crossOrigin="use-credentials";}catch(e){s.src="${req.baseUrl}/client/shimport@${build_info.shimport}.js";s.setAttribute("data-main",main);}document.head.appendChild(s);}());`;
                    }
                    else {
                        script += `var s=document.createElement("script");try{new Function("if(0)import('')")();s.src="${main}";s.type="module";s.crossOrigin="use-credentials";}catch(e){s.src="${req.baseUrl}/client/shimport@${build_info.shimport}.js";s.setAttribute("data-main","${main}")}document.head.appendChild(s)`;
                    }
                }
                else {
                    script += `</script><script${nonce_attr} src="${main}" defer>`;
                }
                let styles;
                // TODO make this consistent across apps
                // TODO embed build_info in placeholder.ts
                if (build_info.css && build_info.css.main) {
                    const css_chunks = new Set(build_info.css.main);
                    page.parts.forEach(part => {
                        if (!part || !build_info.dependencies)
                            return;
                        const deps_for_part = build_info.dependencies[part.file];
                        if (deps_for_part) {
                            deps_for_part.filter(d => d.endsWith('.css')).forEach(chunk => {
                                css_chunks.add(chunk);
                            });
                        }
                    });
                    styles = Array.from(css_chunks)
                        .map(href => `<link rel="stylesheet" href="client/${href}">`)
                        .join('');
                }
                else {
                    styles = (css && css.code ? `<style${nonce_attr}>${css.code}</style>` : '');
                }
                const body = template()
                    .replace('%sapper.base%', () => `<base href="${req.baseUrl}/">`)
                    .replace('%sapper.scripts%', () => `<script${nonce_attr}>${script}</script>`)
                    .replace('%sapper.html%', () => html)
                    .replace('%sapper.head%', () => head)
                    .replace('%sapper.styles%', () => styles)
                    .replace(/%sapper\.cspnonce%/g, () => nonce_value);
                res.statusCode = status;
                res.end(body);
            }
            catch (err) {
                if (error) {
                    bail(res, err);
                }
                else {
                    handle_error(req, res, 500, err);
                }
            }
        });
    }
    return function find_route(req, res, next) {
        const req_path = req.path === '/service-worker-index.html' ? '/' : req.path;
        const page = pages.find(p => p.pattern.test(req_path));
        if (page) {
            handle_page(page, req, res);
        }
        else {
            handle_error(req, res, 404, 'Not found');
        }
    };
}
function read_template(dir = build_dir) {
    return fs.readFileSync(`${dir}/template.html`, 'utf-8');
}
function try_serialize(data, fail) {
    try {
        return devalue(data);
    }
    catch (err) {
        if (fail)
            fail(err);
        return null;
    }
}
// Ensure we return something truthy so the client will not re-render the page over the error
function serialize_error(error) {
    if (!error)
        return null;
    let serialized = try_serialize(error);
    if (!serialized) {
        const { name, message, stack } = error;
        serialized = try_serialize({ name, message, stack });
    }
    if (!serialized) {
        serialized = '{}';
    }
    return serialized;
}

function middleware(opts = {}) {
    const { session, ignore } = opts;
    let emitted_basepath = false;
    return compose_handlers(ignore, [
        (req, res, next) => {
            if (req.baseUrl === undefined) {
                let originalUrl = req.originalUrl || req.url;
                if (req.url === '/' && originalUrl[originalUrl.length - 1] !== '/') {
                    originalUrl += '/';
                }
                req.baseUrl = originalUrl
                    ? originalUrl.slice(0, -req.url.length)
                    : '';
            }
            if (!emitted_basepath && process.send) {
                process.send({
                    __sapper__: true,
                    event: 'basepath',
                    basepath: req.baseUrl
                });
                emitted_basepath = true;
            }
            if (req.path === undefined) {
                req.path = req.url.replace(/\?.*/, '');
            }
            next();
        },
        fs.existsSync(path.join(build_dir, 'service-worker.js')) && serve({
            pathname: '/service-worker.js',
            cache_control: 'no-cache, no-store, must-revalidate'
        }),
        fs.existsSync(path.join(build_dir, 'service-worker.js.map')) && serve({
            pathname: '/service-worker.js.map',
            cache_control: 'no-cache, no-store, must-revalidate'
        }),
        serve({
            prefix: '/client/',
            cache_control: 'max-age=31536000, immutable'
        }),
        get_server_route_handler(manifest.server_routes),
        get_page_handler(manifest, session || noop)
    ].filter(Boolean));
}
function compose_handlers(ignore, handlers) {
    const total = handlers.length;
    function nth_handler(n, req, res, next) {
        if (n >= total) {
            return next();
        }
        handlers[n](req, res, () => nth_handler(n + 1, req, res, next));
    }
    return !ignore
        ? (req, res, next) => nth_handler(0, req, res, next)
        : (req, res, next) => {
            if (should_ignore(req.path, ignore)) {
                next();
            }
            else {
                nth_handler(0, req, res, next);
            }
        };
}
function should_ignore(uri, val) {
    if (Array.isArray(val))
        return val.some(x => should_ignore(uri, x));
    if (val instanceof RegExp)
        return val.test(uri);
    if (typeof val === 'function')
        return val(uri);
    return uri.startsWith(val.charCodeAt(0) === 47 ? val : `/${val}`);
}
function serve({ prefix, pathname, cache_control }) {
    const filter = pathname
        ? (req) => req.path === pathname
        : (req) => req.path.startsWith(prefix);
    const cache = new Map();
    const read = (file) => (cache.has(file) ? cache : cache.set(file, fs.readFileSync(path.join(build_dir, file)))).get(file);
    return (req, res, next) => {
        if (filter(req)) {
            const type = lite.getType(req.path);
            try {
                const file = path.posix.normalize(decodeURIComponent(req.path));
                const data = read(file);
                res.setHeader('Content-Type', type);
                res.setHeader('Cache-Control', cache_control);
                res.end(data);
            }
            catch (err) {
                if (err.code === 'ENOENT') {
                    next();
                }
                else if (err.code === 'EISDIR') {
                    res.statusCode = 404;
                    res.end('Not Found');
                }
                else {
                    console.error(err);
                    res.statusCode = 500;
                    res.end('an error occurred while reading a static file from disk');
                }
            }
        }
        else {
            next();
        }
    };
}
function noop() {
    return __awaiter(this, void 0, void 0, function* () { });
}

const { PORT, NODE_ENV } = process.env;
const dev = NODE_ENV === 'development';

polka() // You can also use Express
	.use(
		compression({ threshold: 0 }),
		sirv('static', { dev }),
		middleware()
	)
	.listen(PORT, err => {
		if (err) console.log('error', err);
	});
