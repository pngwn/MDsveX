import remarkParse from "remark-parse";
import { unified } from "unified";
import { mdsvex_inline_extensions } from "./svelte_expression";

// import { visit } from 'unist-util-visit'; // for AST traversal if needed

export const mdsvexFromMarkdown = {
	// When we enter a svelteExpression token, create a new AST node
	enter: {
		svelteExpression(token) {
			this.enter({ type: "svelteExpression", value: "" }, token);
		},

		// ...handlers for other tokens like else, etc.
	},
	exit: {
		svelteExpression(token) {
			// At exit, the buffer will contain the inner expression text
			const node = /** @type {Node & { value: string }} */ (
				this.stack[this.stack.length - 1]
			);
			node.value = this.sliceSerialize(token); // get the text of the expression
			this.exit(token);
		},
	},
};

export function remarkMdsvex() {
	console.log("parserExtension");
	const data = this.data(); // 'this' is the processor instance
	console.log(data);
	// Ensure arrays exist
	const ext = data.micromarkExtensions || (data.micromarkExtensions = []);
	const from =
		data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);
	// Push our extensions
	ext.push(mdsvex_inline_extensions);
	from.push(mdsvexFromMarkdown);
	console.log(ext, from);
}

const processor = unified().use(remarkParse).use(remarkMdsvex);

export function parse(content: string) {
	const result = processor.parse(content);
	return result;
}
