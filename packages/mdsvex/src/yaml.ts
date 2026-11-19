/**
 * the yaml subset frontmatter needs, plain js so compile runs in a browser
 *
 * plain scalars resolve as in the yaml 1.2 core schema, so dates stay strings,
 * anything else throws a YamlError naming its line
 */

export class YamlError extends Error {
	/** why the text was rejected, without the position */
	reason: string;
	/** 1 based line in the yaml text */
	line: number;
	/** 1 based column */
	column: number;

	constructor(reason: string, line: number, column: number) {
		super(`${reason} (line ${line}, column ${column})`);
		this.name = 'YamlError';
		this.reason = reason;
		this.line = line;
		this.column = column;
	}
}

/** empty text gives an empty object */
export function parse_yaml(text: string): Record<string, unknown> {
	return new YamlParser(text).document();
}

const TAB = 9;
const LF = 10;
const SPACE = 32;
const BANG = 33;
const DQUOTE = 34;
const HASH = 35;
const PERCENT = 37;
const AMP = 38;
const SQUOTE = 39;
const STAR = 42;
const PLUS = 43;
const COMMA = 44;
const DASH = 45;
const COLON = 58;
const GT = 62;
const QUESTION = 63;
const AT = 64;
const LBRACKET = 91;
const BACKSLASH = 92;
const RBRACKET = 93;
const BACKTICK = 96;
const LBRACE = 123;
const PIPE = 124;
const RBRACE = 125;

function is_ws(c: number): boolean {
	return c === SPACE || c === TAB;
}

/** true when c ends a token, nan past the end counts */
function is_break(c: number): boolean {
	return c === SPACE || c === TAB || c === LF || c !== c;
}

const has_own = Object.prototype.hasOwnProperty;

function set_key(obj: Record<string, unknown>, key: string, value: unknown) {
	// a plain store would set the prototype
	if (key === '__proto__') {
		Object.defineProperty(obj, key, {
			value,
			enumerable: true,
			writable: true,
			configurable: true,
		});
	} else obj[key] = value;
}

const INT = /^[-+]?[0-9]+$/;
const FLOAT = /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/;
const OCT = /^0o[0-7]+$/;
const HEX = /^0x[0-9a-fA-F]+$/;
const INF = /^[-+]?\.(?:inf|Inf|INF)$/;
const NAN = /^\.(?:nan|NaN|NAN)$/;

/** the core schema value of a plain scalar */
export function resolve_plain(s: string): unknown {
	switch (s) {
		case '':
		case '~':
		case 'null':
		case 'Null':
		case 'NULL':
			return null;
		case 'true':
		case 'True':
		case 'TRUE':
			return true;
		case 'false':
		case 'False':
		case 'FALSE':
			return false;
	}
	const c = s.charCodeAt(0);
	// only a digit, sign or dot can start a number
	if (!((c >= 48 && c <= 57) || c === PLUS || c === DASH || c === 46)) return s;
	if (INT.test(s) || FLOAT.test(s)) return Number(s);
	if (OCT.test(s)) return parseInt(s.slice(2), 8);
	if (HEX.test(s)) return parseInt(s.slice(2), 16);
	if (INF.test(s)) return c === DASH ? -Infinity : Infinity;
	if (NAN.test(s)) return NaN;
	return s;
}

const ESCAPES: Record<string, string> = {
	'0': '\0',
	a: '\x07',
	b: '\b',
	t: '\t',
	'\t': '\t',
	n: '\n',
	v: '\v',
	f: '\f',
	r: '\r',
	e: '\x1b',
	' ': ' ',
	'"': '"',
	'/': '/',
	'\\': '\\',
	N: '\x85',
	_: '\xa0',
	L: ' ',
	P: ' ',
};
const HEX_DIGITS: Record<string, number> = { x: 2, u: 4, U: 8 };
const HEX_RUN = /^[0-9a-fA-F]+$/;

