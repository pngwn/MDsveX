import {
	BACKTICK,
	CLOSE_BRACE,
	TILDE,
	LINEFEED,
	OCTOTHERP,
	OPEN_ANGLE_BRACKET,
	OPEN_BRACE,
	SPACE,
	TAB,
	CLOSE_ANGLE_BRACKET,
	BACKSLASH,
	EXCLAMATION_MARK,
	AT,
	ASTERISK,
	DASH,
	UNDERSCORE,
	OPEN_SQUARE_BRACKET,
	CLOSE_SQUARE_BRACKET,
	OPEN_PAREN,
	CLOSE_PAREN,
	COLON,
} from './constants';

import type { parse_options, parse_result, parse_context } from './types';
import type { Introspector } from './introspector';
import { node_kind } from './utils';
import { node_buffer, error_collector } from './utils';
export type { parse_options, parse_result } from './types';
export { node_kind, node_buffer } from './utils';
export { Introspector } from './introspector';
export type { introspection_entry } from './introspector';

const enum char_mask {
	whitespace = 1 << 0,
	punctuation = 1 << 1,
	word = 1 << 2,
}

const char_class_table = new Uint8Array(128);

for (let i = 0; i < char_class_table.length; i += 1) {
	let mask = 0;

	if (i <= 0x20) {
		mask |= char_mask.whitespace;
	}

	if ((i >= 33 && i <= 47) || (i >= 58 && i <= 64)) {
		mask |= char_mask.punctuation;
	}

	if (mask === 0) {
		mask = char_mask.word;
	}

	char_class_table[i] = mask;
}

const classify = (code: number): char_mask => {
	if (Number.isNaN(code)) {
		return char_mask.whitespace;
	}

	if (code < char_class_table.length) {
		return char_class_table[code];
	}

	// console.log('classify', code, 'is not in table', String.fromCharCode(code));

	return char_mask.word;
};

export const enum state_kind {
	root = 0,
	text = 1,
	heading_marker = 2,
	code_fence_start = 3,
	code_fence_info = 4,
	code_fence_content = 5,
	code_fence_text_end = 6,
	paragraph = 7,
	inline = 8,
	code_span_start = 9,
	code_span_info = 10,
	code_span_content_leading_space = 11,
	code_span_leading_space_end = 12,
	code_span_end = 13,
	strong_emphasis = 14,
	emphasis = 15,
	autolink = 16,
}

const fences = Array.from({ length: 20 }, (_, i) =>
	Array(i).fill('`').join('')
);

/**
 * Parse markdown that may include Svelte syntax into tokens and nodes.
 * @param input Source markdown string.
 * @param options Parser configuration and reusable storage.
 * @returns Arena-backed parse result and collected tokens.
 */
export function parse_markdown_svelte(
	input: string,
	options: parse_options = {}
): { nodes: node_buffer; errors: error_collector } {
	// const token_capacity =
	// 	options.token_capacity ??
	// 	Math.max(DEFAULT_TOKEN_CAPACITY, input.length >>> 2);
	// const error_capacity = options.error_capacity ?? DEFAULT_ERROR_CAPACITY;
	// console.log('input', input);
	const { nodes, errors } = tokenize(input, options.introspector);

	return { nodes, errors };
}

/**
 * Tokenize the source string and populate token, arena, and error buffers.
 * @param context Shared parsing state.
 */
