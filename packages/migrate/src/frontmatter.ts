import { position_at, type MigrateResult } from "./notes.js";

// same rule as @mdsvex/parse, closed by the first --- line with nothing after it
const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$)/;

// top level keys only, yaml nests by indentation
const LAYOUT_KEY = /^(["']?)layout\1([ \t]*:)(.*)$/m;
const TEMPLATE_KEY = /^(["']?)template\1[ \t]*:/m;

// layout _ picked the 0.x fallback, which is now called default
const FALLBACK_VALUE = /^([ \t]*)(["']?)_\2(?=[ \t]*(?:#|$))/;

/** split a leading frontmatter block, fences included, from the body */
export function split_frontmatter(source: string): {
	frontmatter: string;
	body: string;
} {
	const match = FRONTMATTER.exec(source);
	if (!match) return { frontmatter: "", body: source };
	return {
		frontmatter: match[0],
		body: source.slice(match[0].length),
	};
}

/** rename the frontmatter layout key to template, leaving the body alone */
export function migrate_frontmatter(source: string): MigrateResult {
	const { frontmatter } = split_frontmatter(source);
	const layout = LAYOUT_KEY.exec(frontmatter);
	if (!layout) return { code: source, notes: [] };

	const template = TEMPLATE_KEY.exec(frontmatter);
	if (template) {
		return {
			code: source,
			notes: [
				{
					kind: "template_key",
					message:
						"`template` now chooses the document's template, so `layout` can't be renamed to it. Rename this key, then rename `layout` to `template`.",
					...position_at(source, template.index),
				},
			],
		};
	}

	const [whole, quote, colon, value] = layout;
	const renamed =
		quote + "template" + quote + colon + value.replace(FALLBACK_VALUE, "$1$2default$2");

	return {
		code:
			source.slice(0, layout.index) +
			renamed +
			source.slice(layout.index + whole.length),
		notes: [],
	};
}