class YamlParser {
	private src: string;
	private n = 0;
	private starts: number[] = [];
	private ends: number[] = [];
	/** content column per line, an entry moves it past its dash */
	private cols: number[] = [];
	/** lines of only whitespace or a comment */
	private blank: boolean[] = [];
	/** line the block parse is on */
	private at = 0;
	/** offset after the last quoted or flow value */
	private pos = 0;
	/** whether the last plain line ended at a comment */
	private cut = false;

	constructor(src: string) {
		this.src = src;
		let s = 0;
		while (s < src.length) {
			let e = src.indexOf('\n', s);
			if (e === -1) e = src.length;
			let col = s;
			while (col < e && src.charCodeAt(col) === SPACE) col++;
			let q = col;
			while (q < e && is_ws(src.charCodeAt(q))) q++;
			this.starts.push(s);
			this.ends.push(e);
			this.cols.push(col - s);
			this.blank.push(q === e || src.charCodeAt(q) === HASH);
			s = e + 1;
		}
		this.n = this.starts.length;
	}

	document(): Record<string, unknown> {
		this.skip_blank();
		if (this.at >= this.n) return {};
		const li = this.at;
		const col = this.indent(li);
		const p = this.starts[li] + col;
		let out: Record<string, unknown>;
		if (this.src.charCodeAt(p) === LBRACE) {
			out = this.flow(p) as Record<string, unknown>;
			this.finish_line(this.pos);
		} else {
			if (this.key_colon(li, p) === -1) this.no_key(li, p, col, true);
			out = this.map(col);
		}
		this.skip_blank();
		if (this.at < this.n)
			this.fail('unexpected indentation', this.at, this.cols[this.at]);
		return out;
	}

	private fail(reason: string, li: number, col: number): never {
		throw new YamlError(reason, li + 1, col + 1);
	}

	private fail_at(reason: string, offset: number): never {
		const li = this.line_of(offset);
		this.fail(reason, li, offset - this.starts[li]);
	}

	private line_of(offset: number): number {
		const starts = this.starts;
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}

	private skip_blank(): void {
		while (this.at < this.n && this.blank[this.at]) this.at++;
	}

	/** content column of a structural line, tabs may not indent */
	private indent(li: number): number {
		const col = this.cols[li];
		if (this.src.charCodeAt(this.starts[li] + col) === TAB)
			this.fail("tabs can't indent YAML, use spaces", li, col);
		return col;
	}

	private is_entry(p: number): boolean {
		return (
			this.src.charCodeAt(p) === DASH && is_break(this.src.charCodeAt(p + 1))
		);
	}

	/** offset of the colon ending a key at p, -1 when line li has none */
	private key_colon(li: number, p: number): number {
		const src = this.src;
		const end = this.ends[li];
		let i = p;
		const q = src.charCodeAt(i);
		if (q === DQUOTE || q === SQUOTE) {
			i = this.quoted_end(i, end);
			if (i === -1) return -1;
			while (i < end && is_ws(src.charCodeAt(i))) i++;
			return i < end &&
				src.charCodeAt(i) === COLON &&
				is_break(src.charCodeAt(i + 1))
				? i
				: -1;
		}
		for (; i < end; i++) {
			const c = src.charCodeAt(i);
			if (c === COLON) {
				if (is_break(src.charCodeAt(i + 1))) return i;
			} else if (c === HASH && i > p && is_ws(src.charCodeAt(i - 1))) {
				return -1;
			}
		}
		return -1;
	}

	/** offset after the closing quote, -1 when it does not close before end */
	private quoted_end(p: number, end: number): number {
		const src = this.src;
		const q = src.charCodeAt(p);
		for (let i = p + 1; i < end; i++) {
			const c = src.charCodeAt(i);
			if (q === DQUOTE && c === BACKSLASH) i++;
			else if (c === q) {
				if (q === SQUOTE && src.charCodeAt(i + 1) === SQUOTE) i++;
				else return i + 1;
			}
		}
		return -1;
	}

