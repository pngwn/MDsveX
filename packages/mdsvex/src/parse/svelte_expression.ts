import type { Effects, Construct, Code } from "micromark-util-types";

const OPEN_BRACE = 123; // '{'
const CLOSE_BRACE = 125; // '}'

// Inline micromark extension for Svelte expressions in text
const svelteExpression: Construct = {
	name: "svelteExpression", // for debugging/turning off
	tokenize: (effects, ok, nok) => {
		let braceDepth = 0;
		return start;

		function start(code: Code) {
			console.log("start", code);
			if (code !== OPEN_BRACE) return nok(code);
			// Start a new 'svelteExpression' token
			effects.enter("svelteExpression");
			effects.enter("svelteExpressionMarker");
			effects.consume(code); // consume '{'
			effects.exit("svelteExpressionMarker");
			braceDepth = 1;
			return inside;
		}

		function inside(code: Code) {
			console.log("inside", code, String.fromCharCode(code));
			if (code === null) {
				// EOF before closing '}', error
				return nok(code);
			}
			if (code === OPEN_BRACE) {
				// Nested '{'
				braceDepth++;
				effects.consume(code);
				return inside;
			}
			if (code === CLOSE_BRACE) {
				braceDepth--;
				effects.consume(code);
				if (braceDepth === 0) {
					console.log("exit");
					// Found the matching closing brace
					effects.exit("svelteExpression");
					return ok; // successfully end the token
				}

				return inside;
			}

			// Any other character: consume as part of the expression
			effects.consume(code);
			return inside;
		}
	},
};

// Attach the extension to the micromark parser for text
export const mdsvex_inline_extensions = {
	text: {
		[OPEN_BRACE]: svelteExpression,
	},
};
