// external scanner for mdsvex, PFM.md at the repo root is the spec
//
// the lexer never moves back, so a lookahead marks the token end first, and a failed
// check at a line start returns a zero width token so the next call reads the line again

#include "tree_sitter/alloc.h"
#include "tree_sitter/array.h"
#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

enum TokenType {
	LINE_ENDING,
	SOFT_LINE_ENDING,
	BLANK_LINE,
	BLOCK_CLOSE,
	BLOCK_CONTINUATION,
	INDENT,

	BLOCK_QUOTE_MARKER,
	LIST_MARKER_MINUS,
	LIST_MARKER_PLUS,
	LIST_MARKER_STAR,
	LIST_MARKER_DOT,
	LIST_MARKER_PARENTHESIS,
	TASK_UNCHECKED,
	TASK_CHECKED,
	ATX_H1,
	ATX_H2,
	ATX_H3,
	ATX_H4,
	ATX_H5,
	ATX_H6,
	THEMATIC_BREAK,
	FENCE_OPEN,
	FENCE_CLOSE,
	CODE_LINE,
	FRONTMATTER_OPEN,
	FRONTMATTER_CONTENT,
	FRONTMATTER_CLOSE,
	IMPORT_STATEMENT,
	FOOTNOTE_DEFINITION_START,
	LINK_REFERENCE_DEFINITION_START,
	TABLE_START,
	TABLE_ROW_START,
	HTML_BLOCK_START,
	SVELTE_OPEN_LINE,
	SVELTE_BRANCH_LINE,
	SVELTE_CLOSE_LINE,
	LEAF_DIRECTIVE_START,
	CONTAINER_DIRECTIVE_OPEN,
	CONTAINER_DIRECTIVE_CLOSE,

	TEXT,
	EMPHASIS_OPEN,
	EMPHASIS_CLOSE,
	STRONG_OPEN,
	STRONG_CLOSE,
	STRIKETHROUGH_OPEN,
	STRIKETHROUGH_CLOSE,
	SUBSCRIPT_OPEN,
	SUBSCRIPT_CLOSE,
	SUPERSCRIPT_OPEN,
	SUPERSCRIPT_CLOSE,
	CODE_SPAN_OPEN,
	CODE_SPAN_CONTENT,
	CODE_SPAN_CLOSE,
	MATH_OPEN,
	MATH_CLOSE,
	BRACKET_OPEN,
	IMAGE_OPEN,
	BRACKET_CLOSE,
	ARGS_OPEN,
	INLINE_DIRECTIVE_MARKER,
	HARD_LINE_BREAK,
	TAG_NAME,
	RAW_TAG_NAME,
	RAW_TEXT,
	EXPRESSION_CONTENT,
	URI_AUTOLINK,
	LINK_DESTINATION,

	ERROR_SENTINEL,
};

// open containers, the ones whose lines start with a prefix
enum { QUOTE, LIST_ITEM, FOOTNOTE };

typedef struct {
	uint8_t type;
	// the columns a line needs past the container prefix to go on with a list item or note
	uint8_t indent;
} Block;

enum {
	// the next token starts a line, after the prefixes of the first `matched` containers
	F_LINE_START = 1,
	// the line after a soft line ending goes on with the paragraph past the list item indent
	F_LAZY = 2,
	// a heading, a table row or an html block line, nothing in it reads past the line
	F_SINGLE_LINE = 4,
	F_IN_ROW = 8,
	F_IMPORTS = 16,
	// the line being read is frontmatter or an import, so imports may still follow
	F_IMPORT_LINE = 32,
	// the link reference definition being read has its title on the line after its destination
	F_DEFINITION_TITLE = 64,
};

enum { C_WS, C_PUNCT, C_WORD };

// past this the scanner stops pushing, so the state always fits its buffer
#define MAX_DEPTH 100
#define MAX_DEFINITIONS 128

typedef struct {
	Array(Block) open;
	// one count per open link, image or label, of the literal `[` inside it not yet closed
	Array(uint8_t) brackets;
	// colons and container depth of each open container directive, two bytes an entry
	Array(uint8_t) directives;
	// hashes of the labels of the link reference definitions read so far
	Array(uint16_t) definitions;
	uint8_t matched;
	uint8_t flags;
	uint8_t fence_len;
	uint8_t ticks;
	uint8_t raw_tag;
	// the columns of whitespace before the block at the line start, past the prefixes
	uint8_t indent_ws;
	int32_t prev_char;
	uint32_t line_start_col;
	// the column the last token of this scanner ended at, prev_char is its last char
	uint32_t last_col;
	// not serialized, the run line_interrupts read at the start of a line that went on with
	// the paragraph, so a lookahead can count the marks in it
	int32_t peek_mark;
	unsigned peek_count;
} Scanner;

static const char *RAW_TAGS[] = {"script", "style", "textarea", "pre"};

static const char *BLOCK_TAGS[] = {
	"address", "article", "aside", "base", "basefont", "blockquote", "body",
	"caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir",
	"div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
	"frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
	"hr", "html", "iframe", "legend", "li", "link", "main", "menu", "menuitem",
	"nav", "noframes", "ol", "optgroup", "option", "p", "param", "pre",
	"section", "source", "summary", "table", "tbody", "td", "tfoot", "th",
	"thead", "title", "tr", "track", "ul", "script", "style", "textarea",
	"template",
};

static inline void adv(TSLexer *lexer) { lexer->advance(lexer, false); }

static inline bool is_ws(int32_t c) { return c == ' ' || c == '\t'; }

static inline bool is_eol_char(int32_t c) { return c == '\n' || c == '\r'; }

static inline bool at_eol(TSLexer *lexer) {
	return lexer->eof(lexer) || is_eol_char(lexer->lookahead);
}

static inline bool is_alpha(int32_t c) {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

static inline bool is_digit(int32_t c) { return c >= '0' && c <= '9'; }

static inline bool is_alnum(int32_t c) { return is_alpha(c) || is_digit(c); }

static inline bool is_ascii_punct(int32_t c) {
	return (c >= '!' && c <= '/') || (c >= ':' && c <= '@') ||
	       (c >= '[' && c <= '`') || (c >= '{' && c <= '~');
}

static inline bool is_tag_name_char(int32_t c) {
	return is_alnum(c) || c == ':' || c == '.' || c == '_' || c == '-';
}

// whitespace, punctuation or a word char for flanking, unicode punctuation and symbols
// are punctuation, and so are han, kana and hangul, a boundary on the outer side
static uint8_t classify(int32_t c) {
	if (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == 0 || c == 0xa0 ||
	    c == 0x3000 || (c >= 0x2000 && c <= 0x200a))
		return C_WS;
	if (c < 128) return is_ascii_punct(c) ? C_PUNCT : C_WORD;
	if ((c >= 0xa1 && c <= 0xbf) || c == 0xd7 || c == 0xf7) return C_PUNCT;
	if (c >= 0x2010 && c <= 0x2bff) return C_PUNCT;
	if (c >= 0x2e00 && c <= 0x2e7f) return C_PUNCT;
	if (c >= 0x3001 && c <= 0x30ff) return C_PUNCT;
	if (c >= 0x3400 && c <= 0x4dbf) return C_PUNCT;
	if (c >= 0x4e00 && c <= 0x9fff) return C_PUNCT;
	if (c >= 0xac00 && c <= 0xd7af) return C_PUNCT;
	if (c >= 0xf900 && c <= 0xfaff) return C_PUNCT;
	if (c >= 0xfe30 && c <= 0xfe4f) return C_PUNCT;
	if ((c >= 0xff01 && c <= 0xff0f) || (c >= 0xff1a && c <= 0xff20) ||
	    (c >= 0xff3b && c <= 0xff40) || (c >= 0xff5b && c <= 0xff65))
		return C_PUNCT;
	return C_WORD;
}

static inline uint8_t next_class(TSLexer *lexer) {
	return lexer->eof(lexer) ? C_WS : classify(lexer->lookahead);
}

static void skip_ws(TSLexer *lexer) {
	while (is_ws(lexer->lookahead)) adv(lexer);
}

static void skip_newline(TSLexer *lexer) {
	if (lexer->lookahead == '\r') adv(lexer);
	if (lexer->lookahead == '\n') adv(lexer);
}

// reads a tag name into buf, lowercased and cut at its size, and returns its length
static unsigned read_name(TSLexer *lexer, char *buf, unsigned size) {
	unsigned n = 0;
	while (!lexer->eof(lexer) && is_tag_name_char(lexer->lookahead)) {
		int32_t c = lexer->lookahead;
		if (n + 1 < size) buf[n] = (char)(c >= 'A' && c <= 'Z' ? c + 32 : c);
		n++;
		adv(lexer);
	}
	buf[n + 1 < size ? n : size - 1] = 0;
	return n;
}

static int raw_tag_index(const char *name) {
	for (int i = 0; i < 4; i++)
		if (strcmp(name, RAW_TAGS[i]) == 0) return i + 1;
	return 0;
}

static bool is_block_tag(const char *name) {
	for (unsigned i = 0; i < sizeof(BLOCK_TAGS) / sizeof(BLOCK_TAGS[0]); i++)
		if (strcmp(name, BLOCK_TAGS[i]) == 0) return true;
	return false;
}

static void start_line(Scanner *s, uint32_t col) {
	s->flags |= F_LINE_START;
	s->line_start_col = col;
	s->matched = 0;
	s->indent_ws = 0;
	s->prev_char = ' ';
	s->last_col = col;
}

// the line start moves past a prefix or a container marker on the same line
static void continue_line(Scanner *s, uint32_t col) {
	s->flags |= F_LINE_START;
	s->line_start_col = col;
	s->prev_char = ' ';
	s->last_col = col;
}

static void end_line(Scanner *s) {
	s->flags &= ~(F_SINGLE_LINE | F_IN_ROW | F_LAZY | F_DEFINITION_TITLE);
	if (!(s->flags & F_IMPORT_LINE)) s->flags &= ~F_IMPORTS;
	s->flags &= ~F_IMPORT_LINE;
	array_clear(&s->brackets);
}

static void push_block(Scanner *s, uint8_t type, unsigned indent) {
	if (s->open.size >= MAX_DEPTH) return;
	Block b = {type, (uint8_t)(indent > 255 ? 255 : indent)};
	array_push(&s->open, b);
	s->matched = (uint8_t)s->open.size;
}

static bool in_list_item(Scanner *s) {
	return s->open.size > 0 && s->open.contents[s->open.size - 1].type == LIST_ITEM;
}

// a label hashed as labels match, case folded, whitespace collapsed and trimmed
typedef struct {
	uint32_t hash;
	bool started;
	bool space;
} Label;

static void label_init(Label *l) {
	l->hash = 2166136261u;
	l->started = false;
	l->space = false;
}

static void label_mix(Label *l, uint32_t c) {
	l->hash = (l->hash ^ c) * 16777619u;
}

static void label_add(Label *l, int32_t c) {
	if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
		l->space = l->started;
		return;
	}
	if (l->space) label_mix(l, ' ');
	l->space = false;
	l->started = true;
	if ((c >= 'A' && c <= 'Z') || (c >= 0xc0 && c <= 0xde && c != 0xd7) ||
	    (c >= 0x391 && c <= 0x3a9) || (c >= 0x410 && c <= 0x42f)) {
		c += 32;
	}
	label_mix(l, (uint32_t)c);
}