	/** reject a scalar starting with an indicator yaml reserves or this parser leaves out */
	private plain_start(p: number): void {
		const src = this.src;
		const c = src.charCodeAt(p);
		switch (c) {
			case AMP:
				this.fail_at("anchors (&) aren't supported", p);
			case STAR:
				this.fail_at("aliases (*) aren't supported", p);
			case BANG:
				this.fail_at("tags (!) aren't supported", p);
			case QUESTION:
				if (is_break(src.charCodeAt(p + 1)))
					this.fail_at("complex keys (?) aren't supported", p);
				return;
			case PERCENT:
			case AT:
			case BACKTICK:
			case COMMA:
			case LBRACKET:
			case RBRACKET:
			case LBRACE:
			case RBRACE:
			case PIPE:
			case GT:
			case HASH:
				this.fail_at(
					`'${src[p]}' can't start a plain value, quote the value`,
					p
				);
		}
	}

	private key(li: number, p: number, colon: number): string {
		const src = this.src;
		const c = src.charCodeAt(p);
		if (c === DQUOTE || c === SQUOTE) return this.quoted(p);
		this.plain_start(p);
		let e = colon;
		while (e > p && is_ws(src.charCodeAt(e - 1))) e--;
		const key = src.slice(p, e);
		if (key === '<<')
			this.fail("merge keys (<<) aren't supported", li, p - this.starts[li]);
		return key;
	}

	private map(col: number): Record<string, unknown> {
		const obj: Record<string, unknown> = {};
		for (;;) {
			this.skip_blank();
			const li = this.at;
			if (li >= this.n) return obj;
			const c = this.indent(li);
			if (c < col) return obj;
			if (c > col) this.fail('unexpected indentation', li, c);
			const p = this.starts[li] + c;
			const colon = this.key_colon(li, p);
			if (colon === -1) this.no_key(li, p, c, false);
			const key = this.key(li, p, colon);
			if (has_own.call(obj, key)) this.fail(`duplicate key '${key}'`, li, c);
			set_key(obj, key, this.value(li, colon + 1, col, true));
		}
	}

	/** fail on a line where a map wants a key */
	private no_key(li: number, p: number, col: number, top: boolean): never {
		if (
			this.src.charCodeAt(p) === QUESTION &&
			is_break(this.src.charCodeAt(p + 1))
		)
			this.fail("complex keys (?) aren't supported", li, col);
		if (top)
			this.fail('frontmatter must be a mapping of keys to values', li, col);
		this.fail(
			this.is_entry(p)
				? "a sequence entry can't sit beside keys, indent it under its key"
				: "expected 'key: value'",
			li,
			col
		);
	}

	private seq(col: number): unknown[] {
		const src = this.src;
		const arr: unknown[] = [];
		for (;;) {
			this.skip_blank();
			const li = this.at;
			if (li >= this.n) return arr;
			const c = this.indent(li);
			if (c < col) return arr;
			if (c > col) this.fail('unexpected indentation', li, c);
			const p = this.starts[li] + c;
			// a key at the indentation of the sequence belongs to the map holding it
			if (!this.is_entry(p)) return arr;
			const end = this.ends[li];
			let q = p + 1;
			while (q < end && is_ws(src.charCodeAt(q))) q++;
			if (
				q < end &&
				src.charCodeAt(q) !== HASH &&
				(this.is_entry(q) || this.key_colon(li, q) !== -1)
			) {
				// a collection on the entry line is indented to where it starts
				const inner = q - this.starts[li];
				this.cols[li] = inner;
				arr.push(this.node(li, inner, col));
			} else arr.push(this.value(li, p + 1, col, false));
		}
	}

	/** a block node whose content starts line li at column c */
	private node(li: number, c: number, col: number): unknown {
		const p = this.starts[li] + c;
		if (this.is_entry(p)) return this.seq(c);
		if (this.key_colon(li, p) !== -1) return this.map(c);
		return this.inline(li, p, col);
	}

	/** the value after a key colon or entry dash at p, col is the parent column */
	private value(li: number, p: number, col: number, in_map: boolean): unknown {
		const src = this.src;
		const end = this.ends[li];
		while (p < end && is_ws(src.charCodeAt(p))) p++;
		if (p < end && src.charCodeAt(p) !== HASH) return this.inline(li, p, col);

		// the value is on the lines below, or null
		this.at = li + 1;
		this.skip_blank();
		const next = this.at;
		if (next >= this.n) return null;
		const c = this.indent(next);
		if (c > col) return this.node(next, c, col);
		// a sequence may sit at the indentation of its key
		if (c === col && in_map && this.is_entry(this.starts[next] + c))
			return this.seq(c);
		return null;
	}

