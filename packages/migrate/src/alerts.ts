import type { BlockContent, Blockquote, DefinitionContent, PhrasingContent, Text } from "mdast";

/** the five alerts of github, each a callout directive of the same name */
const KINDS = new Set(["note", "tip", "important", "warning", "caution"]);

/** a marker at the start of a block quote, a plus or minus folds it in obsidian, then a space or the line end */
const MARKER = /^\[!([A-Za-z][\w-]*)\]([+-]?)(?=[ \t\n]|$)/;

/** what a directive label can not hold, pfm leaves a link or an image in one as text */
const NOT_IN_LABEL = new Set(["link", "image", "linkReference", "imageReference", "html", "footnoteReference"]);

export type Alert =
	| {
			/** one of the five of github, written as a container directive */
			type: "alert";
			kind: string;
			/** the text after the marker on its line, empty for none */
			title: PhrasingContent[];
			/** false when the title has a link or an image, which a label would leave literal */
			title_fits: boolean;
			body: (BlockContent | DefinitionContent)[];
	  }
	| {
			/** an obsidian callout, a kind github does not have or a fold marker, left as it is */
			type: "callout";
			kind: string;
			fold: string;
			/** the marker as written */
			marker: string;
	  };

/** the alert a block quote is, undefined for a plain block quote */
export function read_alert(node: Blockquote): Alert | undefined {
	const first = node.children[0];
	if (first?.type !== "paragraph") return undefined;
	const lead = first.children[0];
	if (lead?.type !== "text") return undefined;
	const match = MARKER.exec(lead.value);
	if (match === null) return undefined;
	const kind = match[1].toLowerCase();
	const fold = match[2];
	if (!KINDS.has(kind) || fold !== "") return { type: "callout", kind, fold, marker: match[0] };

	const rest: PhrasingContent[] = [{ ...lead, value: lead.value.slice(match[0].length) }, ...first.children.slice(1)];
	const [line, after] = split_first_line(rest);
	const title = trim(line);
	const body: (BlockContent | DefinitionContent)[] = node.children.slice(1);
	const text = trim(after);
	if (text.length > 0) body.unshift({ type: "paragraph", children: text });
	return { type: "alert", kind, title, title_fits: title.every(fits), body };
}

function fits(node: PhrasingContent): boolean {
	if (NOT_IN_LABEL.has(node.type)) return false;
	return !("children" in node) || (node.children as PhrasingContent[]).every(fits);
}

/** the inline nodes of the first line, and those after it */
function split_first_line(nodes: PhrasingContent[]): [PhrasingContent[], PhrasingContent[]] {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node.type === "break") return [nodes.slice(0, i), nodes.slice(i + 1)];
		if (node.type !== "text") continue;
		const at = node.value.indexOf("\n");
		if (at === -1) continue;
		const before: Text = { type: "text", value: node.value.slice(0, at) };
		const after: Text = { type: "text", value: node.value.slice(at + 1) };
		return [
			[...nodes.slice(0, i), before],
			[after, ...nodes.slice(i + 1)],
		];
	}
	return [nodes, []];
}

/** inline nodes without the white space at either end, and without text left empty */
function trim(nodes: PhrasingContent[]): PhrasingContent[] {
	const out = nodes.slice();
	const first = out[0];
	if (first?.type === "text") out[0] = { ...first, value: first.value.replace(/^\s+/, "") };
	const last = out[out.length - 1];
	if (last?.type === "text") out[out.length - 1] = { ...last, value: last.value.replace(/\s+$/, "") };
	return out.filter((node) => node.type !== "text" || node.value !== "");
}