static uint16_t label_key(Label *l) {
	return (uint16_t)(l->hash ^ (l->hash >> 16));
}

static bool is_defined(Scanner *s, Label *l) {
	uint16_t key = label_key(l);
	for (unsigned i = 0; i < s->definitions.size; i++)
		if (s->definitions.contents[i] == key) return true;
	return false;
}

static void drop_directives(Scanner *s) {
	while (s->directives.size >= 2 &&
	       s->directives.contents[s->directives.size - 1] > s->open.size)
		s->directives.size -= 2;
}

// shared lookahead checks, each advances the lexer and says whether the construct is there

// past `{`, to the `}` that closes it, strings, template literals and comments skipped
static bool skip_expression(TSLexer *lexer) {
	uint8_t stack[64];
	unsigned sp = 0;
	for (;;) {
		if (lexer->eof(lexer)) return false;
		int32_t c = lexer->lookahead;
		if (sp > 0 && stack[sp - 1] == '`') {
			if (c == '`') {
				sp--;
			} else if (c == '\\') {
				adv(lexer);
			} else if (c == '$') {
				adv(lexer);
				if (lexer->lookahead == '{' && sp < 64) stack[sp++] = '{';
				else continue;
			}
			adv(lexer);
			continue;
		}
		switch (c) {
		case '}':
			if (sp == 0) return true;
			sp--;
			adv(lexer);
			break;
		case '{':
		case '`':
			if (sp < 64) stack[sp++] = (uint8_t)c;
			adv(lexer);
			break;
		case '"':
		case '\'': {
			adv(lexer);
			while (!lexer->eof(lexer) && lexer->lookahead != c &&
			       !is_eol_char(lexer->lookahead)) {
				if (lexer->lookahead == '\\') adv(lexer);
				adv(lexer);
			}
			if (lexer->lookahead == c) adv(lexer);
			break;
		}
		case '/':
			adv(lexer);
			if (lexer->lookahead == '/') {
				while (!at_eol(lexer)) adv(lexer);
			} else if (lexer->lookahead == '*') {
				adv(lexer);
				for (;;) {
					if (lexer->eof(lexer)) return false;
					if (lexer->lookahead == '*') {
						adv(lexer);
						if (lexer->lookahead == '/') {
							adv(lexer);
							break;
						}
						continue;
					}
					adv(lexer);
				}
			}
			break;
		default:
			adv(lexer);
		}
	}
}

// at `(`, the argument list of a directive, named values on one line separated by commas
static bool scan_args_body(TSLexer *lexer) {
	uint32_t keys[16];
	unsigned count = 0;
	skip_ws(lexer);
	if (lexer->lookahead == ')') return true;
	for (;;) {
		if (!(is_alpha(lexer->lookahead) || lexer->lookahead == '_')) return false;
		uint32_t key = 2166136261u;
		while (is_alnum(lexer->lookahead) || lexer->lookahead == '_' ||
		       lexer->lookahead == '-') {
			key = (key ^ (uint32_t)lexer->lookahead) * 16777619u;
			adv(lexer);
		}
		for (unsigned i = 0; i < count; i++)
			if (keys[i] == key) return false;
		if (count < 16) keys[count++] = key;
		skip_ws(lexer);
		if (lexer->lookahead != '=') return false;
		adv(lexer);
		skip_ws(lexer);
		int32_t q = lexer->lookahead;
		if (q == '"' || q == '\'') {
			adv(lexer);
			while (lexer->lookahead != q) {
				if (at_eol(lexer)) return false;
				if (lexer->lookahead == '\\') adv(lexer);
				if (at_eol(lexer)) return false;
				adv(lexer);
			}
			adv(lexer);
		} else {
			unsigned n = 0;
			while (!at_eol(lexer) && !is_ws(lexer->lookahead) &&
			       lexer->lookahead != ',' && lexer->lookahead != '(' &&
			       lexer->lookahead != ')' && lexer->lookahead != '"' &&
			       lexer->lookahead != '\'' && lexer->lookahead != '\\') {
				adv(lexer);
				n++;
			}
			if (n == 0) return false;
		}
		skip_ws(lexer);
		if (lexer->lookahead == ')') return true;
		if (lexer->lookahead != ',') return false;
		adv(lexer);
		skip_ws(lexer);
	}
}

// at `[`, a bracketed text on one line, brackets balanced, escapes and code spans skipped
static bool skip_label(TSLexer *lexer) {
	adv(lexer);
	unsigned depth = 1;
	while (!at_eol(lexer)) {
		int32_t c = lexer->lookahead;
		adv(lexer);
		if (c == '\\') {
			if (!at_eol(lexer)) adv(lexer);
		} else if (c == '`') {
			unsigned n = 1;
			while (lexer->lookahead == '`') {
				adv(lexer);
				n++;
			}
			while (!at_eol(lexer)) {
				if (lexer->lookahead != '`') {
					adv(lexer);
					continue;
				}
				unsigned m = 0;
				while (lexer->lookahead == '`') {
					adv(lexer);
					m++;
				}
				if (m == n) break;
			}
		} else if (c == '[') {
			depth++;
		} else if (c == ']') {
			if (--depth == 0) return true;
		}
	}
	return false;
}

// past the colons of a leaf or container directive, the rest of its line is well formed
static bool check_directive_rest(TSLexer *lexer) {
	if (!is_alpha(lexer->lookahead)) return false;
	while (is_alnum(lexer->lookahead) || lexer->lookahead == '_' ||
	       lexer->lookahead == '-')
		adv(lexer);
	if (lexer->lookahead == '[' && !skip_label(lexer)) return false;
	if (lexer->lookahead == '(') {
		adv(lexer);
		if (!scan_args_body(lexer)) return false;
		adv(lexer);
	}
	skip_ws(lexer);
	return at_eol(lexer);
}

// at `{`, the line token of a line holding only an opening, branch or closing svelte
// block tag, or 0
static int check_svelte_line(TSLexer *lexer) {
	adv(lexer);
	int kind;
	switch (lexer->lookahead) {
	case '#':
		kind = SVELTE_OPEN_LINE;
		break;
	case ':':
		kind = SVELTE_BRANCH_LINE;
		break;
	case '/':
		kind = SVELTE_CLOSE_LINE;
		break;
	default:
		return 0;
	}
	adv(lexer);
	if (!is_alpha(lexer->lookahead)) return 0;
	if (!skip_expression(lexer)) return 0;
	adv(lexer);
	skip_ws(lexer);
	return at_eol(lexer) ? kind : 0;
}

// at `<`, a tag of a block level element, a component or a comment
static bool check_block_tag(TSLexer *lexer) {
	adv(lexer);
	if (lexer->lookahead == '!') {
		adv(lexer);
		if (lexer->lookahead != '-') return false;
		adv(lexer);
		return lexer->lookahead == '-';
	}
	if (lexer->lookahead == '/') adv(lexer);
	if (!is_alpha(lexer->lookahead)) return false;
	bool upper = lexer->lookahead >= 'A' && lexer->lookahead <= 'Z';
	char name[16];
	read_name(lexer, name, sizeof(name));
	int32_t c = lexer->lookahead;
	if (!(is_ws(c) || c == '>' || c == '/' || at_eol(lexer))) return false;
	return upper || strncmp(name, "svelte:", 7) == 0 || is_block_tag(name);
}

// at `[^`, a footnote definition label and its colon
static unsigned check_footnote_label(TSLexer *lexer) {
	unsigned n = 0;
	while (!at_eol(lexer)) {
		int32_t c = lexer->lookahead;
		if (is_ws(c) || c == '[' || c == '^') return 0;
		if (c == ']') break;
		adv(lexer);
		n++;
	}
	if (n == 0 || lexer->lookahead != ']') return 0;
	adv(lexer);
	if (lexer->lookahead != ':') return 0;
	adv(lexer);
	return n;
}