	private inline(li: number, p: number, col: number): unknown {
		const c = this.src.charCodeAt(p);
		if (c === PIPE || c === GT) return this.block_scalar(li, p, col);
		if (c === LBRACKET || c === LBRACE) {
			const v = this.flow(p);
			this.finish_line(this.pos);
			return v;
		}
		if (c === DQUOTE || c === SQUOTE) {
			const v = this.quoted(p);
			this.finish_line(this.pos);
			return v;
		}
		if (this.is_entry(p))
			this.fail_at(
				"a sequence can't start on its key's line, start it on the next line",
				p
			);
		return this.plain(li, p, col);
	}

	/** only whitespace or a comment may follow a value ending at p, the block parse resumes on the next line */
	private finish_line(p: number): void {
		const src = this.src;
		const li = this.line_of(p);
		const end = this.ends[li];
		let i = p;
		while (i < end && is_ws(src.charCodeAt(i))) i++;
		if (i < end && (src.charCodeAt(i) !== HASH || i === p))
			this.fail_at('unexpected text after the value', i);
		this.at = li + 1;
	}

	/** trimmed plain text from p to end, a colon then space fails */
	private plain_line(p: number, end: number): string {
		const src = this.src;
		let e = end;
		this.cut = false;
		for (let i = p; i < end; i++) {
			const c = src.charCodeAt(i);
			if (c === HASH && is_ws(src.charCodeAt(i - 1))) {
				e = i;
				this.cut = true;
				break;
			}
			if (c === COLON && is_break(src.charCodeAt(i + 1)))
				this.fail_at("a plain value can't contain ': ', quote the value", i);
		}
		while (e > p && is_ws(src.charCodeAt(e - 1))) e--;
		return src.slice(p, e);
	}

	/** a plain scalar, its more indented lines below fold into it */
	private plain(li: number, p: number, col: number): unknown {
		const src = this.src;
		this.plain_start(p);
		let text = this.plain_line(p, this.ends[li]);
		let last = li;
		let breaks = 0;
		for (let k = li + 1; !this.cut && k < this.n; k++) {
			const s = this.starts[k];
			const e = this.ends[k];
			let q = s;
			while (q < e && is_ws(src.charCodeAt(q))) q++;
			if (q === e) {
				breaks++;
				continue;
			}
			if (src.charCodeAt(q) === HASH || this.cols[k] <= col) break;
			const seg = this.plain_line(q, e);
			text += breaks === 0 ? ' ' + seg : '\n'.repeat(breaks) + seg;
			breaks = 0;
			last = k;
		}
		this.at = last + 1;
		return last === li ? resolve_plain(text) : text;
	}

