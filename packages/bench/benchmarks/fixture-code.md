# Parser Implementation Guide

## Tokenizer

The tokenizer converts raw input into a stream of tokens. Each token carries a kind, span, and optional value.

```typescript
const enum TokenKind {
	EOF = 0,
	Ident = 1,
	Number = 2,
	String = 3,
	LParen = 4,
	RParen = 5,
	LBrace = 6,
	RBrace = 7,
	Comma = 8,
	Dot = 9,
	Semi = 10,
	Colon = 11,
	Arrow = 12,
	Eq = 13,
	Bang = 14,
	Plus = 15,
	Minus = 16,
	Star = 17,
	Slash = 18,
}

interface Token {
	kind: TokenKind;
	start: number;
	end: number;
	value?: string | number;
}
```

The core loop uses `charCodeAt` for zero-allocation character classification:

```typescript
function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	const len = source.length;

	while (i < len) {
		const ch = source.charCodeAt(i);

		// Skip whitespace
		if (ch === 32 || ch === 9 || ch === 10 || ch === 13) {
			i++;
			continue;
		}

		// Identifiers and keywords
		if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || ch === 95) {
			const start = i;
			while (i < len) {
				const c = source.charCodeAt(i);
				if (
					(c >= 65 && c <= 90) ||
					(c >= 97 && c <= 122) ||
					(c >= 48 && c <= 57) ||
					c === 95
				) {
					i++;
				} else break;
			}
			tokens.push({
				kind: TokenKind.Ident,
				start,
				end: i,
				value: source.slice(start, i),
			});
			continue;
		}

		// Numbers
		if (ch >= 48 && ch <= 57) {
			const start = i;
			while (
				i < len &&
				source.charCodeAt(i) >= 48 &&
				source.charCodeAt(i) <= 57
			)
				i++;
			if (i < len && source.charCodeAt(i) === 46) {
				i++;
				while (
					i < len &&
					source.charCodeAt(i) >= 48 &&
					source.charCodeAt(i) <= 57
				)
					i++;
			}
			tokens.push({
				kind: TokenKind.Number,
				start,
				end: i,
				value: Number(source.slice(start, i)),
			});
			continue;
		}

		// String literals
		if (ch === 34 || ch === 39) {
			const quote = ch;
			const start = i++;
			while (i < len && source.charCodeAt(i) !== quote) {
				if (source.charCodeAt(i) === 92) i++; // skip escape
				i++;
			}
			if (i < len) i++; // closing quote
			tokens.push({
				kind: TokenKind.String,
				start,
				end: i,
				value: source.slice(start + 1, i - 1),
			});
			continue;
		}

		// Single-char tokens
		const kind = SINGLE_CHAR_TOKENS[ch];
		if (kind !== undefined) {
			tokens.push({ kind, start: i, end: i + 1 });
			i++;
			continue;
		}

		// Arrow =>
		if (ch === 61 && i + 1 < len && source.charCodeAt(i + 1) === 62) {
			tokens.push({ kind: TokenKind.Arrow, start: i, end: i + 2 });
			i += 2;
			continue;
		}

		// Unknown
		i++;
	}

	tokens.push({ kind: TokenKind.EOF, start: i, end: i });
	return tokens;
}
```

## AST Nodes

The AST uses a discriminated union pattern:

```typescript
type Expr =
	| { type: 'literal'; value: string | number | boolean }
	| { type: 'ident'; name: string }
	| { type: 'binary'; op: string; left: Expr; right: Expr }
	| { type: 'unary'; op: string; operand: Expr }
	| { type: 'call'; callee: Expr; args: Expr[] }
	| { type: 'member'; object: Expr; property: string }
	| { type: 'lambda'; params: string[]; body: Expr };

type Stmt =
	| { type: 'let'; name: string; init: Expr }
	| { type: 'return'; value: Expr }
	| { type: 'expr'; expr: Expr }
	| { type: 'if'; cond: Expr; then: Stmt[]; else?: Stmt[] }
	| { type: 'while'; cond: Expr; body: Stmt[] }
	| { type: 'fn'; name: string; params: string[]; body: Stmt[] }
	| { type: 'block'; stmts: Stmt[] };
```

## Pratt Parser

The **Pratt parser** (top-down operator precedence) handles expressions elegantly:

