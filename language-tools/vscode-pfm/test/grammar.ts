import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import oniguruma from 'vscode-oniguruma';
import textmate from 'vscode-textmate';

const require = createRequire(import.meta.url);
const GRAMMAR = fileURLToPath(
	new URL('../syntaxes/pfm.tmLanguage.json', import.meta.url)
);
const SCOPE = 'text.html.pfm';

export interface Token {
	text: string;
	/** innermost last, without the scope of the grammar */
	scopes: string[];
}

let wasm: Promise<void> | null = null;
const loading = new Map<boolean, Promise<textmate.IGrammar>>();

/**
 * the grammar, embedded says whether the editor has a grammar for the
 * languages of fences, a rule that includes one it lacks is dropped whole
 */
function load(embedded: boolean): Promise<textmate.IGrammar> {
	let grammar = loading.get(embedded);
	if (grammar !== undefined) return grammar;
	grammar = (async () => {
		const binary = readFileSync(
			require.resolve('vscode-oniguruma/release/onig.wasm')
		);
		await (wasm ??= oniguruma.loadWASM(
			binary.buffer.slice(
				binary.byteOffset,
				binary.byteOffset + binary.byteLength
			)
		));
		const registry = new textmate.Registry({
			onigLib: Promise.resolve({
				createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
				createOnigString: (text) => new oniguruma.OnigString(text),
			}),
			loadGrammar: async (scope) => {
				if (scope === SCOPE)
					return textmate.parseRawGrammar(
						readFileSync(GRAMMAR, 'utf8'),
						GRAMMAR
					);
				return embedded
					? { scopeName: scope, patterns: [], repository: {} }
					: null;
			},
		});
		const loaded = await registry.loadGrammar(SCOPE);
		if (loaded === null) throw new Error('the grammar did not load');
		return loaded;
	})();
	loading.set(embedded, grammar);
	return grammar;
}

/** the tokens of every line of source, in order */
export async function tokenize(
	source: string,
	embedded = true
): Promise<Token[]> {
	const grammar = await load(embedded);
	const tokens: Token[] = [];
	let stack = textmate.INITIAL;
	for (const line of source.split('\n')) {
		const result = grammar.tokenizeLine(line, stack);
		for (const token of result.tokens) {
			tokens.push({
				text: line.slice(token.startIndex, token.endIndex),
				scopes: token.scopes.filter((scope) => scope !== SCOPE),
			});
		}
		stack = result.ruleStack;
	}
	return tokens;
}

/** the scopes of the first token whose text is text, undefined when no token is */
export async function scopes_of(
	source: string,
	text: string,
	embedded = true
): Promise<string[] | undefined> {
	return (await tokenize(source, embedded)).find((token) => token.text === text)
		?.scopes;
}
