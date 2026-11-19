import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import oniguruma from 'vscode-oniguruma';
import textmate from 'vscode-textmate';

const require = createRequire(import.meta.url);
const DEFAULT_GRAMMAR = fileURLToPath(
	new URL('../syntaxes/pfm.tmLanguage.json', import.meta.url)
);
let GRAMMAR = DEFAULT_GRAMMAR;

/** read another grammar file, for comparing against an older build */
export function use_grammar(path = DEFAULT_GRAMMAR): void {
	GRAMMAR = path;
}
const SCOPE = 'text.html.pfm';

export interface Token {
	text: string;
	/** innermost last, without the scope of the grammar */
	scopes: string[];
	/** offsets in the source */
	start: number;
	end: number;
}

let wasm: Promise<void> | null = null;
const loading = new Map<string, Promise<textmate.IGrammar>>();

/**
 * the grammar, embedded says whether the editor has a grammar for the
 * languages of fences, a rule that includes one it lacks is dropped whole
 */
function load(embedded: boolean): Promise<textmate.IGrammar> {
	const path = GRAMMAR;
	const key = `${embedded} ${path}`;
	let grammar = loading.get(key);
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
					return textmate.parseRawGrammar(readFileSync(path, 'utf8'), path);
				return embedded
					? { scopeName: scope, patterns: [], repository: {} }
					: null;
			},
		});
		const loaded = await registry.loadGrammar(SCOPE);
		if (loaded === null) throw new Error('the grammar did not load');
		return loaded;
	})();
	loading.set(key, grammar);
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
	let offset = 0;
	for (const line of source.split('\n')) {
		const result = grammar.tokenizeLine(line, stack);
		for (const token of result.tokens) {
			tokens.push({
				text: line.slice(token.startIndex, token.endIndex),
				scopes: token.scopes.filter((scope) => scope !== SCOPE),
				start: offset + token.startIndex,
				end: offset + Math.min(token.endIndex, line.length),
			});
		}
		stack = result.ruleStack;
		offset += line.length + 1;
	}
	return tokens;
}

/** the depth of the rule stack after each line, and how long the lines took */
export async function depths(
	source: string
): Promise<{ depths: number[]; ms: number }> {
	const grammar = await load(true);
	const out: number[] = [];
	let stack = textmate.INITIAL;
	const t = performance.now();
	for (const line of source.split('\n')) {
		stack = grammar.tokenizeLine(line, stack).ruleStack;
		out.push((stack as unknown as { depth: number }).depth);
	}
	return { depths: out, ms: performance.now() - t };
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
