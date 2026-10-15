/**
 * the names each top level export const, let or var declares, read with a
 * small tokenizer, es-module-lexer reports only the first declarator and
 * drops destructured names it can not follow
 */

export interface ExportedDeclaration {
	/** the offset of export */
	start: number;
	/** the offset after the last declarator */
	end: number;
	names: string[];
}

export interface ScannedDeclarations {
	declarations: ExportedDeclaration[];
	/** the offset of every word the tokenizer read, to check it against the lexer */
	words: Set<number>;
}

class Unreadable extends Error {}

// what the closer of an open bracket leaves behind
const PLAIN = 0;
const CONTROL = 1;
const BLOCK = 2;
const TEMPLATE = 3;

const CONTROL_WORDS = new Set(['if', 'while', 'for', 'with']);
const BLOCK_AFTER = new Set([
	'',
	')',
	'=>',
	';',
	'{',
	'}',
	'else',
	'do',
	'try',
	'finally',
]);
// a regex can follow these, and they never end an expression
const OPERATOR_WORDS = new Set([
	'return',
	'typeof',
	'instanceof',
	'in',
	'of',
	'new',
	'delete',
	'void',
	'throw',
	'case',
	'do',
	'else',
	'yield',
	'await',
	'extends',
]);

const DECLARATION = 0;
const ELEMENT = 1;

function word_char(c: number): boolean {
	return (
		(c >= 97 && c <= 122) ||
		(c >= 65 && c <= 90) ||
		(c >= 48 && c <= 57) ||
		c === 36 ||
		c === 95 ||
		c === 35 ||
		c === 92 ||
		c > 127
	);
}

function digit(c: number): boolean {
	return c >= 48 && c <= 57;
}

/** null when the tokenizer can not read the module, the lexer alone answers then */
export function exported_declarations(js: string): ScannedDeclarations | null {
	try {
		return scan(js);
	} catch (e) {
		if (e instanceof Unreadable) return null;
		throw e;
	}
}