	/** a quoted scalar at p, possibly over several lines, pos is set after its closing quote */
	private quoted(p: number): string {
		const src = this.src;
		const len = src.length;
		const q = src.charCodeAt(p);
		const double = q === DQUOTE;
		let out = '';
		let i = p + 1;
		let run = i;
		for (;;) {
			if (i >= len) this.fail_at('unterminated quoted value', p);
			const c = src.charCodeAt(i);
			if (c === q) {
				if (!double && src.charCodeAt(i + 1) === SQUOTE) {
					out += src.slice(run, i + 1);
					i += 2;
					run = i;
					continue;
				}
				this.pos = i + 1;
				return out + src.slice(run, i);
			}
			if (double && c === BACKSLASH) {
				out += src.slice(run, i);
				const e = src[i + 1];
				if (e === '\n') {
					// an escaped line break joins the lines with nothing between,
					// empty lines after it are each a \n
					i += 2;
					for (;;) {
						while (i < len && is_ws(src.charCodeAt(i))) i++;
						if (src.charCodeAt(i) !== LF) break;
						out += '\n';
						i++;
					}
				} else if (e !== undefined && ESCAPES[e] !== undefined) {
					out += ESCAPES[e];
					i += 2;
				} else if (e !== undefined && HEX_DIGITS[e] !== undefined) {
					const digits = src.slice(i + 2, i + 2 + HEX_DIGITS[e]);
					if (digits.length !== HEX_DIGITS[e] || !HEX_RUN.test(digits))
						this.fail_at(`invalid escape '\\${e}${digits}'`, i);
					out += String.fromCodePoint(parseInt(digits, 16));
					i += 2 + digits.length;
				} else {
					this.fail_at(`unknown escape '\\${e ?? ''}'`, i);
				}
				run = i;
				continue;
			}
			if (c === LF) {
				// a line break folds to a space, or to one \n per empty line after it
				let t = i;
				while (t > run && is_ws(src.charCodeAt(t - 1))) t--;
				out += src.slice(run, t);
				let breaks = 0;
				i++;
				for (;;) {
					while (i < len && is_ws(src.charCodeAt(i))) i++;
					if (src.charCodeAt(i) !== LF) break;
					breaks++;
					i++;
				}
				out += breaks === 0 ? ' ' : '\n'.repeat(breaks);
				run = i;
				continue;
			}
			i++;
		}
	}

	/** a literal or folded block scalar with its header at p */
	private block_scalar(li: number, p: number, col: number): string {
		const src = this.src;
		const literal = src.charCodeAt(p) === PIPE;
		const end = this.ends[li];
		// -1 strip, 0 clip, 1 keep
		let chomp = 0;
		let explicit = 0;
		let i = p + 1;
		for (let k = 0; k < 2 && i < end; k++) {
			const c = src.charCodeAt(i);
			if ((c === PLUS || c === DASH) && chomp === 0) {
				chomp = c === PLUS ? 1 : -1;
				i++;
			} else if (c >= 49 && c <= 57 && explicit === 0) {
				explicit = c - 48;
				i++;
			} else break;
		}
		let h = i;
		while (h < end && is_ws(src.charCodeAt(h))) h++;
		if (h < end && (src.charCodeAt(h) !== HASH || h === i))
			this.fail_at('unexpected text after the block scalar header', h);

		let indent = explicit === 0 ? -1 : col + explicit;
		const lines: string[] = [];
		let k = li + 1;
		for (; k < this.n; k++) {
			const s = this.starts[k];
			const e = this.ends[k];
			const sp = this.cols[k];
			let q = s + sp;
			while (q < e && is_ws(src.charCodeAt(q))) q++;
			if (q === e) {
				// only whitespace, any past the indentation is content
				lines.push(
					indent !== -1 && sp > indent ? src.slice(s + indent, e) : ''
				);
				continue;
			}
			if (indent === -1) {
				if (sp <= col) break;
				indent = sp;
			}
			if (sp < indent) break;
			lines.push(src.slice(s + indent, e));
		}
		this.at = k;

		let last = lines.length;
		while (last > 0 && lines[last - 1] === '') last--;
		const trailing = lines.length - last;
		if (last === 0) return chomp === 1 ? '\n'.repeat(trailing) : '';
		let body = '';
		if (literal) {
			for (let j = 0; j < last; j++)
				body += j === 0 ? lines[j] : '\n' + lines[j];
		} else {
			// a break between two lines at the indentation folds to a space, empty
			// lines are each a \n and more indented lines keep their breaks
			let prev = 0; // 0 none, 1 at the indentation, 2 more indented
			let empty = 0;
			for (let j = 0; j < last; j++) {
				const line = lines[j];
				if (line === '') {
					empty++;
					continue;
				}
				const more = is_ws(line.charCodeAt(0));
				if (prev === 0) body += '\n'.repeat(empty);
				else if (prev === 1 && !more)
					body += empty === 0 ? ' ' : '\n'.repeat(empty);
				else body += '\n'.repeat(empty + 1);
				body += line;
				prev = more ? 2 : 1;
				empty = 0;
			}
		}
		if (chomp === -1) return body;
		if (chomp === 0) return body + '\n';
		return body + '\n'.repeat(trailing + 1);
	}