```typescript
function parseExpr(
	tokens: Token[],
	pos: number,
	minBP: number
): [Expr, number] {
	let [left, nextPos] = parsePrefix(tokens, pos);

	while (nextPos < tokens.length) {
		const token = tokens[nextPos];
		const [leftBP, rightBP] = infixBindingPower(token);
		if (leftBP < minBP) break;

		const op = tokenToOp(token);
		const [right, newPos] = parseExpr(tokens, nextPos + 1, rightBP);
		left = { type: 'binary', op, left, right };
		nextPos = newPos;
	}

	return [left, nextPos];
}

function parsePrefix(tokens: Token[], pos: number): [Expr, number] {
	const token = tokens[pos];

	switch (token.kind) {
		case TokenKind.Number:
			return [{ type: 'literal', value: token.value as number }, pos + 1];

		case TokenKind.String:
			return [{ type: 'literal', value: token.value as string }, pos + 1];

		case TokenKind.Ident:
			return [{ type: 'ident', name: token.value as string }, pos + 1];

		case TokenKind.LParen: {
			const [expr, next] = parseExpr(tokens, pos + 1, 0);
			expect(tokens, next, TokenKind.RParen);
			return [expr, next + 1];
		}

		case TokenKind.Minus: {
			const [operand, next] = parseExpr(tokens, pos + 1, 90);
			return [{ type: 'unary', op: '-', operand }, next];
		}

		case TokenKind.Bang: {
			const [operand, next] = parseExpr(tokens, pos + 1, 90);
			return [{ type: 'unary', op: '!', operand }, next];
		}

		default:
			throw new Error(`Unexpected token: ${token.kind}`);
	}
}
```

The binding power table determines precedence and associativity:

|     Operator      | Left BP | Right BP | Associativity |
| :---------------: | ------: | -------: | :-----------: |
|        `=`        |      10 |        9 |     right     |
|      `\|\|`       |      20 |       21 |     left      |
|       `&&`        |      30 |       31 |     left      |
|     `==` `!=`     |      40 |       41 |     left      |
| `<` `>` `<=` `>=` |      50 |       51 |     left      |
|      `+` `-`      |      60 |       61 |     left      |
|    `*` `/` `%`    |      70 |       71 |     left      |
|       `**`        |      81 |       80 |     right     |
|   unary `-` `!`   |       , |       90 |       ,       |

## Code Generation

The code generator walks the AST and emits bytecode:

```typescript
const enum OpCode {
	LOAD_CONST = 0x01,
	LOAD_LOCAL = 0x02,
	STORE_LOCAL = 0x03,
	ADD = 0x10,
	SUB = 0x11,
	MUL = 0x12,
	DIV = 0x13,
	NEG = 0x14,
	NOT = 0x15,
	EQ = 0x20,
	LT = 0x21,
	GT = 0x22,
	JUMP = 0x30,
	JUMP_IF_FALSE = 0x31,
	CALL = 0x40,
	RETURN = 0x41,
}

function compile(stmts: Stmt[]): Uint8Array {
	const buf = new Uint8Array(4096);
	let offset = 0;
	const locals = new Map<string, number>();

	function emit(op: OpCode, ...args: number[]) {
		buf[offset++] = op;
		for (const arg of args) {
			buf[offset++] = (arg >> 8) & 0xff;
			buf[offset++] = arg & 0xff;
		}
	}

	function compileExpr(expr: Expr) {
		switch (expr.type) {
			case 'literal':
				emit(OpCode.LOAD_CONST, addConstant(expr.value));
				break;
			case 'ident':
				emit(OpCode.LOAD_LOCAL, locals.get(expr.name)!);
				break;
			case 'binary':
				compileExpr(expr.left);
				compileExpr(expr.right);
				emit(binaryOp(expr.op));
				break;
			case 'unary':
				compileExpr(expr.operand);
				emit(expr.op === '-' ? OpCode.NEG : OpCode.NOT);
				break;
			case 'call':
				for (const arg of expr.args) compileExpr(arg);
				compileExpr(expr.callee);
				emit(OpCode.CALL, expr.args.length);
				break;
		}
	}

	for (const stmt of stmts) compileStmt(stmt);
	return buf.slice(0, offset);
}
```
