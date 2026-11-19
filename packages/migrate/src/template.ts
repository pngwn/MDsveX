import { position_at, type MigrationNote } from "./notes.js";

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const SCRIPT_OR_STYLE = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi;
const JS_COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

const SLOT = /<slot\b/g;
const LEGACY_PROPS = /(\{\s*\.\.\.\s*)?\$\$(props|restProps)\b/g;

/** flag the slots and legacy props a layout component needs changed to work as a template */
export function check_template(source: string): MigrationNote[] {
	const notes: MigrationNote[] = [];

	// blank out what cannot hold markup or props, keeping offsets intact
	const uncommented = source.replace(HTML_COMMENT, blank);
	const code = uncommented.replace(
		SCRIPT_OR_STYLE,
		(_, open: string, tag: string, body: string, close: string) =>
			open +
			(tag.toLowerCase() === "script" ? body.replace(JS_COMMENT, blank) : body) +
			close,
	);
	const markup = uncommented.replace(
		SCRIPT_OR_STYLE,
		(_, open: string, _tag: string, body: string, close: string) =>
			open + blank(body) + close,
	);

	for (const match of markup.matchAll(SLOT)) {
		notes.push({
			kind: "slot",
			message:
				"Templates get the document body as a `children` snippet. Replace `<slot />` with `{@render children()}` and take `children` from `$props()`.",
			...position_at(source, match.index),
		});
	}

	for (const match of code.matchAll(LEGACY_PROPS)) {
		const name = "$$" + match[2];
		notes.push({
			kind: "legacy_props",
			message: match[1]
				? `Templates get the frontmatter and the document's props from \`$props()\`. Replace \`{...${name}}\` with \`let { children, ...props } = $props()\` and \`{...props}\`.`
				: `\`${name}\` is legacy syntax. Read the frontmatter and the document's props from \`$props()\` instead.`,
			...position_at(source, match.index),
		});
	}

	return notes.sort((a, b) => a.line - b.line || a.column - b.column);
}

function blank(text: string): string {
	return text.replace(/[^\n]/g, " ");
}