	/** skip whitespace, line breaks and comments in a flow collection */
	private flow_ws(i: number): number {
		const src = this.src;
		const len = src.length;
		// a comment needs whitespace before it
		let after_ws = is_break(src.charCodeAt(i - 1));
		while (i < len) {
			const c = src.charCodeAt(i);
			if (c === SPACE || c === TAB || c === LF) {
				after_ws = true;
				i++;
			} else if (c === HASH && after_ws) {
				const e = src.indexOf('\n', i);
				i = e === -1 ? len : e;
			} else break;
		}
		return i;
	}

	/** end of a plain scalar in a flow collection, trailing whitespace excluded */
	private flow_plain_end(p: number): number {
		const src = this.src;
		const len = src.length;
		let i = p;
		for (; i < len; i++) {
			const c = src.charCodeAt(i);
			if (
				c === COMMA ||
				c === LF ||
				c === LBRACKET ||
				c === RBRACKET ||
				c === LBRACE ||
				c === RBRACE
			)
				break;
			if (c === COLON) {
				const n = src.charCodeAt(i + 1);
				if (is_break(n) || n === COMMA || n === RBRACKET || n === RBRACE) break;
			}
			if (c === HASH && is_ws(src.charCodeAt(i - 1))) break;
		}
		while (i > p && is_ws(src.charCodeAt(i - 1))) i--;
		return i;
	}

	/** a value in a flow collection at p, pos is set after it */
	private flow_item(p: number): unknown {
		const src = this.src;
		const c = src.charCodeAt(p);
		if (c === LBRACKET || c === LBRACE) return this.flow(p);
		if (c === DQUOTE || c === SQUOTE) return this.quoted(p);
		this.plain_start(p);
		const e = this.flow_plain_end(p);
		this.pos = e;
		return resolve_plain(src.slice(p, e));
	}

	/** a flow collection at p, possibly over several lines, pos is set after it */
	private flow(p: number): unknown {
		const src = this.src;
		const is_seq = src.charCodeAt(p) === LBRACKET;
		const close = is_seq ? RBRACKET : RBRACE;
		const arr: unknown[] = [];
		const obj: Record<string, unknown> = {};
		let i = this.flow_ws(p + 1);
		for (;;) {
			if (i >= src.length)
				this.fail_at(
					is_seq ? 'unterminated flow sequence' : 'unterminated flow mapping',
					p
				);
			const c = src.charCodeAt(i);
			if (c === close) {
				this.pos = i + 1;
				return is_seq ? arr : obj;
			}
			if (c === COMMA) this.fail_at('empty entry in a flow collection', i);
			if (is_seq) {
				const v = this.flow_item(i);
				i = this.flow_ws(this.pos);
				if (src.charCodeAt(i) === COLON)
					this.fail_at(
						'a key in a flow sequence needs braces, write [{ key: value }]',
						i
					);
				arr.push(v);
			} else {
				const at = i;
				let key: string;
				if (c === DQUOTE || c === SQUOTE) {
					key = this.quoted(i);
					i = this.flow_ws(this.pos);
				} else {
					this.plain_start(i);
					const e = this.flow_plain_end(i);
					key = src.slice(i, e);
					i = this.flow_ws(e);
				}
				let v: unknown = null;
				if (src.charCodeAt(i) === COLON) {
					i = this.flow_ws(i + 1);
					const n = src.charCodeAt(i);
					if (n !== COMMA && n !== close) {
						v = this.flow_item(i);
						i = this.flow_ws(this.pos);
					}
				}
				if (has_own.call(obj, key)) this.fail_at(`duplicate key '${key}'`, at);
				set_key(obj, key, v);
			}
			const d = src.charCodeAt(i);
			if (d === COMMA) i = this.flow_ws(i + 1);
			else if (d !== close)
				this.fail_at(
					is_seq ? "expected ',' or ']'" : "expected ',' or '}'",
					i < src.length ? i : p
				);
		}
	}
}
