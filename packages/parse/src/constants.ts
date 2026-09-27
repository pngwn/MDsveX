// a const enum so tsc inlines every code as a literal, exported consts stay module cells
export const enum Ch {
	/** ascii code for the tab character (`\t`). */
	TAB = 9,

	/** ascii code for the line feed character (`\n`). */
	LINEFEED = 10,

	/** ascii code for the space character (` `). */
	SPACE = 32,

	/** ascii code for the double quote character (`"`). */
	QUOTE = 34,

	/** ascii code for the octothorpe character (`#`). */
	OCTOTHERP = 35,

	/** ascii code for the apostrophe character (`'`). */
	APOSTROPHE = 39,

	/** ascii code for the dash character (`-`). */
	DASH = 45,

	/** ascii code for the dot character (`.`). */
	DOT = 46,

	/** ascii code for the slash character (`/`). */
	SLASH = 47,

	/** ascii code for the colon character (`:`). */
	COLON = 58,

	/** ascii code for the less-than angle bracket (`<`). */
	OPEN_ANGLE_BRACKET = 60,

	/** ascii code for the equals character (`=`). */
	EQUALS = 61,

	/** ascii code for the greater-than angle bracket (`>`). */
	CLOSE_ANGLE_BRACKET = 62,

	/** ascii code for the at sign (`@`). */
	AT = 64,

	/** ascii code for the open brace character (`{`). */
	OPEN_BRACE = 123,

	/** ascii code for the close brace character (`}`). */
	CLOSE_BRACE = 125,

	/** ascii code for the uppercase letter `a`. */
	UPPERCASE_A = 65,

	/** ascii code for the uppercase letter `z`. */
	UPPERCASE_Z = 90,

	/** ascii code for the backslash character (`\\`). */
	BACKSLASH = 92,

	/** ascii code for the backtick character (`` ` ``). */
	BACKTICK = 96,

	/** ascii code for the tilde character (`~`). */
	TILDE = 126,

	/** ascii code for the caret character (`^`). */
	CARET = 94,

	/** ascii code for the lowercase letter `a`. */
	LOWERCASE_A = 97,

	/** ascii code for the lowercase letter `z`. */
	LOWERCASE_Z = 122,

	/** ascii code for the pipe character (`|`). */
	PIPE = 124,

	/** ascii code for the exclamation mark character (`!`). */
	EXCLAMATION_MARK = 33,

	/** ascii code for the asterisk character (`*`). */
	ASTERISK = 42,

	/** ascii code for the open parenthesis character (`(`). */
	OPEN_PAREN = 40,

	/** ascii code for the close parenthesis character (`)`). */
	CLOSE_PAREN = 41,

	/** ascii code for the open square bracket character (`[`). */
	OPEN_SQUARE_BRACKET = 91,

	/** ascii code for the close square bracket character (`]`). */
	CLOSE_SQUARE_BRACKET = 93,

	/** ascii code for the underscore character (`_`). */
	UNDERSCORE = 95,

	/** ascii code for the plus character (`+`). */
	PLUS = 43,

	/** ascii code for the comma character (`,`). */
	COMMA = 44,
}
