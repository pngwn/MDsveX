// the parse plugins the plugin modes run
//
// plain objects against the public plugin api, so both arms run the same source
// each arm imports its own instance of this module, see load_arm, so its handlers keep type feedback of their own
// each stands for one shape of plugin work, an attr on a handled node, a wrapper inside a node with a close callback,
// a wrapper around a node and the siblings after it, a write to nodes the parser opens pending, handlers bound to a directive

function slugify(text) {
	return text
		.toLowerCase()
		.replace(/[^\w]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** plugins/autolink, repeated here as its source is typescript */
const autolink = {
	heading: {
		parse(node) {
			const link = node.wrap_inner('link');
			return () => {
				const slug = slugify(node.text_content);
				node.attrs.id = slug;
				link.attrs.href = `#${slug}`;
			};
		},
	},
};

const heading_attr = {
	heading: {
		parse(node) {
			node.attrs.id = 'h';
		},
	},
};

/** a section from each root heading to the next one of its depth or above */
const sectionize = {
	heading: {
		parse(node, ctx) {
			if (node.parent?.type !== 'root') return;
			const open = (ctx.sections ??= []);
			const depth = node.attrs.depth ?? 1;
			while (open.length > 0 && open[open.length - 1].depth >= depth) {
				open.pop().section.close();
			}
			open.push({
				depth,
				section: node.wrap_from('html', { tag: 'section' }),
			});
		},
	},
};

/** emphasis, strong and links are pending when their handler runs */
const inline_attrs = {
	emphasis: {
		parse(node) {
			node.attrs.class = 'e';
		},
	},
	strong_emphasis: {
		parse(node) {
			node.attrs.class = 's';
		},
	},
	link: {
		parse(node) {
			node.attrs.rel = 'r';
		},
	},
};

/** each heading directly inside a steps directive starts a step, the heading is its label */
const steps = {
	steps: {
		children: {
			heading(node, ctx) {
				ctx.state.step?.close();
				ctx.state.step = node.wrap_from('directive_container', {
					name: 'step',
					args: { number: String(ctx.index + 1) },
				});
				node.wrap_from('directive_label').close();
			},
		},
	},
};

// one array per mode for the whole run, a compiler session keys its plugin state on the array
const PARSE_OPTIONS = {
	'plugin-attr': { plugins: [heading_attr] },
	'plugin-autolink': { plugins: [autolink] },
	'plugin-sectionize': { plugins: [sectionize] },
	'plugin-inline': { plugins: [inline_attrs] },
	'plugin-steps': { directive_handlers: [steps] },
};

const COMPILE_PLUGINS = [autolink, sectionize];

/** modes that parse with a plugin, and one that compiles with two */
export const PLUGIN_MODES = [...Object.keys(PARSE_OPTIONS), 'compile-plugins'];

// a line of colons would end the container early, frontmatter only counts at the start of a document
const NOT_STEPS = /^:{3,}|^(?:---|\+\+\+)\r?\n/m;

/**
 * the document inside one steps container, null when it would not stay whole in there
 *
 * decoded from bytes for a sequential string, a cons string that grows old unread stays one and reads slower
 */
export function steps_source(src, directive) {
	if (directive.test(src) || NOT_STEPS.test(src)) return null;
	return Buffer.from(`:::steps[]\n\n${src.trimEnd()}\n:::\n`, 'utf8').toString(
		'utf8'
	);
}

/** the parse options of a plugin mode, with the handlers of this instance */
export function plugin_options(mode) {
	const options = PARSE_OPTIONS[mode];
	if (options === undefined) throw new Error(`unknown mode "${mode}"`);
	return options;
}

/** the compile options of compile-plugins on top of the ones a document needs anyway */
export function plugin_compile_options(options) {
	return { ...options, parse_plugins: COMPILE_PLUGINS };
}