function scan(js: string): ScannedDeclarations {
	const n = js.length;
	const words = new Set<number>();
	const declarations: ExportedDeclaration[] = [];
	const stack: number[] = [];
	const opened: number[] = [];
	let i = 0;
	let regex_ok = true;
	let ends_value = false;
	let after_dot = false;
	let prev = '';

	const at = (k: number) => js.charCodeAt(k);
	const fail = (): never => {
		throw new Unreadable();
	};

	/** skips blanks and comments, true when a line ended */
	function trivia(): boolean {
		let line = false;
		while (i < n) {
			const c = at(i);
			if (c === 10 || c === 13 || c === 0x2028 || c === 0x2029) {
				line = true;
				i++;
			} else if (c <= 32 || c === 0xa0 || c === 0xfeff) i++;
			else if (c === 47 && at(i + 1) === 47) {
				while (i < n && at(i) !== 10 && at(i) !== 13) i++;
			} else if (c === 47 && at(i + 1) === 42) {
				const close = js.indexOf('*/', i + 2);
				if (close < 0) fail();
				const body = js.slice(i, close);
				if (body.includes('\n') || body.includes('\r')) line = true;
				i = close + 2;
			} else break;
		}
		return line;
	}

	function word(): string {
		const start = i;
		while (i < n && word_char(at(i))) i++;
		if (i === start) fail();
		words.add(start);
		return js.slice(start, i);
	}

	function number(): void {
		const start = i;
		while (i < n) {
			const c = at(i);
			if (word_char(c) || c === 46) i++;
			else if (
				(c === 43 || c === 45) &&
				(at(i - 1) === 101 || at(i - 1) === 69) &&
				!/^0[xX]/.test(js.slice(start, i))
			)
				i++;
			else break;
		}
	}

	function string(): void {
		const quote = at(i++);
		while (i < n) {
			const c = at(i);
			if (c === 92) i += 2;
			else if (c === quote) {
				i++;
				return;
			} else if (c === 10 || c === 13) fail();
			else i++;
		}
		fail();
	}

	/** from inside a template to its end or to the next substitution */
	function template(): void {
		while (i < n) {
			const c = at(i);
			if (c === 92) i += 2;
			else if (c === 96) {
				i++;
				return;
			} else if (c === 36 && at(i + 1) === 123) {
				i += 2;
				stack.push(TEMPLATE);
				opened.push(123);
				return;
			} else i++;
		}
		fail();
	}

	function regex(): void {
		i++;
		let in_class = false;
		while (i < n) {
			const c = at(i);
			if (c === 92) i += 2;
			else if (c === 10 || c === 13) fail();
			else if (c === 91) ((in_class = true), i++);
			else if (c === 93) ((in_class = false), i++);
			else if (c === 47 && !in_class) {
				i++;
				while (i < n && word_char(at(i))) i++;
				return;
			} else i++;
		}
		fail();
	}

	function value(): void {
		regex_ok = false;
		ends_value = true;
	}

	function operator(): void {
		regex_ok = true;
		ends_value = false;
	}

	/** reads one token at i, the word when it is one */
	function step(): string {
		const c = at(i);
		const dot = after_dot;
		after_dot = false;
		if (c === 96) {
			i++;
			template();
			value();
			prev = 'v';
		} else if (c === 34 || c === 39) {
			string();
			value();
			prev = 'v';
		} else if (c === 47) {
			if (regex_ok) {
				regex();
				value();
				prev = 'v';
			} else {
				i++;
				if (at(i) === 61) i++;
				operator();
				prev = '/';
			}
		} else if (digit(c) || (c === 46 && digit(at(i + 1)))) {
			number();
			value();
			prev = 'v';
		} else if (word_char(c)) {
			const w = word();
			if (!dot && OPERATOR_WORDS.has(w)) operator();
			else value();
			prev = dot ? 'v' : w;
			return w;
		} else if (c === 40 || c === 91 || c === 123) {
			stack.push(
				c === 40 && CONTROL_WORDS.has(prev)
					? CONTROL
					: c === 123 && BLOCK_AFTER.has(prev)
						? BLOCK
						: PLAIN
			);
			opened.push(c);
			i++;
			operator();
			prev = String.fromCharCode(c);
		} else if (c === 41 || c === 93 || c === 125) {
			const kind = stack.pop();
			const open = opened.pop();
			if (kind === undefined || open !== (c === 41 ? 40 : c - 2)) fail();
			i++;
			if (kind === TEMPLATE) {
				template();
				value();
				prev = 'v';
			} else if (kind === CONTROL) {
				operator();
				prev = ')';
			} else {
				value();
				if (kind === BLOCK) regex_ok = true;
				prev = String.fromCharCode(c);
			}
		} else if (c === 46) {
			const spread = at(i + 1) === 46 && at(i + 2) === 46;
			i += spread ? 3 : 1;
			after_dot = !spread;
			operator();
			prev = '.';
		} else if (c === 61 && at(i + 1) === 62) {
			i += 2;
			operator();
			prev = '=>';
		} else if ((c === 43 || c === 45) && at(i + 1) === c) {
			i += 2;
			if (!ends_value) operator();
			prev = 'v';
		} else {
			i++;
			operator();
			prev = String.fromCharCode(c);
		}
		return '';
	}

	/** true when the token at i starts a statement after a line break */
	function starts_statement(): boolean {
		const c = at(i);
		if (word_char(c) && !digit(c)) {
			let end = i;
			while (end < n && word_char(at(end))) end++;
			const w = js.slice(i, end);
			return w !== 'instanceof' && w !== 'in';
		}
		if ((c === 43 || c === 45) && at(i + 1) === c) return true;
		return (
			digit(c) ||
			c === 34 ||
			c === 39 ||
			c === 123 ||
			c === 33 ||
			c === 126 ||
			c === 64
		);
	}

	/** skips an initializer or a default, to the comma, closer or end of the statement after it */
	function expression(mode: number): void {
		const base = stack.length;
		for (;;) {
			const line = trivia();
			if (i >= n) {
				if (mode === DECLARATION && stack.length === base) return;
				fail();
			}
			const c = at(i);
			if (stack.length === base) {
				if (c === 44 || c === 59 || c === 41 || c === 93 || c === 125) return;
				if (mode === DECLARATION && line && ends_value && starts_statement())
					return;
			}
			step();
		}
	}

	function binding(names: string[]): void {
		trivia();
		const c = at(i);
		if (c === 123) object(names);
		else if (c === 91) array(names);
		else if (word_char(c) && !digit(c)) names.push(word());
		else fail();
	}

	function initializer(mode: number): void {
		trivia();
		if (at(i) === 61 && at(i + 1) !== 61 && at(i + 1) !== 62) {
			i++;
			operator();
			prev = '=';
			expression(mode);
		}
	}

	function object(names: string[]): void {
		i++;
		for (;;) {
			trivia();
			const c = at(i);
			if (c === 125) {
				i++;
				return;
			}
			if (c === 46 && at(i + 1) === 46 && at(i + 2) === 46) {
				i += 3;
				binding(names);
			} else {
				let key: string | null = null;
				if (c === 34 || c === 39) string();
				else if (c === 91) {
					step();
					expression(ELEMENT);
					if (at(i) !== 93) fail();
					step();
				} else if (digit(c)) number();
				else key = word();
				trivia();
				if (at(i) === 58) {
					i++;
					binding(names);
				} else if (key === null) fail();
				else names.push(key);
			}
			initializer(ELEMENT);
			trivia();
			if (at(i) === 44) i++;
			else if (at(i) !== 125) fail();
		}
	}

	function array(names: string[]): void {
		i++;
		for (;;) {
			trivia();
			const c = at(i);
			if (c === 93) {
				i++;
				return;
			}
			if (c === 44) {
				i++;
				continue;
			}
			if (c === 46 && at(i + 1) === 46 && at(i + 2) === 46) i += 3;
			binding(names);
			initializer(ELEMENT);
			trivia();
			if (at(i) === 44) i++;
			else if (at(i) !== 93) fail();
		}
	}

	function declaration(start: number): void {
		const names: string[] = [];
		for (;;) {
			binding(names);
			initializer(DECLARATION);
			trivia();
			if (at(i) !== 44) break;
			i++;
		}
		declarations.push({ start, end: i, names });
		operator();
		prev = ';';
	}

	if (js.startsWith('#!')) while (i < n && at(i) !== 10) i++;
	for (;;) {
		trivia();
		if (i >= n) break;
		const top = stack.length === 0;
		const start = i;
		const w = step();
		if (!top || w !== 'export') continue;
		trivia();
		const kind = /^(?:const|let|var)(?![\w$])/.exec(js.slice(i, i + 6));
		if (kind === null) continue;
		word();
		declaration(start);
	}
	if (stack.length !== 0) fail();
	return { declarations, words };
}
