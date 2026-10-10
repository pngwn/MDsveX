import type { ParsePlugin } from "@mdsvex/parse";
import { autolink } from "@mdsvex/plugin-autolink";

type Wrapper = { close(): void };

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

/** plugins by the name a snippet asks for */
export const PLUGIN_SETS: Record<string, () => ParsePlugin[]> = {
	default: () => [autolink(), wrap_parent()],
	steps: () => [steps()],
	sectionize: () => [sectionize()],
};
