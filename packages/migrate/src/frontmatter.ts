// same rule as @mdsvex/parse, closed by the first --- line with nothing after it
const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$)/;

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

