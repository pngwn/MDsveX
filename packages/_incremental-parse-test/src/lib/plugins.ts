import type { DirectiveHandlers, ParsePlugin } from "@mdsvex/parse";

type Wrapper = { close(): void };

/** an id and a link on each heading, fused so both show while it streams in */
export function autolink(): ParsePlugin {
	return {
		heading: {
			parse(node) {
				const link = node.wrap_inner("link");
				return () => {
					const slug = node.text_content
						.toLowerCase()
						.replace(/[^\w]+/g, "-")
						.replace(/^-+|-+$/g, "");
					node.attrs.id = slug;
					link.attrs.href = `#${slug}`;
				};
			},
		},
	};
}

export function wrap_parent(): ParsePlugin {
	return {
		strong_emphasis: {
			parse(node) {
				node.type = "link";
				node.attrs.href = "HELLO";
			},
		},
	};
}

/** an html wrapper the page outlines and labels */
const made = (tag: string, name: string) => ({
	tag,
	attributes: { "data-made": name },
});

/**
 * each heading directly inside a steps directive starts a step, made of
 * elements since a preview leaves out the label of a directive
 */
export function steps(): ParsePlugin {
	return {
		heading: {
			parse(node, ctx: { steps?: Map<number, Wrapper> }) {
				const parent = node.parent;
				if (
					parent?.type !== "directive_container" ||
					parent.attrs.name !== "steps"
				)
					return;
				// ctx is new for each document, the plugin is not
				const open = (ctx.steps ??= new Map());
				open.get(parent._index)?.close();
				open.set(parent._index, node.wrap_from("html", made("section", "step")));
				node.wrap_from("html", made("header", "label")).close();
			},
		},
	};
}

/**
 * the same steps as handlers bound to the directive, they are only called
 * for a heading written directly inside it, so there is no parent check, the
 * open step lives in the state of that directive and the index numbers it
 */
export function bound_steps(): DirectiveHandlers {
	return {
		steps: {
			children: {
				heading(node, ctx) {
					ctx.state.step?.close();
					ctx.state.step = node.wrap_from(
						"html",
						made("section", "step " + (ctx.index + 1)),
					);
					node.wrap_from("html", made("header", "label")).close();
				},
			},
		},
	};
}

/** each top level heading and what follows it in a section */
export function sectionize(): ParsePlugin {
	return {
		heading: {
			parse(node, ctx: { section?: Wrapper }) {
				if (node.parent?.type !== "root") return;
				ctx.section?.close();
				ctx.section = node.wrap_from("html", made("section", "section"));
			},
		},
	};
}

/** global plugins and handlers bound to directive names */
export interface PluginSet {
	plugins?: ParsePlugin[];
	directive_handlers?: DirectiveHandlers[];
}

/** plugins by the name a snippet asks for */
export const PLUGIN_SETS: Record<string, () => PluginSet> = {
	default: () => ({ plugins: [autolink(), wrap_parent()] }),
	steps: () => ({ plugins: [steps()] }),
	"bound-steps": () => ({ directive_handlers: [bound_steps()] }),
	sectionize: () => ({ plugins: [sectionize()] }),
};