function tokenize(source: string, introspector?: Introspector): {
	nodes: node_buffer;
	errors: error_collector;
} {
	const nodes = new node_buffer(source.length);

	let node_stack: number[] = [0];
	const errors = new error_collector(source.length);
	const length = source.length;

	const states: state_kind[] = [state_kind.root];

	let prev_cursor = 0;
	let cursor = 0;

	let extra = 0;
	let metadata: Record<string, any> = {};
	let checkpoint_cursor = 0;
	// console.log('states', states);

	let prev = char_mask.whitespace;
	let current = classify(source.charCodeAt(cursor));
	let next = classify(source.charCodeAt(cursor + 1));

	function is_heading_start(pos: number): boolean {
		while (pos < length && (source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)) {
			pos++;
		}
		if (pos >= length || source.charCodeAt(pos) !== OCTOTHERP) return false;
		let count = 0;
		while (pos < length && source.charCodeAt(pos) === OCTOTHERP) {
			count++;
			pos++;
		}
		if (count > 6) return false;
		const ch = source.charCodeAt(pos);
		return pos >= length || ch === SPACE || ch === TAB || ch === LINEFEED;
	}

	function is_blank_line_after(pos: number): boolean {
		// Check if the line after LINEFEED at pos is blank (whitespace-only or EOF)
		let p = pos + 1;
		while (p < length && source.charCodeAt(p) !== LINEFEED) {
			const ch = source.charCodeAt(p);
			if (ch !== SPACE && ch !== TAB) return false;
			p++;
		}
		return true;
	}

	function is_thematic_break_start(pos: number): boolean {
		// Skip leading spaces (0-3 allowed, 4+ is indented code)
		let spaces = 0;
		while (pos < length && source.charCodeAt(pos) === SPACE) {
			spaces++;
			pos++;
		}
		if (spaces > 3) return false;

		if (pos >= length) return false;

		const marker = source.charCodeAt(pos);
		if (marker !== ASTERISK && marker !== DASH && marker !== UNDERSCORE) return false;

		let count = 0;
		while (pos < length && source.charCodeAt(pos) !== LINEFEED) {
			const ch = source.charCodeAt(pos);
			if (ch === marker) {
				count++;
			} else if (ch !== SPACE && ch !== TAB) {
				return false;
			}
			pos++;
		}

		return count >= 3;
	}

	function is_ascii_punctuation(code: number): boolean {
		return (code >= 33 && code <= 47) || (code >= 58 && code <= 64) ||
			(code >= 91 && code <= 96) || (code >= 123 && code <= 126);
	}

	/**
	 * Try to parse a URI autolink starting after the `<`.
	 * Returns the end position (after `>`) if successful, or -1.
	 * URI autolink: scheme (2-32 chars, starts with letter) + `:` + non-space/non-</>
	 */
	function try_parse_uri_autolink(pos: number): number {
		let p = pos;
		let ch = source.charCodeAt(p);

		// Scheme must start with a letter
		if (!((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122))) return -1;
		p++;

		let scheme_len = 1;
		while (p < length && scheme_len <= 32) {
			ch = source.charCodeAt(p);
			if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) ||
				(ch >= 48 && ch <= 57) || ch === 43 || ch === 45 || ch === 46) {
				p++;
				scheme_len++;
			} else {
				break;
			}
		}

		// Scheme must be at least 2 chars and followed by `:`
		if (scheme_len < 2 || source.charCodeAt(p) !== COLON) return -1;
		p++; // skip `:`

		// URI body: no spaces, no `<`, no `>`
		while (p < length) {
			ch = source.charCodeAt(p);
			if (ch === CLOSE_ANGLE_BRACKET) {
				return p + 1; // success: end is position after `>`
			}
			if (ch <= 0x20 || ch === OPEN_ANGLE_BRACKET) {
				return -1; // invalid character in URI
			}
			p++;
		}

		return -1; // no closing `>`
	}

	/**
	 * Try to parse an email autolink starting after the `<`.
	 * Returns the end position (after `>`) if successful, or -1.
	 * Email: [a-zA-Z0-9._-]+ @ [a-zA-Z0-9.-]+ (domain must have a dot)
	 */
	function try_parse_email_autolink(pos: number): number {
		let p = pos;
		let ch: number;
		const local_start = p;

		// Local part: [a-zA-Z0-9._-]+
		while (p < length) {
			ch = source.charCodeAt(p);
			if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) ||
				(ch >= 48 && ch <= 57) || ch === 46 || ch === 45 || ch === 95) {
				p++;
			} else {
				break;
			}
		}

		if (p === local_start || source.charCodeAt(p) !== AT) return -1;
		p++; // skip @

		const domain_start = p;
		let has_dot = false;

		while (p < length) {
			ch = source.charCodeAt(p);
			if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) ||
				(ch >= 48 && ch <= 57) || ch === 45) {
				p++;
			} else if (ch === 46) {
				has_dot = true;
				p++;
			} else {
				break;
			}
		}

		if (p === domain_start || !has_dot || source.charCodeAt(p) !== CLOSE_ANGLE_BRACKET) return -1;
		return p + 1;
	}

	/**
	 * Try to parse an inline link starting at `[`.
	 * Returns link info if `[text](url "title")` pattern found, or null.
	 */
	function try_parse_inline_link(pos: number): {
		text_start: number;
		text_end: number;
		url_start: number;
		url_end: number;
		title_start: number;
		title_end: number;
		end: number;
	} | null {
		if (source.charCodeAt(pos) !== OPEN_SQUARE_BRACKET) return null;

		let p = pos + 1;
		let bracket_depth = 1;

		// Find matching ']' with bracket balancing
		while (p < length && bracket_depth > 0) {
			const ch = source.charCodeAt(p);
			if (ch === BACKSLASH && p + 1 < length) {
				p += 2; // skip escaped char
				continue;
			}
			if (ch === LINEFEED) {
				// Newline inside link text — continue (multi-line link text is ok)
			}
			if (ch === OPEN_SQUARE_BRACKET) bracket_depth++;
			else if (ch === CLOSE_SQUARE_BRACKET) bracket_depth--;
			if (bracket_depth > 0) p++;
		}

		if (bracket_depth !== 0) return null;

		const text_start = pos + 1;
		const text_end = p;
		p++; // skip ']'

		// Must be immediately followed by '('
		if (p >= length || source.charCodeAt(p) !== OPEN_PAREN) return null;
		p++; // skip '('

		// Skip whitespace (not newlines for now)
		while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

		let url_start: number, url_end: number;

		if (p < length && source.charCodeAt(p) === OPEN_ANGLE_BRACKET) {
			// Angle-bracketed destination
			p++; // skip '<'
			url_start = p;
			while (p < length) {
				const ch = source.charCodeAt(p);
				if (ch === CLOSE_ANGLE_BRACKET) break;
				if (ch === LINEFEED || ch === OPEN_ANGLE_BRACKET) return null;
				if (ch === BACKSLASH && p + 1 < length && source.charCodeAt(p + 1) !== LINEFEED) {
					p += 2;
					continue;
				}
				p++;
			}
			if (p >= length || source.charCodeAt(p) !== CLOSE_ANGLE_BRACKET) return null;
			url_end = p;
			p++; // skip '>'
		} else if (p < length && source.charCodeAt(p) === CLOSE_PAREN) {
			// Empty URL: [text]()
			url_start = p;
			url_end = p;
		} else {
			// Regular destination — balanced parens, no spaces/control chars
			url_start = p;
			let paren_depth = 0;
			while (p < length) {
				const ch = source.charCodeAt(p);
				if (ch <= 0x20) break; // space or control char
				if (ch === CLOSE_PAREN) {
					if (paren_depth === 0) break;
					paren_depth--;
				}
				if (ch === OPEN_PAREN) paren_depth++;
				if (ch === BACKSLASH && p + 1 < length) {
					p += 2;
					continue;
				}
				p++;
			}
			if (paren_depth !== 0) return null;
			url_end = p;
		}

		// Skip whitespace between URL and optional title
		while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

		// Check for title
		let title_start = -1, title_end = -1;
		if (p < length) {
			const tc = source.charCodeAt(p);
			if (tc === 34 || tc === 39 || tc === OPEN_PAREN) { // ", ', (
				const close_char = tc === OPEN_PAREN ? CLOSE_PAREN : tc;
				p++; // skip opening
				title_start = p;
				while (p < length) {
					const ch = source.charCodeAt(p);
					if (ch === close_char) break;
					if (ch === LINEFEED) return null; // newline in title not allowed
					if (ch === BACKSLASH && p + 1 < length) {
						p += 2;
						continue;
					}
					p++;
				}
				if (p >= length || source.charCodeAt(p) !== close_char) return null;
				title_end = p;
				p++; // skip closing
			}
		}

		// Skip trailing whitespace
		while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

		// Must end with ')'
		if (p >= length || source.charCodeAt(p) !== CLOSE_PAREN) return null;
		p++; // skip ')'

		return { text_start, text_end, url_start, url_end, title_start, title_end, end: p };
	}

	function chomp(count: number = 1, replace: boolean = false) {
		if (replace) {
			cursor = count;
		} else {
			cursor += count;
		}

		if (count > 1 || replace) {
			prev = classify(source.charCodeAt(cursor - 1));
			current = classify(source.charCodeAt(cursor));
			next = classify(source.charCodeAt(cursor + 1));
		} else {
			prev = current;
			current = next;
			next = classify(source.charCodeAt(cursor + 1));
		}
	}

	let loop_without_progress = 0;

	while (cursor <= length) {
		introspector?.step(cursor, states);

		const active = states[states.length - 1];
		const code = source.charCodeAt(cursor);

		// const current_parent = node_stack[node_stack.length - 2] || 0;
		const current_node = node_stack[node_stack.length - 1] || 0;
		
		// Main loop iteration

		// console.log(
		// 	'cursor: ',
		// 	cursor,
		// 	'char: ',
		// 	source[cursor],
		// 	'node_stack: ',
		// 	node_stack

		// );

		if (cursor === prev_cursor) {
			loop_without_progress += 1;
			if (loop_without_progress > 100) {
				console.error('Infinite loop detected');
				break;
			}
		} else {
			loop_without_progress = 0;
		}

		prev_cursor = cursor;

		// if (prev_cursor === cursor) {

		switch (active) {
			case state_kind.root: {
				if (isNaN(code)) {
					// cursor += 1;
					chomp();
					continue;
				}
				switch (code) {
					case LINEFEED: {
						const n = nodes.push(node_kind.line_break, cursor, current_node);
						nodes.set_end(n, cursor + 1);
						chomp();
						continue;
					}

					case SPACE:
					case TAB: {
						// Check if this is a blank line (whitespace until newline)
						let pos = cursor;
						while (pos < length && (source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)) {
							pos++;
						}
						if (pos < length && source.charCodeAt(pos) === LINEFEED) {
							// Blank line with leading whitespace
							const n = nodes.push(node_kind.line_break, cursor, current_node);
							nodes.set_end(n, pos + 1);
							chomp(pos + 1, true);
							continue;
						}
						// Not a blank line — just skip the whitespace
						chomp();
						continue;
					}

					case OCTOTHERP: {
						// Count consecutive # characters
						let hash_count = 1;
						let pos = cursor + 1;
						while (pos < length && source.charCodeAt(pos) === OCTOTHERP) {
							hash_count++;
							pos++;
						}

						// Must be 1-6 hashes
						if (hash_count > 6) {
							states.push(state_kind.paragraph);
							node_stack.push(
								nodes.push(node_kind.paragraph, cursor, current_node)
							);
							continue;
						}

						// Next char must be space, tab, newline, or EOF
						const after_hash = source.charCodeAt(pos);
						if (
							pos < length &&
							after_hash !== SPACE &&
							after_hash !== TAB &&
							after_hash !== LINEFEED
						) {
							states.push(state_kind.paragraph);
							node_stack.push(
								nodes.push(node_kind.paragraph, cursor, current_node)
							);
							continue;
						}

						// Valid heading — skip whitespace after hashes
						let content_start = pos;
						if (
							pos < length &&
							(after_hash === SPACE || after_hash === TAB)
						) {
							content_start++;
							while (
								content_start < length &&
								(source.charCodeAt(content_start) === SPACE ||
									source.charCodeAt(content_start) === TAB)
							) {
								content_start++;
							}
						}

						// Scan to end of line
						let line_end = content_start;
						while (
							line_end < length &&
							source.charCodeAt(line_end) !== LINEFEED
						) {
							line_end++;
						}

						// Trim trailing whitespace from value
						let value_end = line_end;
						while (
							value_end > content_start &&
							(source.charCodeAt(value_end - 1) === SPACE ||
								source.charCodeAt(value_end - 1) === TAB)
						) {
							value_end--;
						}

						const heading_end =
							line_end < length ? line_end + 1 : line_end;

						const n = nodes.push(
							node_kind.heading,
							cursor,
							current_node,
							hash_count
						);
						nodes.set_value_start(n, content_start);
						nodes.set_value_end(n, value_end);
						nodes.set_end(n, heading_end);

						chomp(heading_end, true);
						continue;
					}

					case BACKTICK: {
						states.push(state_kind.code_fence_start);
						extra = 0;
						continue;
					}

					case ASTERISK:
					case DASH:
					case UNDERSCORE: {
						if (is_thematic_break_start(cursor)) {
							// Scan to end of line
							let line_end = cursor;
							while (line_end < length && source.charCodeAt(line_end) !== LINEFEED) {
								line_end++;
							}
							const break_end = line_end < length ? line_end + 1 : line_end;

							const n = nodes.push(node_kind.thematic_break, cursor, current_node);
							nodes.set_end(n, break_end);

							chomp(break_end, true);
							continue;
						}
						// Not a thematic break, fall through to paragraph
						states.push(state_kind.paragraph);
						node_stack.push(
							nodes.push(node_kind.paragraph, cursor, current_node)
						);
						continue;
					}

					default: {
						states.push(state_kind.paragraph);
						node_stack.push(
							nodes.push(node_kind.paragraph, cursor, current_node)
						);

						continue;
					}
				}
			}

			case state_kind.paragraph: {
				// Check for paragraph boundaries
				
				if (
					(code === LINEFEED && is_blank_line_after(cursor)) ||
					!code
				) {
					nodes.set_end(current_node, cursor);
					states.pop();

					// Clean up node_stack - pop all nodes until we're back to root level
					while (node_stack.length > 1) {
						node_stack.pop();
					}

					// Don't consume newlines — root will emit line_break nodes
					continue;
				} else if (
					code === LINEFEED &&
					source.charCodeAt(cursor + 1) === BACKTICK &&
					source.charCodeAt(cursor + 2) === BACKTICK &&
					source.charCodeAt(cursor + 3) === BACKTICK
				) {
					nodes.set_end(current_node, cursor);
					states.pop();
					while (node_stack.length > 1) {
						node_stack.pop();
					}
					// Don't consume — root will emit line_break then handle code fence
					continue;
				} else if (code === LINEFEED && is_heading_start(cursor + 1)) {
					nodes.set_end(current_node, cursor);
					states.pop();
					while (node_stack.length > 1) {
						node_stack.pop();
					}
					// Don't consume — root will emit line_break
					continue;
				} else if (code === LINEFEED && is_thematic_break_start(cursor + 1)) {
					nodes.set_end(current_node, cursor);
					states.pop();
					while (node_stack.length > 1) {
						node_stack.pop();
					}
					// Don't consume — root will emit line_break
					continue;
				} else if (code === LINEFEED) {
					// Single newline - continue in paragraph
					// cursor += 1;
					chomp();
					continue;
				} else {
					// Non-newline content - enter inline state
					states.push(state_kind.inline);
					continue;
				}
			}

			case state_kind.code_fence_start: {
				if (code === BACKTICK) {
					extra += 1;
					// cursor += 1;
					chomp();
					continue;
				} else if (extra >= 3) {
					states.pop();
					states.push(state_kind.code_fence_info);
					node_stack.push(
						nodes.push(node_kind.code_fence, cursor - extra, current_node)
					);

					metadata.info_start = cursor;

					continue;
				} else {
					states.pop();
					node_stack.push(
						nodes.push(node_kind.paragraph, cursor - extra, current_node)
					);
					states.push(state_kind.paragraph);
					// cursor = cursor - extra;
					chomp(cursor - extra, true);
					continue;
				}
			}

			case state_kind.code_fence_info: {
				if (!code) {
					states.pop();

					nodes.set_end(current_node, length);
					nodes.set_value_start(current_node, length);
					nodes.set_value_end(current_node, length);
					break;
				} else if (cursor + 1 >= length) {
					nodes.set_end(current_node, length);
					nodes.set_value_end(current_node, length);
					states.pop();
					continue;
				}
				if (code !== LINEFEED) {
					// cursor += 1;
					chomp();
					continue;
				} else if (cursor >= length) {
					nodes.set_end(current_node, length);
					nodes.set_value_end(current_node, length);
					states.pop();
					continue;
				} else {
					metadata.info_end = cursor;
					states.pop();
					states.push(state_kind.code_fence_content);
					nodes.set_metadata(current_node, {
						info_start: metadata.info_start,
						info_end: cursor,
					});
					// cursor += 1;
					chomp();

					nodes.set_value_start(current_node, cursor);

					continue;
				}
			}

			case state_kind.code_fence_content: {
				// Find closing fence starting from cursor, not cursor-1
				const index = source.indexOf(fences[extra], cursor);
				const nl_index = source.lastIndexOf('\n', index);
				if (cursor >= length || index === -1) {
					// Set value_end before transitioning
					nodes.set_value_end(current_node, length);
					states.pop();
					states.push(state_kind.code_fence_text_end);
					// cursor = length;
					chomp(length, true);
					continue;
				}

				let ws = true;
				let preceding_newline = false;

				for (let i = nl_index; i < index; i++) {
					if (source.charCodeAt(i) === LINEFEED) {
						preceding_newline = true;
					}
					if (
						source.charCodeAt(i) !== SPACE &&
						source.charCodeAt(i) !== TAB &&
						source.charCodeAt(i) !== LINEFEED
					) {
						ws = false;
					}
				}

				if (!ws || !preceding_newline) {
					// cursor = index + extra;
					chomp(index + extra, true);
					continue;
				}

				if (index !== -1 && nl_index !== -1 && ws) {
					if (index + extra <= length) {
						states.pop();
						states.push(state_kind.code_fence_text_end);
						nodes.set_value_end(current_node, nl_index);

						// cursor = index + extra;
						chomp(index + extra, true);
					}
					continue;
				} else {
					states.pop();
					// cursor = length;
					chomp(length, true);
					nodes.set_end(current_node, length);
					nodes.set_value_end(current_node, length);
					continue;
				}
			}

			case state_kind.code_fence_text_end: {
				if (cursor >= length) {
					nodes.set_end(current_node, length);
					nodes.gently_set_value_end(current_node, length);
					node_stack.pop();
					states.pop();
				} else if (code !== BACKTICK) {
					nodes.set_end(current_node, cursor);
					node_stack.pop();
				}
				// cursor += 1;
				chomp();
				continue;
			}
			case state_kind.heading_marker: {
				if (code === OCTOTHERP) {
					// TODO:handle heading markers
				}

				if (code === SPACE || code === TAB) {
					if (false) {
						// TODO: make it a text node and pop
					}

					// TODO:other wise move to text node and continue

					// const content_start = chomp_whitespace(source, length, cursor);
					// heading.content_start = content_start;
					// set_heading_value(heading.content_start, heading.content_start);
					// extend_heading_span(content_start);
					// cursor = content_start;
					// parents.push(heading.node_index);
					// states.pop();
					// states.push(state_kind.heading_text);
					// continue;
				}

				// TODO: this looks wrong
				// if (code === LINEFEED || cursor >= length) {
				// 	if (heading.level === 0) {
				// 		revert_heading_to_text(cursor);
				// 		states.pop();
				// 		states.push(state_kind.text);
				// 		continue;
				// 	}

				// 	const heading_end =
				// 		code === LINEFEED ? Math.min(length, cursor + 1) : cursor;
				// 	const raw_value_end = cursor;
				// 	const value_end = trim_trailing_whitespace(
				// 		heading.content_start,
				// 		raw_value_end
				// 	);
				// 	finalize_heading(heading_end, value_end);
				// 	states.pop();
				// 	if (code === LINEFEED) {
				// 		emit_with_parent(node_kind.line_break, cursor, cursor + 1);
				// 		cursor += 1;
				// 		line_start = cursor;
				// 	}
				// 	continue;
				// }

				// revert_heading_to_text(cursor);
				// states.pop();
				// states.push(state_kind.text);
				// continue;
			}

			case state_kind.strong_emphasis: {
				if (
					code === ASTERISK &&
					prev & (char_mask.word | char_mask.punctuation) &&
					next & (char_mask.whitespace | char_mask.punctuation)
				) {
					// console.log('strong_emphasis -- strong_emphasis_end');
					// nodes.set_end(current_node, cursor);
					// nodes.set_value_end(current_node, cursor);
					// node_stack.pop();

					const n = node_stack[node_stack.length - 1];
					// console.log(n);
					nodes.set_value_end(n, cursor);
					nodes.set_end(n, cursor + 1);
					nodes.commit_node(n);
					states.pop();
					node_stack.pop();
					// cursor += 1;
					chomp();
				} else if (
					code === LINEFEED &&
					is_blank_line_after(cursor)
				) {
					// Paragraph boundary detected! Just pop this state
					// without chomping, let the previous state handle the newlines
					states.pop();
					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();
					continue;
				} else if (
					code === LINEFEED &&
					is_heading_start(cursor + 1)
				) {
					states.pop();
					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();
					continue;
				} else if (
					code === LINEFEED &&
					is_thematic_break_start(cursor + 1)
				) {
					states.pop();
					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();
					continue;
				} else {
					// console.log('strong_emphasis -- moving to text');
					// let n = nodes.push(node_kind.text, cursor, current_node);
					// nodes.set_value_start(n, cursor);
					// node_stack.push(n);
					states.push(state_kind.inline);
				}

				continue;
			}

			case state_kind.emphasis: {
				if (
					code === UNDERSCORE &&
					prev & (char_mask.word | char_mask.punctuation) &&
					next & (char_mask.whitespace | char_mask.punctuation)
				) {
					const n = node_stack[node_stack.length - 1];
					nodes.set_value_end(n, cursor);
					nodes.set_end(n, cursor + 1);
					nodes.commit_node(n);
					states.pop();
					node_stack.pop();
					chomp();
				} else if (
					code === LINEFEED &&
					is_blank_line_after(cursor)
				) {
					states.pop();
					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();
					continue;
				} else if (
					code === LINEFEED &&
					is_heading_start(cursor + 1)
				) {
					states.pop();
					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();
					continue;
				} else if (
					code === LINEFEED &&
					is_thematic_break_start(cursor + 1)
				) {
					states.pop();
					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();
					continue;
				} else {
					states.push(state_kind.inline);
				}

				continue;
			}

						case state_kind.inline: {
				// Process inline content
				switch (code) {
					case BACKTICK: {
						// console.log('code_span_start');
						states.push(state_kind.code_span_start);
						extra = 0;
						continue;
					}
					case LINEFEED: {
						if (is_blank_line_after(cursor)) {
							// Paragraph boundary detected! Just pop this state
							// without chomping, let the previous state handle the newlines
							states.pop();
							continue;
						} else if (is_heading_start(cursor + 1)) {
							states.pop();
							continue;
						} else if (is_thematic_break_start(cursor + 1)) {
							states.pop();
							continue;
						} else {
							// cursor += 1;
							chomp();
							continue;
						}
					}
					case ASTERISK: {
						if (
							prev & (char_mask.whitespace | char_mask.punctuation) &&
							next & (char_mask.word | char_mask.punctuation)
						) {
							let n = nodes.push_pending(
								node_kind.strong_emphasis,
								cursor,
								current_node
							);

							nodes.set_value_start(n, cursor + 1);
							node_stack.push(n);
							states.push(state_kind.strong_emphasis);
						} else {
							let n = nodes.push(node_kind.text, cursor, current_node);
							nodes.set_value_start(n, cursor);
							node_stack.push(n);
							states.push(state_kind.text);
						}

						chomp();
						continue;
					}

					case UNDERSCORE: {
						if (
							prev & (char_mask.whitespace | char_mask.punctuation) &&
							next & (char_mask.word | char_mask.punctuation)
						) {
							let n = nodes.push_pending(
								node_kind.emphasis,
								cursor,
								current_node
							);

							nodes.set_value_start(n, cursor + 1);
							node_stack.push(n);
							states.push(state_kind.emphasis);
						} else {
							let n = nodes.push(node_kind.text, cursor, current_node);
							nodes.set_value_start(n, cursor);
							node_stack.push(n);
							states.push(state_kind.text);
						}

						chomp();
						continue;
					}

					case BACKSLASH: {
						// Backslash escape: if next char is ASCII punctuation,
						// consume both as text (prevents special char interpretation)
						let n = nodes.push(node_kind.text, cursor, current_node);
						nodes.set_value_start(n, cursor);
						node_stack.push(n);
						states.push(state_kind.text);

						const next_code = source.charCodeAt(cursor + 1);
						if (is_ascii_punctuation(next_code)) {
							chomp(2); // skip both \ and the escaped char
						} else {
							chomp();
						}
						continue;
					}

					case OPEN_SQUARE_BRACKET: {
						// Try to parse as inline link: [text](url)
						const link_result = try_parse_inline_link(cursor);
						if (link_result) {
							const url = source.slice(link_result.url_start, link_result.url_end);
							const title = link_result.title_start >= 0
								? source.slice(link_result.title_start, link_result.title_end)
								: undefined;

							const link_node_il = nodes.push(node_kind.link, cursor, current_node);
							nodes.set_value_start(link_node_il, link_result.text_start);
							nodes.set_value_end(link_node_il, link_result.text_end);
							nodes.set_end(link_node_il, link_result.end);
							nodes.set_metadata(link_node_il, { href: url, title });

							if (link_result.text_end > link_result.text_start) {
								const text_node_il = nodes.push(node_kind.text, link_result.text_start, link_node_il);
								nodes.set_value_start(text_node_il, link_result.text_start);
								nodes.set_value_end(text_node_il, link_result.text_end);
								nodes.set_end(text_node_il, link_result.text_end);
							}

							chomp(link_result.end, true);
							states.pop(); // pop inline so parent state handles next char
							continue;
						}

						// Not a link, treat [ as text
						node_stack.push(nodes.push(node_kind.text, cursor, current_node));
						nodes.set_value_start(node_stack[node_stack.length - 1], cursor);
						states.push(state_kind.text);
						chomp();
						continue;
					}

					case EXCLAMATION_MARK: {
						// Check for image: ![alt](url)
						if (source.charCodeAt(cursor + 1) === OPEN_SQUARE_BRACKET) {
							const img_result = try_parse_inline_link(cursor + 1);
							if (img_result) {
								const img_url = source.slice(img_result.url_start, img_result.url_end);
								const img_title = img_result.title_start >= 0
									? source.slice(img_result.title_start, img_result.title_end)
									: undefined;

								const img_node = nodes.push(node_kind.image, cursor, current_node);
								nodes.set_value_start(img_node, img_result.text_start);
								nodes.set_value_end(img_node, img_result.text_end);
								nodes.set_end(img_node, img_result.end);
								nodes.set_metadata(img_node, { src: img_url, title: img_title });

								if (img_result.text_end > img_result.text_start) {
									const text_node_img = nodes.push(node_kind.text, img_result.text_start, img_node);
									nodes.set_value_start(text_node_img, img_result.text_start);
									nodes.set_value_end(text_node_img, img_result.text_end);
									nodes.set_end(text_node_img, img_result.text_end);
								}

								chomp(img_result.end, true);
								states.pop(); // pop inline so parent state handles next char
								continue;
							}
						}

						// Not an image, treat ! as text
						node_stack.push(nodes.push(node_kind.text, cursor, current_node));
						nodes.set_value_start(node_stack[node_stack.length - 1], cursor);
						states.push(state_kind.text);
						chomp();
						continue;
					}

					case OPEN_ANGLE_BRACKET: {
						// Try to parse as autolink
						const uri_end = try_parse_uri_autolink(cursor + 1);
						if (uri_end !== -1) {
							// URI autolink: create link node with text child
							const link_node = nodes.push(node_kind.link, cursor, current_node);
							nodes.set_value_start(link_node, cursor + 1);
							nodes.set_value_end(link_node, uri_end - 1);
							nodes.set_end(link_node, uri_end);

							const text_node = nodes.push(node_kind.text, cursor + 1, link_node);
							nodes.set_value_start(text_node, cursor + 1);
							nodes.set_value_end(text_node, uri_end - 1);
							nodes.set_end(text_node, uri_end - 1);

							chomp(uri_end, true);
							states.pop(); // pop inline so parent state handles next char
							continue;
						}

						const email_end = try_parse_email_autolink(cursor + 1);
						if (email_end !== -1) {
							// Email autolink: create link node with text child
							const email_text = source.slice(cursor + 1, email_end - 1);
							const link_node = nodes.push(node_kind.link, cursor, current_node);
							nodes.set_value_start(link_node, cursor + 1);
							nodes.set_value_end(link_node, email_end - 1);
							nodes.set_end(link_node, email_end);
							nodes.set_metadata(link_node, { href: 'mailto:' + email_text });

							const text_node = nodes.push(node_kind.text, cursor + 1, link_node);
							nodes.set_value_start(text_node, cursor + 1);
							nodes.set_value_end(text_node, email_end - 1);
							nodes.set_end(text_node, email_end - 1);

							chomp(email_end, true);
							states.pop(); // pop inline so parent state handles next char
							continue;
						}

						// Not an autolink, treat < as text
						node_stack.push(nodes.push(node_kind.text, cursor, current_node));
						nodes.set_value_start(node_stack[node_stack.length - 1], cursor);
						states.push(state_kind.text);
						chomp();
						continue;
					}

					default: {
						if (!code) {
							// EOF: Just pop this state, let previous state handle EOF
							states.pop();
							continue;
						}
						node_stack.push(nodes.push(node_kind.text, cursor, current_node));
						nodes.set_value_start(node_stack[node_stack.length - 1], cursor);

						states.push(state_kind.text);
						chomp();
						continue;
					}
				}
			}

			case state_kind.text: {
				// Handle backslash escapes within text
				if (code === BACKSLASH) {
					const next_code = source.charCodeAt(cursor + 1);
					if (is_ascii_punctuation(next_code)) {
						chomp(2); // skip both \ and the escaped char
						continue;
					}
				}

				if (!code || (code === LINEFEED && is_blank_line_after(cursor))) {
					states.pop();

					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();

					continue;
				} else if (
					code === LINEFEED &&
					is_heading_start(cursor + 1)
				) {
					states.pop();

					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();

					continue;
				} else if (
					code === LINEFEED &&
					is_thematic_break_start(cursor + 1)
				) {
					states.pop();

					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();

					continue;
				} else if (code === ASTERISK || code === UNDERSCORE || code === OPEN_ANGLE_BRACKET || code === OPEN_SQUARE_BRACKET || (code === EXCLAMATION_MARK && source.charCodeAt(cursor + 1) === OPEN_SQUARE_BRACKET)) {
					states.pop();

					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();
					states.pop();

					continue;
				}
				chomp();
				continue;
			}

			case state_kind.code_span_start: {
				if (extra > 2) {
					// console.log('code_span_start with more than 2 backticks');
					states.pop();
					states.push(state_kind.text);
					node_stack.push(
						nodes.push(node_kind.text, cursor - extra, current_node)
					);
					nodes.set_value_start(node_stack[node_stack.length - 1], cursor);
					continue;
				}

				switch (code) {
					case BACKTICK: {
						checkpoint_cursor = cursor;
						extra += 1;
						// cursor += 1;
						chomp();
						continue;
					}
					case OCTOTHERP: {
						if (source.charCodeAt(cursor + 1) === EXCLAMATION_MARK) {
							// cursor += 2;
							chomp(2);
							// console.log('code_span_info');
							states.pop();
							states.push(state_kind.code_span_info);
							metadata.info_start = cursor;
						}
						continue;
					}
					case SPACE: {
						// console.log('code_span_start with space');
						checkpoint_cursor = cursor;
						states.pop();
						states.push(state_kind.code_span_content_leading_space);
						node_stack.push(
							nodes.push(node_kind.code_span, cursor - extra, current_node)
						);
						nodes.set_value_start(
							node_stack[node_stack.length - 1],
							cursor + 1
						);

						// leading_space = 1;
						// cursor += 2;
						chomp(2);

						continue;
					}
					default: {
						// console.log('Checkpoint cursor', cursor);

						states.pop();
						states.push(state_kind.code_span_end);
						node_stack.push(
							nodes.push(node_kind.code_span, cursor - extra, current_node)
						);
						nodes.set_value_start(node_stack[node_stack.length - 1], cursor);

						continue;
					}
				}
			}

			case state_kind.code_span_info: {
				// console.log('code_span_info', {
				// 	code,
				// 	cursor,
				// 	extra,
				// 	info_start: metadata.info_start,
				// });
				switch (code) {
					case SPACE: {
						metadata.info_end = cursor;
						checkpoint_cursor = cursor + 1;
						states.pop();
						if (source.charCodeAt(cursor + 1) === SPACE) {
							states.push(state_kind.code_span_content_leading_space);
							// cursor += 2;
							chomp(2);
						} else {
							states.push(state_kind.code_span_end);
							// cursor += 1;
							chomp();
						}

						const n = nodes.push(
							node_kind.code_span,
							metadata.info_start - 2 - extra,
							current_node
						);
						node_stack.push(n);

						nodes.set_metadata(n, {
							info_start: metadata.info_start,
							info_end: metadata.info_end,
						});

						nodes.set_value_start(n, cursor);

						continue;
					}
					default: {
						// cursor += 1;
						chomp();
						continue;
					}
				}
			}

			case state_kind.code_span_content_leading_space: {
				// console.log('code_span_content_leading_space', cursor, code);
				if (code === SPACE && source.charCodeAt(cursor + 1) === BACKTICK) {
					// cursor += 1;
					chomp();
					states.pop();
					states.push(state_kind.code_span_leading_space_end);
					continue;
				} else if (code === BACKTICK && source.charCodeAt(cursor - 1) !== BACKTICK) {
					// potential closing backtick without trailing space
					if (
						(extra === 1 && source.charCodeAt(cursor + 1) !== BACKTICK) ||
						(extra === 2 &&
							source.charCodeAt(cursor + 1) === BACKTICK &&
							source.charCodeAt(cursor + 2) !== BACKTICK)
					) {
						// valid closer — include leading space in value (no trailing space to strip)
						nodes.set_value_start(current_node, checkpoint_cursor);
						nodes.set_value_end(current_node, cursor);
						nodes.set_end(current_node, cursor + extra);
						node_stack.pop();
						states.pop();
						chomp(extra);
						continue;
					}
					chomp();
					continue;
				} else if (code === LINEFEED) {
					nodes.set_value_start(current_node, checkpoint_cursor);
					// console.log(
					// 	'code_span_content_leading_space with linefeed',
					// 	cursor,
					// 	checkpoint_cursor
					// );
					// cursor = checkpoint_cursor;
					chomp(cursor, true);
					states.pop();
					states.push(state_kind.code_span_end);
					continue;
				} else {
					// cursor += 1;
					chomp();
					continue;
				}
			}

			case state_kind.code_span_leading_space_end: {
				// console.log('code_span_leading_space_end', { cursor, code, extra });
				if (
					extra === 1 &&
					code === BACKTICK &&
					source.charCodeAt(cursor + 1) !== BACKTICK
				) {
					// console.log('code_span_leading_space_end with 1 backtick');
					states.pop();
					// states.push(state_kind.code_span_end);
					nodes.set_end(current_node, cursor + extra);
					nodes.set_value_end(current_node, cursor - 1);
					node_stack.pop();
				} else if (
					extra === 2 &&
					code === BACKTICK &&
					source.charCodeAt(cursor + 1) === BACKTICK &&
					source.charCodeAt(cursor + 2) !== BACKTICK
				) {
					// console.log('code_span_leading_space_end with  2 backticks');
					states.pop();
					// states.push(state_kind.code_span_end);
					nodes.set_end(current_node, cursor + extra);
					nodes.set_value_end(current_node, cursor - 1);
					node_stack.pop();
				} else {
					states.pop();
					states.push(state_kind.code_span_content_leading_space);
					//
				}
				// cursor += extra;
				chomp(extra);
				continue;
			}

			case state_kind.code_span_end: {
				// console.log('code_span_end', { cursor, code, extra });

				if (code === BACKTICK) {
					if (
						(extra === 1 && source.charCodeAt(cursor + 1) !== BACKTICK) ||
						(extra === 2 &&
							source.charCodeAt(cursor + 1) === BACKTICK &&
							source.charCodeAt(cursor + 2) !== BACKTICK)
					) {
						// console.log('setting value end to', cursor);
						// console.log('setting end to', cursor + extra - 1);
						nodes.set_value_end(current_node, cursor);
						states.pop();
						nodes.set_end(current_node, cursor + extra);
						node_stack.pop();
						// cursor += extra;
						chomp(extra);
						continue;
					}
				}

				if (
					(code === LINEFEED && is_blank_line_after(cursor)) ||
					isNaN(code)
				) {
					// cursor = checkpoint_cursor;
					chomp(checkpoint_cursor, true);
					nodes.pop();
					node_stack.pop();
					states.pop();
					states.push(state_kind.text);
					node_stack.push(
						nodes.push(
							node_kind.text,
							checkpoint_cursor,
							node_stack[node_stack.length - 1]
						)
					);
					nodes.set_value_start(
						node_stack[node_stack.length - 1],
						checkpoint_cursor
					);

					continue;
				}
				// cursor += 1;
				chomp();
				continue;
			}

			default: {
				// TODO: why do we pop here?
				// states.pop();
				// cursor += 1;
				chomp();
				continue;
			}

			// TODO: This shouldn't exist
			// text is just text

			// case state_kind.heading_text: {
			// 	if (!heading) {
			// 		states.pop();
			// 		if (parents.length > 1) {
			// 			parents.pop();
			// 		}
			// 		continue;
			// 	}

			// 	if (cursor >= length || code === LINEFEED) {
			// 		const heading_end =
			// 			code === LINEFEED ? Math.min(length, cursor + 1) : cursor;
			// 		const raw_value_end = cursor;
			// 		const value_end = trim_trailing_whitespace(
			// 			heading.content_start,
			// 			raw_value_end
			// 		);
			// 		finalize_heading(heading_end, value_end);
			// 		states.pop();
			// 		parents.pop();
			// 		heading = null;
			// 		if (code === LINEFEED) {
			// 			emit_with_parent(node_kind.line_break, cursor, cursor + 1);
			// 			cursor += 1;
			// 			line_start = cursor;
			// 		}
			// 		continue;
			// 	}

			// 	const text_start = cursor;
			// 	while (cursor < length) {
			// 		const ch = source.charCodeAt(cursor);
			// 		if (ch === LINEFEED) {
			// 			break;
			// 		}
			// 		cursor += 1;
			// 	}

			// 	if (cursor > text_start) {
			// 		emit_with_parent(
			// 			node_kind.text,
			// 			text_start,
			// 			cursor,
			// 			0,
			// 			text_start,
			// 			cursor,
			// 			heading.node_index
			// 		);
			// 		heading.saw_content = true;
			// 		set_heading_value(heading.content_start, cursor);
			// 		extend_heading_span(cursor);
			// 	}
			// 	continue;
			// }
		}
	}

	for (let i = 0; i < node_stack.length; i++) {
		nodes.gently_set_end(node_stack[i], length - 1);
		nodes.gently_set_value_end(node_stack[i], length - 1);
	}

	nodes.repair();

	return { nodes, errors };
}

