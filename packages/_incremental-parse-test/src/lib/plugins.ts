import type { ParsePlugin } from "@mdsvex/parse";
import { autolink } from "@mdsvex/plugin-autolink";

type Wrapper = { close(): void };

export function wrap_parent(): ParsePlugin {
	return {
		strong_emphasis: {
			parse(node) {
				node.type = "link";
				node.attrs.href = "HELLO";
				// node.parent.attrs.style = "background: red;";
			},
		},
	};
}

/** an html wrapper the page outlines and labels, see [data-made] in app.css */
const made = (tag: string, name: string) => ({
	tag,
	attributes: { "data-made": name },
});

/**
 * each heading directly inside `:::steps[]` starts a step that takes what
 * follows it, with the heading in a label of its own
 *
 * the kit plugin makes `step` directives with a `directive_label`. a preview
 * has no components, it renders a directive as its children and leaves the
 * label out, so this one makes elements of the same shape
 */
export function steps(): ParsePlugin {
	const open = new Map<number, Wrapper>();
	return {
		heading: {
			parse(node) {
				const parent = node.parent;
				if (
					parent?.type !== "directive_container" ||
					parent.attrs.name !== "steps"
				)
					return;
				open.get(parent._index)?.close();
				open.set(parent._index, node.wrap_from("html", made("section", "step")));
				node.wrap_from("html", made("header", "label")).close();
			},
		},
	};
}

/** each top level heading and what follows it in a section */
export function sectionize(): ParsePlugin {
	let open: Wrapper | null = null;
	return {
		heading: {
			parse(node) {
				if (node.parent?.type !== "root") return;
				open?.close();
				open = node.wrap_from("html", made("section", "section"));
			},
		},
	};
}

/**
 * plugins by the name a snippet asks for, made new for every parse since a
 * plugin keeps the wrapper it has open
 */
export const PLUGIN_SETS: Record<string, () => ParsePlugin[]> = {
	default: () => [autolink(), wrap_parent()],
	steps: () => [steps()],
	sectionize: () => [sectionize()],
};