// at the first char past the prefixes and indent of the line after a paragraph line,
// whether that line starts a block, which ends the paragraph
static bool line_interrupts(Scanner *s, TSLexer *lexer) {
	int32_t c = lexer->lookahead;
	s->peek_mark = 0;
	s->peek_count = 0;
	switch (c) {
	case '#': {
		unsigned n = 0;
		while (lexer->lookahead == '#' && n < 7) {
			adv(lexer);
			n++;
		}
		return n <= 6 && (is_ws(lexer->lookahead) || at_eol(lexer));
	}
	case '`': {
		unsigned n = 0;
		while (lexer->lookahead == '`') {
			adv(lexer);
			n++;
		}
		s->peek_mark = '`';
		s->peek_count = n;
		return n >= 3;
	}
	case '>':
		return true;
	case '-':
	case '*':
	case '+':
	case '_': {
		adv(lexer);
		s->peek_mark = c;
		s->peek_count = 1;
		if (c != '_' && is_ws(lexer->lookahead)) {
			skip_ws(lexer);
			return !at_eol(lexer);
		}
		unsigned marks = 1;
		while (lexer->lookahead == c) {
			adv(lexer);
			marks++;
		}
		s->peek_count = marks;
		if (!is_ws(lexer->lookahead) && !at_eol(lexer)) return false;
		while (lexer->lookahead == c || is_ws(lexer->lookahead)) {
			if (lexer->lookahead == c) marks++;
			adv(lexer);
		}
		return at_eol(lexer) && marks >= 3 && c != '+';
	}
	case '[':
		adv(lexer);
		s->peek_mark = '[';
		s->peek_count = 1;
		if (lexer->lookahead != '^') return false;
		adv(lexer);
		return check_footnote_label(lexer) > 0;
	case ':': {
		unsigned n = 0;
		while (lexer->lookahead == ':') {
			adv(lexer);
			n++;
		}
		if (n >= 3) {
			if (!is_ws(lexer->lookahead) && !at_eol(lexer)) return check_directive_rest(lexer);
			skip_ws(lexer);
			// a close line ends a paragraph only in the directive it closes
			return at_eol(lexer) && s->directives.size >= 2 &&
			       s->directives.contents[s->directives.size - 2] == n;
		}
		return n == 2 && check_directive_rest(lexer);
	}
	case '{':
		return check_svelte_line(lexer) != 0;
	case '<': {
		// a close tag may close the element the paragraph is in, an open tag of a
		// component or a phrasing element starts no block
		adv(lexer);
		bool close = lexer->lookahead == '/';
		if (close) adv(lexer);
		if (!is_alpha(lexer->lookahead)) return false;
		bool lower = lexer->lookahead >= 'a' && lexer->lookahead <= 'z';
		char name[16];
		read_name(lexer, name, sizeof(name));
		if (!(is_ws(lexer->lookahead) || lexer->lookahead == '>' ||
		      lexer->lookahead == '/' || at_eol(lexer)))
			return false;
		return close || (lower && is_block_tag(name));
	}
	default:
		if (is_digit(c)) {
			unsigned n = 0, value = 0;
			while (is_digit(lexer->lookahead) && n < 10) {
				value = value * 10 + (unsigned)(lexer->lookahead - '0');
				adv(lexer);
				n++;
			}
			if (n > 9) return false;
			if (lexer->lookahead != '.' && lexer->lookahead != ')') return false;
			adv(lexer);
			if (!is_ws(lexer->lookahead)) return false;
			skip_ws(lexer);
			return !at_eol(lexer) && (value == 1 || in_list_item(s));
		}
		return false;
	}
}

// just past a line ending inside a paragraph, whether the next line goes on with it,
// lazy is set when it does so past a list item or note it is not indented for
static bool paragraph_continues(Scanner *s, TSLexer *lexer, bool *lazy) {
	*lazy = false;
	for (unsigned i = 0; i < s->open.size; i++) {
		Block b = s->open.contents[i];
		if (b.type == QUOTE) {
			skip_ws(lexer);
			if (lexer->lookahead != '>') return false;
			adv(lexer);
			if (is_ws(lexer->lookahead)) adv(lexer);
		} else {
			unsigned cols = 0;
			while (is_ws(lexer->lookahead) && cols < b.indent) {
				cols += lexer->lookahead == '\t' ? 4 - cols % 4 : 1;
				adv(lexer);
			}
			if (cols < b.indent) *lazy = true;
		}
	}
	skip_ws(lexer);
	if (at_eol(lexer)) return false;
	return !line_interrupts(s, lexer);
}

// past an opening run of n backticks, to a closing run of exactly n, within the paragraph
static bool find_code_close(Scanner *s, TSLexer *lexer, unsigned n, bool one_line) {
	for (;;) {
		if (lexer->eof(lexer)) return false;
		int32_t c = lexer->lookahead;
		if (is_eol_char(c)) {
			if (one_line || (s->flags & F_SINGLE_LINE)) return false;
			skip_newline(lexer);
			bool lazy;
			if (!paragraph_continues(s, lexer, &lazy)) return false;
			if (s->peek_mark == '`' && s->peek_count == n) return true;
			continue;
		}
		if (c != '`') {
			adv(lexer);
			continue;
		}
		unsigned m = 0;
		while (lexer->lookahead == '`') {
			adv(lexer);
			m++;
		}
		if (m == n) return true;
	}
}

// past an opening delimiter, whether a closer for it follows within the paragraph, openers
// of the same mark nest, a closer does not count inside brackets opened after the delimiter
// or with an opener of another mark still open, and nothing reads past the `]` of an open link
static bool find_closer(Scanner *s, TSLexer *lexer, int32_t mark, unsigned len) {
	int32_t kind = len == 2 ? 'S' : mark;
	bool row = s->flags & F_IN_ROW;
	bool enclosed = s->brackets.size > 0;
	unsigned depth = 1, brackets = 0, others = 0;
	int32_t other[16];
	uint8_t prev = C_PUNCT;
	// delimiters with nothing but delimiters between them stay literal
	bool first = true;
	for (;;) {
		if (lexer->eof(lexer)) return false;
		int32_t c = lexer->lookahead;
		if (is_eol_char(c)) {
			if (s->flags & F_SINGLE_LINE) return false;
			skip_newline(lexer);
			bool lazy;
			if (!paragraph_continues(s, lexer, &lazy)) return false;
			prev = C_WS;
			first = false;
			// a run at the start of the line opens when text follows it
			if ((s->peek_mark == '*' || s->peek_mark == '_') && s->peek_count > 0 &&
			    next_class(lexer) != C_WS) {
				if (s->peek_mark == kind) depth += s->peek_count;
				else if (others < 16) other[others++] = s->peek_mark;
				prev = C_PUNCT;
			} else if (s->peek_mark == '[') {
				brackets++;
				prev = C_PUNCT;
			}
			continue;
		}
		if (c == '\\') {
			adv(lexer);
			if (!at_eol(lexer)) adv(lexer);
			prev = C_PUNCT;
			first = false;
			continue;
		}
		if (c == '`') {
			unsigned n = 0;
			while (lexer->lookahead == '`') {
				adv(lexer);
				n++;
			}
			// a code span is skipped whole, an unclosed run is text
			while (!at_eol(lexer)) {
				if (lexer->lookahead != '`') {
					adv(lexer);
					continue;
				}
				unsigned m = 0;
				while (lexer->lookahead == '`') {
					adv(lexer);
					m++;
				}
				if (m == n) break;
			}
			prev = C_PUNCT;
			first = false;
			continue;
		}
		if (row && c == '|') return false;
		if (c == '<') {
			adv(lexer);
			int32_t d = lexer->lookahead;
			if (is_alpha(d) || d == '/' || d == '!') {
				while (!at_eol(lexer) && lexer->lookahead != '>') {
					int32_t q = lexer->lookahead;
					adv(lexer);
					if (q == '"' || q == '\'') {
						while (!at_eol(lexer) && lexer->lookahead != q) adv(lexer);
						if (lexer->lookahead == q) adv(lexer);
					}
				}
			}
			prev = C_PUNCT;
			first = false;
			continue;
		}
		if (c == '{') {
			adv(lexer);
			if (skip_expression(lexer)) adv(lexer);
			prev = C_PUNCT;
			first = false;
			continue;
		}
		if (c == '[') {
			brackets++;
		} else if (c == ']') {
			if (brackets > 0) brackets--;
			else if (enclosed) return false;
		}
		if (c != '*' && c != '_' && c != '~' && c != '^') {
			prev = classify(c);
			adv(lexer);
			first = false;
			continue;
		}
		if (c == mark && first) {
			// a run straight after the opener, `**` nests, `*****` alone is text
			adv(lexer);
			if (c == '~')
				while (lexer->lookahead == '~') adv(lexer);
			depth++;
			continue;
		}
		int32_t found = c;
		adv(lexer);
		if (c == '~' && lexer->lookahead == '~') {
			// a run of two or more is a strikethrough mark
			found = 'S';
			while (lexer->lookahead == '~') adv(lexer);
		}
		bool flanking = found != '~' && found != '^';
		uint8_t next = next_class(lexer);
		bool can_close = prev != C_WS && (!flanking || next != C_WORD);
		bool can_open = next != C_WS && (!flanking || prev != C_WORD);
		prev = C_PUNCT;
		if (found != kind) {
			if (can_close && others > 0 && other[others - 1] == found) others--;
			else if (can_open && others < 16) other[others++] = found;
			first = false;
			continue;
		}
		if (can_close && !first && brackets == 0 && others == 0) {
			if (--depth == 0) return true;
		} else if (can_open) {
			depth++;
		}
		first = false;
	}
}

// past `[`, the `]` that closes it within the paragraph, and for a link a `(` or `[` after it
static bool skip_label(TSLexer *lexer);

// a link destination, `<...>` on one line or a run with no whitespace and balanced parens
static bool scan_destination(TSLexer *lexer) {
	if (lexer->lookahead == '<') {
		adv(lexer);
		while (lexer->lookahead != '>') {
			if (at_eol(lexer) || lexer->lookahead == '<') return false;
			if (lexer->lookahead == '\\') adv(lexer);
			if (!at_eol(lexer)) adv(lexer);
		}
		adv(lexer);
		return true;
	}
	unsigned n = 0, parens = 0;
	while (!at_eol(lexer)) {
		int32_t c = lexer->lookahead;
		if (is_ws(c) || c < 0x20) break;
		if (c == '\\') {
			adv(lexer);
			n++;
			if (is_ascii_punct(lexer->lookahead)) adv(lexer);
			continue;
		}
		if (c == '(') {
			parens++;
		} else if (c == ')') {
			if (parens == 0) break;
			parens--;
		}
		adv(lexer);
		n++;
	}
	return n > 0 && parens == 0;
}