/**
 * Consume plain text until a control character or delimiter is hit.
 * @param context Shared parsing state.
 * @param position Offset where text consumption begins.
 * @returns Offset after the consumed text.
 */
function chomp_text(
	context: parse_context,
	position: number,
	parent: number
): number {
	const { source, length } = context;
	const start = position;
	while (position < length) {
		const code = source.charCodeAt(position);
		if (
			code === LINEFEED ||
			code === OPEN_ANGLE_BRACKET ||
			code === OPEN_BRACE ||
			code === BACKTICK ||
			code === OCTOTHERP
		) {
			break;
		}
		position += 1;
	}

	if (position > start) {
		// emit_token(
		// 	context,
		// 	node_kind.text,
		// 	start,
		// 	position,
		// 	0,
		// 	start,
		// 	position,
		// 	parent
		// );
	}
	return position;
}

/**
 * Parse a fenced code block and emit either a fence token or fallback text.
 * @param context Shared parsing state.
 * @param position Offset where the fence begins.
 * @returns Offset immediately after the closing fence or end of input.
 */
function consume_code_fence(
	context: parse_context,
	position: number,
	parent: number
): number {
	const { source, length, errors } = context;
	const start = position;
	const fence_char = source.charCodeAt(position);
	let run = 0;
	while (position < length && source.charCodeAt(position) === fence_char) {
		run += 1;
		position += 1;
	}

	if (run < 3) {
		return start;
	}

	const info_start = position;
	let info_end = position;
	let info_contains_illegal_backtick = false;
	while (info_end < length && source.charCodeAt(info_end) !== LINEFEED) {
		if (fence_char === BACKTICK && source.charCodeAt(info_end) === BACKTICK) {
			info_contains_illegal_backtick = true;
		}
		info_end += 1;
	}

	if (info_contains_illegal_backtick) {
		return start;
	}

	const content_start = info_end < length ? info_end + 1 : info_end;
	let position_after_open = content_start;

	while (position_after_open < length) {
		const code = source.charCodeAt(position_after_open);
		if (code === fence_char) {
			let closing = position_after_open;
			let matching = 0;
			while (
				closing < length &&
				source.charCodeAt(closing) === fence_char &&
				matching < run
			) {
				matching += 1;
				closing += 1;
			}
			if (matching === run) {
				// emit_token(
				// 	context,
				// 	node_kind.code_fence,
				// 	start,
				// 	closing,
				// 	0,
				// 	content_start,
				// 	position_after_open,
				// 	parent
				// );
				return closing;
			}
			position_after_open = closing;
			continue;
		}
		position_after_open += 1;
	}

	errors.push(start);
	// emit_token(
	// 	context,
	// 	node_kind.code_fence,
	// 	start,
	// 	length,
	// 	0,
	// 	content_start,
	// 	length,
	// 	parent
	// );
	return length;
}
