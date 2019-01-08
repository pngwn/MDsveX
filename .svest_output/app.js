function noop() {}

function run(fn) {
	return fn();
}

function blankObject() {
	return Object.create(null);
}

function run_all(fns) {
	fns.forEach(run);
}

function is_function(thing) {
	return typeof thing === 'function';
}

function safe_not_equal(a, b) {
	return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}

function append(target, node) {
	target.appendChild(node);
}

function insert(target, node, anchor) {
	target.insertBefore(node, anchor);
}

function detachNode(node) {
	node.parentNode.removeChild(node);
}

function createElement(name) {
	return document.createElement(name);
}

function createText(data) {
	return document.createTextNode(data);
}

function addListener(node, event, handler, options) {
	node.addEventListener(event, handler, options);
	return () => node.removeEventListener(event, handler, options);
}

function children (element) {
	return Array.from(element.childNodes);
}

function setData(text, data) {
	text.data = '' + data;
}

let update_scheduled = false;

let dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];

const intros = { enabled: false };

function schedule_update(component) {
	dirty_components.push(component);
	if (!update_scheduled) {
		update_scheduled = true;
		queue_microtask(flush);
	}
}

function add_render_callback(fn) {
	render_callbacks.push(fn);
}

function flush() {
	const seen_callbacks = new Set();

	do {
		// first, call beforeUpdate functions
		// and update components
		while (dirty_components.length) {
			update(dirty_components.shift().$$);
		}

		while (binding_callbacks.length) binding_callbacks.shift()();

		// then, once components are updated, call
		// afterUpdate functions. This may cause
		// subsequent updates...
		while (render_callbacks.length) {
			const callback = render_callbacks.pop();
			if (!seen_callbacks.has(callback)) {
				callback();

				// ...so guard against infinite loops
				seen_callbacks.add(callback);
			}
		}
	} while (dirty_components.length);

	update_scheduled = false;
}

function update($$) {
	if ($$.fragment) {
		$$.update($$.dirty);
		run_all($$.before_render);
		$$.fragment.p($$.dirty, $$.ctx);
		$$.dirty = null;

		$$.after_render.forEach(add_render_callback);
	}
}

function queue_microtask(callback) {
	Promise.resolve().then(() => {
		if (update_scheduled) callback();
	});
}

function mount_component(component, target, anchor) {
	const { fragment, on_mount, on_destroy, after_render } = component.$$;

	fragment[fragment.i ? 'i' : 'm'](target, anchor);

	// onMount happens after the initial afterUpdate. Because
	// afterUpdate callbacks happen in reverse order (inner first)
	// we schedule onMount callbacks before afterUpdate callbacks
	add_render_callback(() => {
		const new_on_destroy = on_mount.map(run).filter(is_function);
		if (on_destroy) {
			on_destroy.push(...new_on_destroy);
		} else {
			// Edge case — component was destroyed immediately,
			// most likely as a result of a binding initialising
			run_all(new_on_destroy);
		}
		component.$$.on_mount = [];
	});

	after_render.forEach(add_render_callback);
}

function destroy(component, detach) {
	if (component.$$) {
		run_all(component.$$.on_destroy);
		component.$$.fragment.d(detach);

		// TODO null out other refs, including component.$$ (but need to
		// preserve final state?)
		component.$$.on_destroy = component.$$.fragment = null;
		component.$$.ctx = {};
	}
}

function make_dirty(component, key) {
	if (!component.$$.dirty) {
		schedule_update(component);
		component.$$.dirty = {};
	}
	component.$$.dirty[key] = true;
}

function init(component, options, instance, create_fragment, not_equal$$1) {

	const $$ = component.$$ = {
		fragment: null,
		ctx: null,

		// state
		set: noop,
		update: noop,
		not_equal: not_equal$$1,
		bound: blankObject(),

		// lifecycle
		on_mount: [],
		on_destroy: [],
		before_render: [],
		after_render: [],

		// everything else
		callbacks: blankObject(),
		slotted: options.slots || {},
		dirty: null,
		binding_groups: []
	};

	let ready = false;

	$$.ctx = instance(component, options.props || {}, (key, value) => {
		if ($$.bound[key]) $$.bound[key](value);

		if ($$.ctx) {
			const changed = not_equal$$1(value, $$.ctx[key]);
			if (ready && changed) {
				make_dirty(component, key);
			}

			$$.ctx[key] = value;
			return changed;
		}
	});

	$$.update();
	ready = true;
	run_all($$.before_render);
	$$.fragment = create_fragment($$, $$.ctx);

	if (options.target) {
		intros.enabled = !!options.intro;

		if (options.hydrate) {
			$$.fragment.l(children(options.target));
		} else {
			$$.fragment.c();
		}

		mount_component(component, options.target, options.anchor);
		flush();
		intros.enabled = true;
	}
}

class SvelteComponent {
	$destroy() {
		destroy(this, true);
		this.$destroy = noop;
	}

	$on(type, callback) {
		const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
		callbacks.push(callback);

		return () => {
			const index = callbacks.indexOf(callback);
			if (index !== -1) callbacks.splice(index, 1);
		};
	}

	$set() {
		// overridden by instance, if it has props
	}
}

/* test/fixtures/domtest.html generated by Svelte v3.0.0-alpha16 */

function create_fragment($$, ctx) {
	var h1, text0, text1, button, current, dispose;

	return {
		c() {
			h1 = createElement("h1");
			text0 = createText(ctx.name);
			text1 = createText("\n");
			button = createElement("button");
			button.textContent = "Click";
			dispose = addListener(button, "click", ctx.click_handler);
		},

		m(target, anchor) {
			insert(target, h1, anchor);
			append(h1, text0);
			insert(target, text1, anchor);
			insert(target, button, anchor);
			current = true;
		},

		p(changed, ctx) {
			if (changed.name) {
				setData(text0, ctx.name);
			}
		},

		i(target, anchor) {
			if (current) return;
			this.m(target, anchor);
		},

		o: run,

		d(detach) {
			if (detach) {
				detachNode(h1);
				detachNode(text1);
				detachNode(button);
			}

			dispose();
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { name } = $$props;

	function click_handler() {
		const $$result = name = 'Jeremy';
		$$invalidate('name', name);
		return $$result;
	}

	$$self.$set = $$props => {
		if ('name' in $$props) $$invalidate('name', name = $$props.name);
	};

	return { name, click_handler };
}

class Domtest extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal);
	}

	get name() {
		return this.$$.ctx.name;
	}

	set name(name) {
		this.$set({ name });
		flush();
	}
}

export default Domtest;
//# sourceMappingURL=app.js.map