// a link title in quotes or parens, it may run over lines of the paragraph
static bool scan_title(Scanner *s, TSLexer *lexer, bool one_line) {
	int32_t close = lexer->lookahead == '(' ? ')' : lexer->lookahead;
	adv(lexer);
	for (;;) {
		if (lexer->eof(lexer)) return false;
		int32_t c = lexer->lookahead;
		if (is_eol_char(c)) {
			if (one_line || (s->flags & F_SINGLE_LINE)) return false;
			skip_newline(lexer);
			bool lazy;
			if (!paragraph_continues(s, lexer, &lazy)) return false;
			continue;
		}
		if (c == close) {
			adv(lexer);
			return true;
		}
		if (c == '(' && close == ')') return false;
		adv(lexer);
		if (c == '\\' && !at_eol(lexer)) adv(lexer);
	}
}

// spaces and at most one line ending inside `(...)`, whether there were any
static bool skip_link_space(Scanner *s, TSLexer *lexer, bool *ok) {
	bool any = false;
	*ok = true;
	while (is_ws(lexer->lookahead)) {
		adv(lexer);
		any = true;
	}
	if (is_eol_char(lexer->lookahead)) {
		if (s->flags & F_SINGLE_LINE) {
			*ok = false;
			return any;
		}
		skip_newline(lexer);
		skip_ws(lexer);
		if (at_eol(lexer)) *ok = false;
		any = true;
	}
	return any;
}

// past `(`, the rest of an inline link, a destination, a title, then `)`
static bool check_link_tail(Scanner *s, TSLexer *lexer) {
	bool ok;
	skip_link_space(s, lexer, &ok);
	if (!ok) return false;
	if (lexer->lookahead == ')') return true;
	// `("title")` is a destination, a title needs one before it
	if (!scan_destination(lexer)) return false;
	bool space = skip_link_space(s, lexer, &ok);
	if (!ok) return false;
	if (lexer->lookahead == ')') return true;
	int32_t c = lexer->lookahead;
	if (!space || (c != '"' && c != '\'' && c != '(')) return false;
	if (!scan_title(s, lexer, false)) return false;
	skip_link_space(s, lexer, &ok);
	return ok && lexer->lookahead == ')';
}

// a reference link, `[text][label]` or `[text][]`, needs a definition of its label above it
static bool find_bracket_close(Scanner *s, TSLexer *lexer, bool label) {
	unsigned depth = 1;
	Label text;
	label_init(&text);
	for (;;) {
		if (lexer->eof(lexer)) return false;
		int32_t c = lexer->lookahead;
		if (is_eol_char(c)) {
			if (s->flags & F_SINGLE_LINE) return false;
			skip_newline(lexer);
			bool lazy;
			if (!paragraph_continues(s, lexer, &lazy)) return false;
			label_add(&text, ' ');
			if (s->peek_mark == '[') depth++;
			continue;
		}
		adv(lexer);
		if (!(c == ']' && depth == 1)) label_add(&text, c);
		if (c == '\\') {
			if (!at_eol(lexer)) {
				label_add(&text, lexer->lookahead);
				adv(lexer);
			}
		} else if (c == '<') {
			int32_t d = lexer->lookahead;
			if (is_alpha(d) || d == '/' || d == '!') {
				while (!at_eol(lexer) && lexer->lookahead != '>') {
					int32_t q = lexer->lookahead;
					adv(lexer);
					if (q == '"' || q == '\'') {
						while (!at_eol(lexer) && lexer->lookahead != q) adv(lexer);
						if (lexer->lookahead == q) adv(lexer);
					}
				}
			}
		} else if (c == '`') {
			unsigned n = 1;
			while (lexer->lookahead == '`') {
				adv(lexer);
				n++;
			}
			while (!at_eol(lexer)) {
				if (lexer->lookahead != '`') {
					adv(lexer);
					continue;
				}
				unsigned m = 0;
				while (lexer->lookahead == '`') {
					adv(lexer);
					m++;
				}
				if (m == n) break;
			}
		} else if (c == '[') {
			depth++;
		} else if (c == ']') {
			if (--depth == 0) break;
		}
	}
	if (label) return true;
	if (lexer->lookahead == '[') {
		adv(lexer);
		if (lexer->lookahead == ']') return is_defined(s, &text);
		// a reference label holds no brackets
		Label ref;
		label_init(&ref);
		while (!at_eol(lexer) && lexer->lookahead != ']') {
			if (lexer->lookahead == '[') return false;
			if (lexer->lookahead == '\\') {
				label_add(&ref, '\\');
				adv(lexer);
			}
			if (at_eol(lexer)) break;
			label_add(&ref, lexer->lookahead);
			adv(lexer);
		}
		return lexer->lookahead == ']' && ref.started && is_defined(s, &ref);
	}
	if (lexer->lookahead != '(') return false;
	adv(lexer);
	return check_link_tail(s, lexer);
}

static bool check_tag_body(Scanner *s, TSLexer *lexer, bool close);

// past `<`, an open tag or a close tag with its `>`
static bool check_tag(Scanner *s, TSLexer *lexer) {
	bool close = lexer->lookahead == '/';
	if (close) adv(lexer);
	if (!is_alpha(lexer->lookahead)) return false;
	return check_tag_body(s, lexer, close);
}

// inside the name of an open tag, the rest of it
static bool check_tag_rest(Scanner *s, TSLexer *lexer) {
	return check_tag_body(s, lexer, false);
}

static bool check_tag_body(Scanner *s, TSLexer *lexer, bool close) {
	while (is_tag_name_char(lexer->lookahead)) adv(lexer);
	bool one_line = s->flags & F_SINGLE_LINE;
	for (;;) {
		if (lexer->eof(lexer)) return false;
		int32_t c = lexer->lookahead;
		if (c == '>') return true;
		if (is_eol_char(c)) {
			if (one_line) return false;
			skip_newline(lexer);
			skip_ws(lexer);
			if (at_eol(lexer)) return false;
			continue;
		}
		if (close && !is_ws(c)) return false;
		if (c == '/') {
			adv(lexer);
			return lexer->lookahead == '>';
		}
		if (c == '"' || c == '\'') {
			adv(lexer);
			while (lexer->lookahead != c) {
				if (lexer->eof(lexer)) return false;
				adv(lexer);
			}
			adv(lexer);
			continue;
		}
		if (c == '{') {
			adv(lexer);
			if (!skip_expression(lexer)) return false;
			adv(lexer);
			continue;
		}
		if (c == '<') return false;
		adv(lexer);
	}
}

static bool emit_zero(Scanner *s, TSLexer *lexer, enum TokenType token, uint32_t col) {
	s->flags &= ~F_LINE_START;
	s->prev_char = ' ';
	s->last_col = col;
	lexer->result_symbol = token;
	return true;
}

// a line start holds no block, the next call reads it from its first char,
// in a table such a line is the next row
static int no_block(Scanner *s, TSLexer *lexer, const bool *valid, uint32_t col,
                    bool advanced) {
	if (valid[TABLE_ROW_START]) {
		s->flags |= F_IN_ROW | F_SINGLE_LINE;
		return emit_zero(s, lexer, TABLE_ROW_START, col);
	}
	if (!advanced) return -1;
	return emit_zero(s, lexer, INDENT, col);
}

// the rest of a line that holds a `|`, and the next line a delimiter row, start a table
static bool check_table(Scanner *s, TSLexer *lexer, bool pipe) {
	while (!at_eol(lexer)) {
		if (lexer->lookahead == '\\') {
			adv(lexer);
			if (!at_eol(lexer)) adv(lexer);
			continue;
		}
		if (lexer->lookahead == '|') pipe = true;
		adv(lexer);
	}
	if (!pipe || lexer->eof(lexer)) return false;
	skip_newline(lexer);
	for (unsigned i = 0; i < s->open.size; i++) {
		skip_ws(lexer);
		if (s->open.contents[i].type == QUOTE) {
			if (lexer->lookahead != '>') return false;
			adv(lexer);
		}
	}
	skip_ws(lexer);
	bool delimiter_pipe = false;
	if (lexer->lookahead == '|') {
		adv(lexer);
		delimiter_pipe = true;
		skip_ws(lexer);
	}
	for (;;) {
		if (lexer->lookahead == ':') adv(lexer);
		if (lexer->lookahead != '-') return false;
		while (lexer->lookahead == '-') adv(lexer);
		if (lexer->lookahead == ':') adv(lexer);
		skip_ws(lexer);
		if (at_eol(lexer)) return delimiter_pipe;
		if (lexer->lookahead != '|') return false;
		delimiter_pipe = true;
		adv(lexer);
		if (lexer->lookahead == '|') adv(lexer);
		skip_ws(lexer);
		if (at_eol(lexer)) return true;
	}
}

static int scan_code_line(Scanner *s, TSLexer *lexer, const bool *valid) {
	lexer->mark_end(lexer);
	if (lexer->eof(lexer)) return -1;
	skip_ws(lexer);
	unsigned ticks = 0;
	while (lexer->lookahead == '`') {
		adv(lexer);
		ticks++;
	}
	if (valid[FENCE_CLOSE] && ticks >= s->fence_len) {
		lexer->mark_end(lexer);
		skip_ws(lexer);
		if (at_eol(lexer)) {
			s->fence_len = 0;
			s->flags &= ~F_LINE_START;
			lexer->result_symbol = FENCE_CLOSE;
			return 1;
		}
	}
	if (!valid[CODE_LINE]) return 0;
	while (!at_eol(lexer)) adv(lexer);
	skip_newline(lexer);
	lexer->mark_end(lexer);
	start_line(s, 0);
	lexer->result_symbol = CODE_LINE;
	return 1;
}

// a line of three dashes and nothing else
static bool check_dashes_line(TSLexer *lexer) {
	unsigned n = 0;
	while (lexer->lookahead == '-') {
		adv(lexer);
		n++;
	}
	if (n != 3) return false;
	skip_ws(lexer);
	return at_eol(lexer);
}

static int scan_frontmatter_body(Scanner *s, TSLexer *lexer, const bool *valid) {
	bool any = false;
	for (;;) {
		lexer->mark_end(lexer);
		if (lexer->lookahead == '-') {
			if (check_dashes_line(lexer)) {
				if (any) {
					lexer->result_symbol = FRONTMATTER_CONTENT;
					start_line(s, 0);
					s->flags |= F_IMPORT_LINE;
					return 1;
				}
				if (!valid[FRONTMATTER_CLOSE]) return 0;
				lexer->mark_end(lexer);
				s->flags &= ~F_LINE_START;
				s->flags |= F_IMPORT_LINE;
				lexer->result_symbol = FRONTMATTER_CLOSE;
				return 1;
			}
		}
		if (lexer->eof(lexer)) {
			if (!any || !valid[FRONTMATTER_CONTENT]) return 0;
			lexer->mark_end(lexer);
			lexer->result_symbol = FRONTMATTER_CONTENT;
			return 1;
		}
		while (!at_eol(lexer)) adv(lexer);
		skip_newline(lexer);
		any = true;
		if (!valid[FRONTMATTER_CONTENT]) return 0;
	}
}

// past `import`, a whole import statement, up to its module string and an optional `;`
static bool scan_import(TSLexer *lexer) {
	unsigned lines = 0;
	for (;;) {
		if (lexer->eof(lexer)) return false;
		int32_t c = lexer->lookahead;
		if (c == '"' || c == '\'') {
			adv(lexer);
			while (lexer->lookahead != c) {
				if (at_eol(lexer)) return false;
				if (lexer->lookahead == '\\') adv(lexer);
				adv(lexer);
			}
			adv(lexer);
			skip_ws(lexer);
			if (lexer->lookahead == ';') {
				adv(lexer);
				skip_ws(lexer);
			}
			if (at_eol(lexer)) return true;
			continue;
		}
		if (is_eol_char(c)) {
			if (++lines > 64) return false;
			skip_newline(lexer);
			skip_ws(lexer);
			if (at_eol(lexer)) return false;
			continue;
		}
		adv(lexer);
	}
}

// at a line start, every container matched, the block the line starts
// returns 1 for a token, 0 for none, -1 when the line is inline content read from here
static int scan_line_start(Scanner *s, TSLexer *lexer, const bool *valid,
                           uint32_t col) {
	if (valid[FENCE_CLOSE] || valid[CODE_LINE]) return scan_code_line(s, lexer, valid);
	if (valid[FRONTMATTER_CONTENT] || valid[FRONTMATTER_CLOSE])
		return scan_frontmatter_body(s, lexer, valid);

	bool table = valid[TABLE_ROW_START];
	if (!valid[BLANK_LINE] && !table) return -1;

	int32_t c = lexer->lookahead;
	if (lexer->eof(lexer)) return -1;

	if (is_ws(c) || is_eol_char(c)) {
		unsigned n = 0, cols = 0;
		while (is_ws(lexer->lookahead)) {
			cols += lexer->lookahead == '\t' ? 4 - cols % 4 : 1;
			adv(lexer);
			n++;
		}
		if (at_eol(lexer)) {
			if (!valid[BLANK_LINE]) return 0;
			skip_newline(lexer);
			lexer->mark_end(lexer);
			// a blank line keeps imports allowed
			uint8_t imports = s->flags & F_IMPORTS;
			end_line(s);
			s->flags |= imports;
			start_line(s, 0);
			lexer->result_symbol = BLANK_LINE;
			return 1;
		}
		lexer->mark_end(lexer);
		s->indent_ws = (uint8_t)(cols > 255 ? 255 : s->indent_ws + cols);
		continue_line(s, col + n);
		lexer->result_symbol = INDENT;
		return 1;
	}

	// imports belong to the top of the document, before any other content
	if (c != 'i' || s->open.size > 0) s->flags &= ~F_IMPORTS;

	lexer->mark_end(lexer);
	bool advanced = true;

	switch (c) {
	case '-':
	case '*':
	case '+':
	case '_': {
		adv(lexer);
		int marker = c == '-'   ? LIST_MARKER_MINUS
		             : c == '+' ? LIST_MARKER_PLUS
		             : c == '*' ? LIST_MARKER_STAR
		                        : -1;
		if (marker >= 0 && is_ws(lexer->lookahead)) {
			unsigned spaces = 0;
			while (is_ws(lexer->lookahead)) {
				adv(lexer);
				spaces++;
			}
			if (at_eol(lexer)) return no_block(s, lexer, valid, col, advanced);
			bool list = valid[marker];
			if (list) lexer->mark_end(lexer);
			unsigned marks = 1;
			while (lexer->lookahead == c || is_ws(lexer->lookahead)) {
				if (lexer->lookahead == c) marks++;
				adv(lexer);
			}
			if (at_eol(lexer) && marks >= 3 && valid[THEMATIC_BREAK]) {
				lexer->mark_end(lexer);
				return emit_zero(s, lexer, THEMATIC_BREAK, col);
			}
			if (list) {
				push_block(s, LIST_ITEM, s->indent_ws + 1 + (spaces > 4 ? 1 : spaces));
				continue_line(s, col + 1 + spaces);
				s->indent_ws = 0;
				lexer->result_symbol = marker;
				return 1;
			}
			return no_block(s, lexer, valid, col, advanced);
		}
		unsigned marks = 1;
		bool spaced = false;
		while (lexer->lookahead == c || is_ws(lexer->lookahead)) {
			if (lexer->lookahead == c) marks++;
			else spaced = true;
			adv(lexer);
		}
		if (!at_eol(lexer) || marks < 3 || c == '+') break;
		if (c == '-' && marks == 3 && !spaced && valid[FRONTMATTER_OPEN]) {
			lexer->mark_end(lexer);
			skip_newline(lexer);
			for (;;) {
				if (lexer->eof(lexer)) break;
				if (check_dashes_line(lexer)) {
					s->flags &= ~F_LINE_START;
					s->flags |= F_IMPORT_LINE | F_IMPORTS;
					lexer->result_symbol = FRONTMATTER_OPEN;
					return 1;
				}
				while (!at_eol(lexer)) adv(lexer);
				skip_newline(lexer);
			}
			// no closing line, so it is a thematic break
			if (!valid[THEMATIC_BREAK]) return 0;
			return emit_zero(s, lexer, THEMATIC_BREAK, col);
		}
		if (!valid[THEMATIC_BREAK]) return no_block(s, lexer, valid, col, advanced);
		lexer->mark_end(lexer);
		return emit_zero(s, lexer, THEMATIC_BREAK, col);
	}

	case '>': {
		if (!valid[BLOCK_QUOTE_MARKER]) break;
		adv(lexer);
		unsigned n = 1;
		if (is_ws(lexer->lookahead)) {
			adv(lexer);
			n++;
		}
		lexer->mark_end(lexer);
		push_block(s, QUOTE, 0);
		continue_line(s, col + n);
		s->indent_ws = 0;
		lexer->result_symbol = BLOCK_QUOTE_MARKER;
		return 1;
	}

	case '#': {
		unsigned level = 0;
		while (lexer->lookahead == '#' && level < 7) {
			adv(lexer);
			level++;
		}
		if (level > 6 || !(is_ws(lexer->lookahead) || at_eol(lexer))) break;
		if (!valid[ATX_H1 + level - 1]) break;
		lexer->mark_end(lexer);
		s->flags |= F_SINGLE_LINE;
		return emit_zero(s, lexer, ATX_H1 + level - 1, col + level);
	}

	case '`': {
		unsigned ticks = 0;
		while (lexer->lookahead == '`') {
			adv(lexer);
			ticks++;
		}
		if (ticks < 3 || !valid[FENCE_OPEN]) break;
		lexer->mark_end(lexer);
		s->fence_len = (uint8_t)(ticks > 255 ? 255 : ticks);
		return emit_zero(s, lexer, FENCE_OPEN, col + ticks);
	}

	case '[': {
		adv(lexer);
		if (lexer->lookahead == '^') {
			adv(lexer);
			unsigned n = check_footnote_label(lexer);
			if (n > 0 && valid[FOOTNOTE_DEFINITION_START]) {
				// the line after `]:` is a line start, any block may follow there
				push_block(s, FOOTNOTE, s->indent_ws + 4);
				continue_line(s, col + n + 4);
				s->indent_ws = 0;
				lexer->result_symbol = FOOTNOTE_DEFINITION_START;
				return 1;
			}
			break;
		}
		int32_t first = lexer->lookahead;
		unsigned n = 0;
		Label label;
		label_init(&label);
		while (!at_eol(lexer) && lexer->lookahead != ']' && lexer->lookahead != '[') {
			if (lexer->lookahead == '\\') {
				label_add(&label, '\\');
				adv(lexer);
				n++;
				if (at_eol(lexer)) break;
			}
			label_add(&label, lexer->lookahead);
			adv(lexer);
			n++;
		}
		if (lexer->lookahead != ']') break;
		adv(lexer);
		if (n == 1 && (first == ' ' || first == 'x' || first == 'X') &&
		    valid[TASK_UNCHECKED]) {
			if (!is_ws(lexer->lookahead)) break;
			// the marker alone on its line is text
			lexer->mark_end(lexer);
			skip_ws(lexer);
			s->flags &= ~F_LINE_START;
			s->prev_char = ']';
			s->last_col = col + 3;
			lexer->result_symbol = at_eol(lexer)        ? TEXT
			                       : first == ' ' ? TASK_UNCHECKED
			                                      : TASK_CHECKED;
			return 1;
		}
		if (lexer->lookahead == ':' && label.started && !table &&
		    valid[LINK_REFERENCE_DEFINITION_START]) {
			// at the top level the destination and the title may each start the next line,
			// in a container a definition is one line
			bool top = s->open.size == 0;
			adv(lexer);
			skip_ws(lexer);
			if (top && is_eol_char(lexer->lookahead)) {
				skip_newline(lexer);
				skip_ws(lexer);
			}
			if (!scan_destination(lexer)) break;
			bool space = is_ws(lexer->lookahead);
			skip_ws(lexer);
			int32_t q = lexer->lookahead;
			if (space && (q == '"' || q == '\'' || q == '(')) {
				if (!scan_title(s, lexer, !top)) break;
				skip_ws(lexer);
				if (!at_eol(lexer)) break;
			} else if (!at_eol(lexer)) {
				break;
			} else if (top && !lexer->eof(lexer)) {
				// a title on the next line belongs to the definition when nothing follows it
				skip_newline(lexer);
				skip_ws(lexer);
				q = lexer->lookahead;
				if ((q == '"' || q == '\'' || q == '(') && scan_title(s, lexer, false)) {
					skip_ws(lexer);
					if (at_eol(lexer)) s->flags |= F_DEFINITION_TITLE;
				}
			}
			uint16_t key = label_key(&label);
			if (!is_defined(s, &label) && s->definitions.size < MAX_DEFINITIONS)
				array_push(&s->definitions, key);
			return emit_zero(s, lexer, LINK_REFERENCE_DEFINITION_START, col);
		}
		break;
	}

	case ':': {
		unsigned n = 0;
		while (lexer->lookahead == ':') {
			adv(lexer);
			n++;
		}
		// a close line has as many colons as the open line of the innermost directive
		if (n >= 3) {
			if (is_ws(lexer->lookahead) || at_eol(lexer)) {
				skip_ws(lexer);
				if (!at_eol(lexer)) break;
				if (valid[CONTAINER_DIRECTIVE_CLOSE] && s->directives.size >= 2 &&
				    s->directives.contents[s->directives.size - 2] == n) {
					s->directives.size -= 2;
					return emit_zero(s, lexer, CONTAINER_DIRECTIVE_CLOSE, col);
				}
				break;
			}
			if (valid[CONTAINER_DIRECTIVE_OPEN] && n < 256 && check_directive_rest(lexer)) {
				if (s->directives.size < 64) {
					array_push(&s->directives, (uint8_t)n);
					array_push(&s->directives, (uint8_t)s->open.size);
				}
				return emit_zero(s, lexer, CONTAINER_DIRECTIVE_OPEN, col);
			}
		} else if (n == 2 && valid[LEAF_DIRECTIVE_START] && check_directive_rest(lexer)) {
			return emit_zero(s, lexer, LEAF_DIRECTIVE_START, col);
		}
		break;
	}

	case '{': {
		int kind = check_svelte_line(lexer);
		if (kind != 0 && valid[kind]) return emit_zero(s, lexer, kind, col);
		break;
	}

	case '<':
		if (valid[HTML_BLOCK_START] && check_block_tag(lexer)) {
			s->flags |= F_SINGLE_LINE;
			return emit_zero(s, lexer, HTML_BLOCK_START, col);
		}
		break;

	case 'i': {
		if (!(valid[IMPORT_STATEMENT] && (s->flags & F_IMPORTS) && s->open.size == 0)) {
			s->flags &= ~F_IMPORTS;
			advanced = false;
			break;
		}
		const char *word = "import";
		for (unsigned i = 0; word[i]; i++) {
			if (lexer->lookahead != word[i]) {
				s->flags &= ~F_IMPORTS;
				goto done;
			}
			adv(lexer);
		}
		int32_t next = lexer->lookahead;
		if ((is_ws(next) || next == '{' || next == '*' || next == '"' || next == '\'') &&
		    scan_import(lexer)) {
			// the token keeps the spaces after the statement
			lexer->mark_end(lexer);
			s->flags &= ~F_LINE_START;
			s->flags |= F_IMPORT_LINE;
			lexer->result_symbol = IMPORT_STATEMENT;
			return 1;
		}
		s->flags &= ~F_IMPORTS;
		break;
	}

	default:
		if (is_digit(c)) {
			unsigned digits = 0;
			while (is_digit(lexer->lookahead) && digits < 10) {
				adv(lexer);
				digits++;
			}
			int32_t delimiter = lexer->lookahead;
			if (digits > 9 || (delimiter != '.' && delimiter != ')')) break;
			int marker = delimiter == '.' ? LIST_MARKER_DOT : LIST_MARKER_PARENTHESIS;
			adv(lexer);
			if (!is_ws(lexer->lookahead) || !valid[marker]) break;
			unsigned spaces = 0;
			while (is_ws(lexer->lookahead)) {
				adv(lexer);
				spaces++;
			}
			if (at_eol(lexer)) break;
			lexer->mark_end(lexer);
			push_block(s, LIST_ITEM, s->indent_ws + digits + 1 + (spaces > 4 ? 1 : spaces));
			continue_line(s, col + digits + 1 + spaces);
			s->indent_ws = 0;
			lexer->result_symbol = marker;
			return 1;
		}
		advanced = false;
	}

done:
	if (valid[TABLE_START] && !table && check_table(s, lexer, false)) {
		s->flags |= F_IN_ROW | F_SINGLE_LINE;
		return emit_zero(s, lexer, TABLE_START, col);
	}
	// the table check reads the line too, the inline call has to start over
	if (valid[TABLE_START] && !table) advanced = true;
	return no_block(s, lexer, valid, col, advanced);
}

// the prefix of the next open container, or its close when the line does not carry it
static bool scan_continuation(Scanner *s, TSLexer *lexer, const bool *valid,
                              uint32_t col) {
	Block b = s->open.contents[s->matched];
	lexer->mark_end(lexer);
	if (!lexer->eof(lexer)) {
		unsigned n = 0;
		if (b.type == QUOTE) {
			while (is_ws(lexer->lookahead)) {
				adv(lexer);
				n++;
			}
			if (lexer->lookahead == '>') {
				adv(lexer);
				n++;
				if (is_ws(lexer->lookahead)) {
					adv(lexer);
					n++;
				}
				lexer->mark_end(lexer);
				s->matched++;
				continue_line(s, col + n);
				s->indent_ws = 0;
				lexer->result_symbol = BLOCK_CONTINUATION;
				return true;
			}
		} else {
			unsigned cols = 0;
			while (is_ws(lexer->lookahead) && cols < b.indent) {
				cols += lexer->lookahead == '\t' ? 4 - cols % 4 : 1;
				adv(lexer);
				n++;
			}
			if (cols >= b.indent) {
				lexer->mark_end(lexer);
				s->matched++;
				continue_line(s, col + n);
				s->indent_ws = (uint8_t)(cols - b.indent);
				lexer->result_symbol = INDENT;
				return true;
			}
			skip_ws(lexer);
			// a blank line, or a paragraph going on lazily, keeps the item open
			if (at_eol(lexer) || (s->flags & F_LAZY)) {
				s->matched++;
				lexer->result_symbol = INDENT;
				return true;
			}
		}
	}
	if (!valid[BLOCK_CLOSE]) return false;
	array_pop(&s->open);
	drop_directives(s);
	lexer->result_symbol = BLOCK_CLOSE;
	return true;
}

// text up to the next char that may start a construct, the first char always taken
static bool scan_text(Scanner *s, TSLexer *lexer, uint32_t col, unsigned n,
                      int32_t last) {
	bool row = s->flags & F_IN_ROW;
	if (n == 0) {
		last = lexer->lookahead;
		adv(lexer);
		n = 1;
	}
	for (;;) {
		if (lexer->eof(lexer)) break;
		int32_t c = lexer->lookahead;
		switch (c) {
		case '\n':
		case '\r':
		case '\\':
		case '*':
		case '_':
		case '~':
		case '^':
		case '`':
		case '$':
		case '[':
		case ']':
		case '!':
		case '<':
		case '{':
		case '&':
		case ':':
			goto end;
		case '|':
			if (row) goto end;
			break;
		default:
			break;
		}
		last = c;
		adv(lexer);
		n++;
	}
end:
	lexer->mark_end(lexer);
	s->prev_char = last;
	s->last_col = col + n;
	lexer->result_symbol = TEXT;
	return true;
}

// literal chars already marked, the run ends at the mark
static bool emit_text(Scanner *s, TSLexer *lexer, uint32_t col, unsigned n,
                      int32_t last) {
	s->prev_char = last;
	s->last_col = col + n;
	lexer->result_symbol = TEXT;
	return true;
}

static bool scan_line_ending(Scanner *s, TSLexer *lexer, const bool *valid,
                             uint32_t col) {
	if (lexer->eof(lexer)) {
		if (!valid[LINE_ENDING]) return false;
		lexer->mark_end(lexer);
		end_line(s);
		start_line(s, col);
		lexer->result_symbol = LINE_ENDING;
		return true;
	}
	skip_newline(lexer);
	lexer->mark_end(lexer);
	if (valid[SOFT_LINE_ENDING] && !(s->flags & F_SINGLE_LINE)) {
		bool lazy;
		if (paragraph_continues(s, lexer, &lazy)) {
			start_line(s, 0);
			if (lazy) s->flags |= F_LAZY;
			lexer->result_symbol = SOFT_LINE_ENDING;
			return true;
		}
	}
	if (!valid[LINE_ENDING]) return false;
	end_line(s);
	start_line(s, 0);
	lexer->result_symbol = LINE_ENDING;
	return true;
}

static bool scan_delimiter(Scanner *s, TSLexer *lexer, const bool *valid,
                           uint32_t col, uint8_t prev) {
	int32_t mark = lexer->lookahead;
	unsigned len = 1;
	adv(lexer);
	enum TokenType open_token, close_token;
	switch (mark) {
	case '_':
		open_token = EMPHASIS_OPEN;
		close_token = EMPHASIS_CLOSE;
		break;
	case '*':
		open_token = STRONG_OPEN;
		close_token = STRONG_CLOSE;
		break;
	case '^':
		open_token = SUPERSCRIPT_OPEN;
		close_token = SUPERSCRIPT_CLOSE;
		break;
	default:
		if (lexer->lookahead == '~') {
			adv(lexer);
			len = 2;
			open_token = STRIKETHROUGH_OPEN;
			close_token = STRIKETHROUGH_CLOSE;
		} else {
			open_token = SUBSCRIPT_OPEN;
			close_token = SUBSCRIPT_CLOSE;
		}
	}
	lexer->mark_end(lexer);
	s->prev_char = mark;
	s->last_col = col + len;
	// `_`, `*` and `~~` open after whitespace or punctuation and close before it,
	// `~` and `^` only need text on their inner side
	bool flanking = mark == '*' || mark == '_' || len == 2;
	uint8_t next = next_class(lexer);
	bool can_open = next != C_WS && (!flanking || prev != C_WORD);
	bool can_close = prev != C_WS && (!flanking || next != C_WORD);
	if (can_close && valid[close_token]) {
		lexer->result_symbol = close_token;
		return true;
	}
	if (can_open && valid[open_token] && find_closer(s, lexer, mark, len)) {
		lexer->result_symbol = open_token;
		return true;
	}
	lexer->result_symbol = TEXT;
	return true;
}

// inside a code span, its content up to the closing run, or the closing run
static bool scan_code_inner(Scanner *s, TSLexer *lexer, const bool *valid) {
	bool any = false;
	for (;;) {
		lexer->mark_end(lexer);
		if (lexer->eof(lexer)) break;
		if (lexer->lookahead != '`') {
			adv(lexer);
			any = true;
			continue;
		}
		unsigned n = 0;
		while (lexer->lookahead == '`') {
			adv(lexer);
			n++;
		}
		if (n == s->ticks) {
			if (any) break;
			lexer->mark_end(lexer);
			if (!valid[CODE_SPAN_CLOSE]) return false;
			s->ticks = 0;
			s->prev_char = '`';
			s->last_col = lexer->get_column(lexer);
			lexer->result_symbol = CODE_SPAN_CLOSE;
			return true;
		}
		any = true;
	}
	if (!any || !valid[CODE_SPAN_CONTENT]) return false;
	lexer->result_symbol = CODE_SPAN_CONTENT;
	return true;
}

static bool scan_raw_text(Scanner *s, TSLexer *lexer) {
	const char *name = s->raw_tag > 0 && s->raw_tag <= 4 ? RAW_TAGS[s->raw_tag - 1] : "script";
	bool any = false;
	for (;;) {
		lexer->mark_end(lexer);
		if (lexer->eof(lexer)) break;
		if (lexer->lookahead == '<') {
			adv(lexer);
			if (lexer->lookahead == '/') {
				adv(lexer);
				unsigned i = 0;
				while (name[i]) {
					int32_t c = lexer->lookahead;
					if ((c >= 'A' && c <= 'Z' ? c + 32 : c) != name[i]) break;
					adv(lexer);
					i++;
				}
				if (!name[i] && (is_ws(lexer->lookahead) || lexer->lookahead == '>' ||
				                 at_eol(lexer)))
					break;
			}
			any = true;
			continue;
		}
		adv(lexer);
		any = true;
	}
	if (!any) return false;
	lexer->result_symbol = RAW_TEXT;
	return true;
}

static bool scan_inline(Scanner *s, TSLexer *lexer, const bool *valid) {
	int32_t c = lexer->lookahead;

	if (valid[RAW_TEXT]) return scan_raw_text(s, lexer);

	if (valid[EXPRESSION_CONTENT] && c != '}') {
		if (!skip_expression(lexer)) return false;
		lexer->mark_end(lexer);
		lexer->result_symbol = EXPRESSION_CONTENT;
		return true;
	}

	if ((valid[TAG_NAME] || valid[RAW_TAG_NAME]) && is_alpha(c)) {
		char name[16];
		read_name(lexer, name, sizeof(name));
		lexer->mark_end(lexer);
		int raw = raw_tag_index(name);
		if (raw && valid[RAW_TAG_NAME]) {
			s->raw_tag = (uint8_t)raw;
			lexer->result_symbol = RAW_TAG_NAME;
			return true;
		}
		if (!valid[TAG_NAME]) return false;
		lexer->result_symbol = TAG_NAME;
		return true;
	}

	if (valid[CODE_SPAN_CONTENT] || valid[CODE_SPAN_CLOSE])
		return scan_code_inner(s, lexer, valid);

	if (valid[LINK_DESTINATION] && !is_ws(c) && !at_eol(lexer) && c != ')') {
		if (!scan_destination(lexer)) return false;
		lexer->mark_end(lexer);
		s->last_col = lexer->get_column(lexer);
		s->prev_char = '>';
		lexer->result_symbol = LINK_DESTINATION;
		return true;
	}

	bool ends = valid[LINE_ENDING] || valid[SOFT_LINE_ENDING];
	if (!valid[TEXT] && !ends && !valid[ARGS_OPEN] && !valid[MATH_CLOSE] &&
	    !valid[CODE_SPAN_OPEN] && !valid[BRACKET_OPEN])
		return false;

	uint32_t col = lexer->get_column(lexer);
	uint8_t prev = col == s->last_col ? classify(s->prev_char) : C_PUNCT;

	// the line ending after the destination of a definition, its title is on the next line
	if ((s->flags & F_DEFINITION_TITLE) && !valid[TEXT] && col == s->last_col &&
	    (is_ws(c) || is_eol_char(c)))
		return false;

	if (valid[ARGS_OPEN] && c == '(') {
		adv(lexer);
		skip_ws(lexer);
		lexer->mark_end(lexer);
		uint32_t end = lexer->get_column(lexer);
		if (scan_args_body(lexer)) {
			s->prev_char = '(';
			s->last_col = end;
			lexer->result_symbol = ARGS_OPEN;
			return true;
		}
		if (!valid[TEXT]) return false;
		return emit_text(s, lexer, col, end - col, '(');
	}

	if (valid[MATH_CLOSE] && c == '$') {
		adv(lexer);
		lexer->mark_end(lexer);
		s->prev_char = '$';
		s->last_col = col + 1;
		lexer->result_symbol = MATH_CLOSE;
		return true;
	}

	if (ends && (is_ws(c) || is_eol_char(c) || lexer->eof(lexer))) {
		lexer->mark_end(lexer);
		unsigned n = 0;
		while (is_ws(lexer->lookahead)) {
			adv(lexer);
			n++;
		}
		if (at_eol(lexer)) return scan_line_ending(s, lexer, valid, col + n);
		if (!valid[TEXT]) return false;
		return scan_text(s, lexer, col, n, ' ');
	}

	if (c == '`' && (valid[CODE_SPAN_OPEN] || valid[TEXT])) {
		unsigned n = 0;
		while (lexer->lookahead == '`') {
			adv(lexer);
			n++;
		}
		lexer->mark_end(lexer);
		s->prev_char = '`';
		s->last_col = col + n;
		if (valid[CODE_SPAN_OPEN] && n < 256 && find_code_close(s, lexer, n, false)) {
			s->ticks = (uint8_t)n;
			lexer->result_symbol = CODE_SPAN_OPEN;
			return true;
		}
		if (!valid[TEXT]) return false;
		lexer->result_symbol = TEXT;
		return true;
	}

	// the text of a directive, no link may follow its `]`
	if (c == '[' && valid[BRACKET_OPEN] && !valid[TEXT]) {
		adv(lexer);
		lexer->mark_end(lexer);
		if (!find_bracket_close(s, lexer, true)) return false;
		if (s->brackets.size < MAX_DEPTH) array_push(&s->brackets, 0);
		s->prev_char = '[';
		s->last_col = col + 1;
		lexer->result_symbol = BRACKET_OPEN;
		return true;
	}

	if (!valid[TEXT] || lexer->eof(lexer)) return false;

	switch (c) {
	case '\\':
		adv(lexer);
		if (is_eol_char(lexer->lookahead)) {
			lexer->mark_end(lexer);
			if (valid[HARD_LINE_BREAK] && !(s->flags & F_SINGLE_LINE)) {
				skip_newline(lexer);
				bool lazy;
				if (paragraph_continues(s, lexer, &lazy)) {
					s->prev_char = ' ';
					s->last_col = col + 1;
					lexer->result_symbol = HARD_LINE_BREAK;
					return true;
				}
			}
			return emit_text(s, lexer, col, 1, '\\');
		}
		if (is_ascii_punct(lexer->lookahead)) return false;
		return scan_text(s, lexer, col, 1, '\\');

	case '*':
	case '_':
	case '~':
	case '^':
		return scan_delimiter(s, lexer, valid, col, prev);

	case '$':
		adv(lexer);
		lexer->mark_end(lexer);
		if (lexer->lookahead == '`' && valid[MATH_OPEN]) {
			unsigned n = 0;
			while (lexer->lookahead == '`') {
				adv(lexer);
				n++;
			}
			if (find_code_close(s, lexer, n, true) && lexer->lookahead == '$') {
				s->prev_char = '$';
				s->last_col = col + 1;
				lexer->result_symbol = MATH_OPEN;
				return true;
			}
		}
		return emit_text(s, lexer, col, 1, '$');

	case '[':
		adv(lexer);
		lexer->mark_end(lexer);
		if (lexer->lookahead == '^') {
			adv(lexer);
			unsigned n = 0;
			while (!at_eol(lexer) && !is_ws(lexer->lookahead) &&
			       lexer->lookahead != '[' && lexer->lookahead != ']' &&
			       lexer->lookahead != '^') {
				adv(lexer);
				n++;
			}
			if (n > 0 && lexer->lookahead == ']') return false;
		} else if (valid[BRACKET_OPEN] && find_bracket_close(s, lexer, false)) {
			if (s->brackets.size < MAX_DEPTH) array_push(&s->brackets, 0);
			s->prev_char = '[';
			s->last_col = col + 1;
			lexer->result_symbol = BRACKET_OPEN;
			return true;
		}
		if (s->brackets.size > 0 && s->brackets.contents[s->brackets.size - 1] < 255)
			s->brackets.contents[s->brackets.size - 1]++;
		return emit_text(s, lexer, col, 1, '[');

	case ']':
		adv(lexer);
		lexer->mark_end(lexer);
		if (s->brackets.size > 0) {
			uint8_t *top = &s->brackets.contents[s->brackets.size - 1];
			if (*top == 0 && valid[BRACKET_CLOSE]) {
				array_pop(&s->brackets);
				s->prev_char = ']';
				s->last_col = col + 1;
				lexer->result_symbol = BRACKET_CLOSE;
				return true;
			}
			if (*top > 0) (*top)--;
		}
		return emit_text(s, lexer, col, 1, ']');

	case '!':
		adv(lexer);
		lexer->mark_end(lexer);
		if (lexer->lookahead != '[' || !valid[IMAGE_OPEN])
			return emit_text(s, lexer, col, 1, '!');
		adv(lexer);
		lexer->mark_end(lexer);
		if (find_bracket_close(s, lexer, false)) {
			if (s->brackets.size < MAX_DEPTH) array_push(&s->brackets, 0);
			s->prev_char = '[';
			s->last_col = col + 2;
			lexer->result_symbol = IMAGE_OPEN;
			return true;
		}
		if (s->brackets.size > 0 && s->brackets.contents[s->brackets.size - 1] < 255)
			s->brackets.contents[s->brackets.size - 1]++;
		return emit_text(s, lexer, col, 2, '[');

	case ':':
		adv(lexer);
		lexer->mark_end(lexer);
		if (valid[INLINE_DIRECTIVE_MARKER] && is_alpha(lexer->lookahead)) {
			while (is_alnum(lexer->lookahead) || lexer->lookahead == '_' ||
			       lexer->lookahead == '-')
				adv(lexer);
			if (lexer->lookahead != '[') return emit_text(s, lexer, col, 1, ':');
			adv(lexer);
			if (find_bracket_close(s, lexer, true)) {
				s->prev_char = ':';
				s->last_col = col + 1;
				lexer->result_symbol = INLINE_DIRECTIVE_MARKER;
				return true;
			}
		}
		return emit_text(s, lexer, col, 1, ':');

	case '<':
		adv(lexer);
		lexer->mark_end(lexer);
		if (lexer->lookahead == '!') {
			adv(lexer);
			if (lexer->lookahead == '-') {
				adv(lexer);
				if (lexer->lookahead == '-') {
					// the grammar owns the comment token, only check it ends
					unsigned dashes = 0;
					adv(lexer);
					for (;;) {
						if (lexer->eof(lexer)) break;
						int32_t d = lexer->lookahead;
						if (d == '>' && dashes >= 2) return false;
						dashes = d == '-' ? dashes + 1 : 0;
						adv(lexer);
					}
				}
			}
			return emit_text(s, lexer, col, 1, '<');
		}
		if (is_alpha(lexer->lookahead)) {
			// an autolink is a scheme, a colon, then no whitespace and no `<` up to `>`,
			// and `<svelte:head>` is a tag
			char scheme[8];
			unsigned n = 0;
			while (is_alnum(lexer->lookahead) || lexer->lookahead == '+' ||
			       lexer->lookahead == '.' || lexer->lookahead == '-') {
				int32_t d = lexer->lookahead;
				if (n < 7) scheme[n] = (char)(d >= 'A' && d <= 'Z' ? d + 32 : d);
				adv(lexer);
				n++;
			}
			scheme[n < 7 ? n : 7] = 0;
			if (n >= 2 && n <= 32 && lexer->lookahead == ':' && strcmp(scheme, "svelte") != 0) {
				adv(lexer);
				while (!lexer->eof(lexer) && !is_ws(lexer->lookahead) &&
				       !is_eol_char(lexer->lookahead) && lexer->lookahead != '<' &&
				       lexer->lookahead != '>')
					adv(lexer);
				if (lexer->lookahead == '>' && valid[URI_AUTOLINK]) {
					adv(lexer);
					lexer->mark_end(lexer);
					s->prev_char = '>';
					s->last_col = lexer->get_column(lexer);
					lexer->result_symbol = URI_AUTOLINK;
					return true;
				}
				return emit_text(s, lexer, col, 1, '<');
			}
			if (check_tag_rest(s, lexer)) return false;
			return emit_text(s, lexer, col, 1, '<');
		}
		if (lexer->lookahead == '/' && check_tag(s, lexer)) return false;
		return emit_text(s, lexer, col, 1, '<');

	case '{':
		adv(lexer);
		lexer->mark_end(lexer);
		if (skip_expression(lexer)) return false;
		return emit_text(s, lexer, col, 1, '{');

	case '&':
		adv(lexer);
		lexer->mark_end(lexer);
		if (lexer->lookahead == '#') {
			adv(lexer);
			bool hex = lexer->lookahead == 'x' || lexer->lookahead == 'X';
			if (hex) adv(lexer);
			unsigned n = 0;
			while (hex ? (is_digit(lexer->lookahead) ||
			              ((lexer->lookahead | 32) >= 'a' && (lexer->lookahead | 32) <= 'f'))
			           : is_digit(lexer->lookahead)) {
				adv(lexer);
				n++;
			}
			if (n > 0 && n <= (hex ? 6u : 7u) && lexer->lookahead == ';') return false;
		} else if (is_alpha(lexer->lookahead)) {
			unsigned n = 0;
			while (is_alnum(lexer->lookahead)) {
				adv(lexer);
				n++;
			}
			if (n >= 2 && n <= 32 && lexer->lookahead == ';') return false;
		}
		return emit_text(s, lexer, col, 1, '&');

	case '|':
		if (s->flags & F_IN_ROW) return false;
		return scan_text(s, lexer, col, 0, 0);

	default:
		return scan_text(s, lexer, col, 0, 0);
	}
}

void *tree_sitter_mdsvex_external_scanner_create(void) {
	Scanner *s = ts_calloc(1, sizeof(Scanner));
	array_init(&s->open);
	array_init(&s->brackets);
	array_init(&s->directives);
	array_init(&s->definitions);
	s->flags = F_LINE_START | F_IMPORTS;
	s->prev_char = ' ';
	return s;
}

void tree_sitter_mdsvex_external_scanner_destroy(void *payload) {
	Scanner *s = payload;
	array_delete(&s->open);
	array_delete(&s->brackets);
	array_delete(&s->directives);
	array_delete(&s->definitions);
	ts_free(s);
}

unsigned tree_sitter_mdsvex_external_scanner_serialize(void *payload, char *buffer) {
	Scanner *s = payload;
	unsigned i = 0;
	buffer[i++] = (char)s->matched;
	buffer[i++] = (char)s->flags;
	buffer[i++] = (char)s->fence_len;
	buffer[i++] = (char)s->ticks;
	buffer[i++] = (char)s->raw_tag;
	buffer[i++] = (char)s->indent_ws;
	memcpy(&buffer[i], &s->prev_char, 4);
	i += 4;
	memcpy(&buffer[i], &s->line_start_col, 4);
	i += 4;
	memcpy(&buffer[i], &s->last_col, 4);
	i += 4;
	buffer[i++] = (char)s->open.size;
	for (unsigned j = 0; j < s->open.size; j++) {
		buffer[i++] = (char)s->open.contents[j].type;
		buffer[i++] = (char)s->open.contents[j].indent;
	}
	buffer[i++] = (char)s->brackets.size;
	for (unsigned j = 0; j < s->brackets.size; j++)
		buffer[i++] = (char)s->brackets.contents[j];
	buffer[i++] = (char)s->directives.size;
	for (unsigned j = 0; j < s->directives.size; j++)
		buffer[i++] = (char)s->directives.contents[j];
	buffer[i++] = (char)s->definitions.size;
	memcpy(&buffer[i], s->definitions.contents, s->definitions.size * 2);
	i += s->definitions.size * 2;
	return i;
}

void tree_sitter_mdsvex_external_scanner_deserialize(void *payload, const char *buffer,
                                                     unsigned length) {
	Scanner *s = payload;
	array_clear(&s->open);
	array_clear(&s->brackets);
	array_clear(&s->directives);
	array_clear(&s->definitions);
	s->matched = 0;
	s->flags = F_LINE_START | F_IMPORTS;
	s->fence_len = 0;
	s->ticks = 0;
	s->raw_tag = 0;
	s->indent_ws = 0;
	s->prev_char = ' ';
	s->line_start_col = 0;
	s->last_col = 0;
	if (length == 0) return;
	unsigned i = 0;
	s->matched = (uint8_t)buffer[i++];
	s->flags = (uint8_t)buffer[i++];
	s->fence_len = (uint8_t)buffer[i++];
	s->ticks = (uint8_t)buffer[i++];
	s->raw_tag = (uint8_t)buffer[i++];
	s->indent_ws = (uint8_t)buffer[i++];
	memcpy(&s->prev_char, &buffer[i], 4);
	i += 4;
	memcpy(&s->line_start_col, &buffer[i], 4);
	i += 4;
	memcpy(&s->last_col, &buffer[i], 4);
	i += 4;
	uint8_t open = (uint8_t)buffer[i++];
	array_reserve(&s->open, open);
	for (unsigned j = 0; j < open; j++) {
		Block b = {(uint8_t)buffer[i], (uint8_t)buffer[i + 1]};
		i += 2;
		array_push(&s->open, b);
	}
	uint8_t brackets = (uint8_t)buffer[i++];
	for (unsigned j = 0; j < brackets; j++)
		array_push(&s->brackets, (uint8_t)buffer[i++]);
	uint8_t directives = (uint8_t)buffer[i++];
	for (unsigned j = 0; j < directives; j++)
		array_push(&s->directives, (uint8_t)buffer[i++]);
	uint8_t definitions = (uint8_t)buffer[i++];
	array_reserve(&s->definitions, definitions);
	memcpy(s->definitions.contents, &buffer[i], definitions * 2u);
	s->definitions.size = definitions;
}

bool tree_sitter_mdsvex_external_scanner_scan(void *payload, TSLexer *lexer,
                                              const bool *valid) {
	Scanner *s = payload;
	if (valid[ERROR_SENTINEL]) return false;
	if (s->flags & F_LINE_START) {
		uint32_t col = lexer->get_column(lexer);
		if (col == s->line_start_col) {
			if (s->matched < s->open.size) return scan_continuation(s, lexer, valid, col);
			int r = scan_line_start(s, lexer, valid, col);
			if (r >= 0) return r == 1;
		}
		s->flags &= ~(F_LINE_START | F_LAZY);
	}
	return scan_inline(s, lexer, valid);
}
