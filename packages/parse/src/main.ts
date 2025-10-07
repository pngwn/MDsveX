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
} from './constants';

import type { parse_options, parse_result, parse_context } from './types';
import { node_kind } from './utils';
import { node_buffer, error_collector } from './utils';
/** Default number of token entries to preallocate. */
const DEFAULT_TOKEN_CAPACITY = 128;

/** Default number of error entries to preallocate. */
const DEFAULT_ERROR_CAPACITY = 32;

/** Default node capacity for the arena allocator. */
const DEFAULT_NODE_CAPACITY = 128;

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
	console.log('input', input);
	const { nodes, errors } = tokenize(input);

	return { nodes, errors };
}

/**
 * Tokenize the source string and populate token, arena, and error buffers.
 * @param context Shared parsing state.
 */
function tokenize(source: string): {
	nodes: node_buffer;
	errors: error_collector;
} {
	const nodes = new node_buffer(source.length);

	let node_stack: number[] = [0];
	const errors = new error_collector(source.length);
	const length = source.length;

	const states: state_kind[] = [state_kind.root];

	let cursor = 0;

	let extra = 0;
	let metadata: Record<string, any> = {};
	let checkpoint_cursor = 0;
	console.log('states', states);

	while (cursor <= length) {
		const active = states[states.length - 1];
		const code = source.charCodeAt(cursor);
		const current_parent = node_stack[node_stack.length - 1] || 0;
		const current_node = node_stack[node_stack.length - 1] || 0;

		console.log(
			'states',
			states,
			'active_state: ',
			active,
			'cursor: ',
			cursor,
			'char: ',
			source[cursor],
			'current_parent: ',
			current_parent,
			'current_node: ',
			current_node
		);
		switch (active) {
			case state_kind.root: {
				if (isNaN(code)) {
					cursor += 1;
					continue;
				}
				switch (code) {
					case SPACE:
					case TAB:
					case LINEFEED: {
						cursor += 1;
						continue;
					}

					case OCTOTHERP: {
						// states.push(state_kind.text);
						// states.push(state_kind.heading_marker);
						continue;
					}

					case BACKTICK: {
						states.push(state_kind.code_fence_start);
						extra = 0;
						continue;
					}
					default: {
						states.push(state_kind.paragraph);
						node_stack.push(
							nodes.push(node_kind.paragraph, cursor, current_parent)
						);

						continue;
					}
				}
			}

			case state_kind.paragraph: {
				if (
					(code === LINEFEED && source.charCodeAt(cursor + 1) === LINEFEED) ||
					!code ||
					(code === LINEFEED && !source[cursor + 1])
				) {
					nodes.set_end(current_node, cursor);
					states.pop();
					node_stack.pop();
					cursor += 2;
					continue;
				} else if (
					code === LINEFEED &&
					source.charCodeAt(cursor + 1) === BACKTICK &&
					source.charCodeAt(cursor + 2) === BACKTICK &&
					source.charCodeAt(cursor + 3) === BACKTICK
				) {
					nodes.set_end(current_node, cursor);
					node_stack.pop();
					states.pop();
					states.push(state_kind.code_fence_start);

					cursor += 1;
					continue;
				} else if (code === LINEFEED) {
					cursor += 1;
					continue;
				} else if (false) {
				} else {
					// node_stack.push(nodes.push(node_kind.text, cursor, current_parent));
					// nodes.set_value_start(node_stack[node_stack.length - 1], cursor);

					states.push(state_kind.inline);
					continue;
				}
			}

			case state_kind.code_fence_start: {
				if (code === BACKTICK) {
					extra += 1;
					cursor += 1;
					continue;
				} else if (extra >= 3) {
					states.pop();
					states.push(state_kind.code_fence_info);
					node_stack.push(
						nodes.push(node_kind.code_fence, cursor - extra, current_parent)
					);

					metadata.info_start = cursor;

					continue;
				} else {
					states.pop();
					node_stack.push(
						nodes.push(node_kind.paragraph, cursor - extra, current_parent)
					);
					states.push(state_kind.paragraph);
					cursor = cursor - extra;
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
					cursor += 1;
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
					cursor += 1;

					nodes.set_value_start(current_node, cursor);

					continue;
				}
			}

			case state_kind.code_fence_content: {
				const index = source.indexOf(fences[extra], cursor - 1);
				const nl_index = source.lastIndexOf('\n', index);
				if (cursor >= length || index === -1) {
					states.pop();
					states.push(state_kind.code_fence_text_end);
					cursor = length;
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
					cursor = index + extra;
					continue;
				}

				if (index !== -1 && nl_index !== -1 && ws) {
					if (index + extra <= length) {
						states.pop();
						states.push(state_kind.code_fence_text_end);
						nodes.set_value_end(current_node, nl_index);

						cursor = index + extra;
					}
					continue;
				} else {
					states.pop();
					cursor = length;
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
				cursor += 1;
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

			case state_kind.inline: {
				console.log('inline', { code });
				switch (code) {
					case BACKTICK: {
						console.log('code_span_start');
						states.push(state_kind.code_span_start);
						extra = 0;
						continue;
					}
					case LINEFEED: {
						if (
							source.charCodeAt(cursor + 1) === LINEFEED ||
							!source[cursor + 1]
						) {
							states.pop();

							continue;
						} else {
							cursor += 1;
							continue;
						}
					}

					default: {
						if (!code) {
							states.pop();

							continue;
						}
						node_stack.push(nodes.push(node_kind.text, cursor, current_parent));
						nodes.set_value_start(node_stack[node_stack.length - 1], cursor);

						states.push(state_kind.text);
						continue;
					}
				}
			}

			case state_kind.text: {
				if (!code || (code === LINEFEED && !source[cursor + 1])) {
					states.pop();

					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();
					continue;
				} else if (
					code === LINEFEED &&
					source.charCodeAt(cursor + 1) === LINEFEED
				) {
					states.pop();

					nodes.set_end(current_node, cursor);
					nodes.set_value_end(current_node, cursor);
					node_stack.pop();
					continue;
				}
				cursor += 1;
				continue;
			}

			case state_kind.code_span_start: {
				if (extra > 2) {
					console.log('code_span_start with more than 2 backticks');
					states.pop();
					states.push(state_kind.text);
					node_stack.push(
						nodes.push(node_kind.text, cursor - extra, current_parent)
					);
					nodes.set_value_start(node_stack[node_stack.length - 1], cursor);
					continue;
				}

				switch (code) {
					case BACKTICK: {
						checkpoint_cursor = cursor;
						extra += 1;
						cursor += 1;
						continue;
					}
					case OCTOTHERP: {
						if (source.charCodeAt(cursor + 1) === EXCLAMATION_MARK) {
							cursor += 2;
							console.log('code_span_info');
							states.pop();
							states.push(state_kind.code_span_info);
							metadata.info_start = cursor;
						}
						continue;
					}
					case SPACE: {
						console.log('code_span_start with space');
						checkpoint_cursor = cursor;
						states.pop();
						states.push(state_kind.code_span_content_leading_space);
						node_stack.push(
							nodes.push(node_kind.code_span, cursor - extra, current_parent)
						);
						nodes.set_value_start(
							node_stack[node_stack.length - 1],
							cursor + 1
						);

						// leading_space = 1;
						cursor += 2;

						continue;
					}
					default: {
						console.log('Checkpoint cursor', cursor);

						states.pop();
						states.push(state_kind.code_span_end);
						node_stack.push(
							nodes.push(node_kind.code_span, cursor - extra, current_parent)
						);
						nodes.set_value_start(node_stack[node_stack.length - 1], cursor);

						continue;
					}
				}
			}

			case state_kind.code_span_info: {
				console.log('code_span_info', {
					code,
					cursor,
					extra,
					info_start: metadata.info_start,
				});
				switch (code) {
					case SPACE: {
						metadata.info_end = cursor;
						checkpoint_cursor = cursor + 1;
						states.pop();
						if (source.charCodeAt(cursor + 1) === SPACE) {
							states.push(state_kind.code_span_content_leading_space);
							cursor += 2;
						} else {
							states.push(state_kind.code_span_end);
							cursor += 1;
						}

						const n = nodes.push(
							node_kind.code_span,
							metadata.info_start - 2 - extra,
							current_parent
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
						cursor += 1;
						continue;
					}
				}
			}

			case state_kind.code_span_content_leading_space: {
				console.log('code_span_content_leading_space', cursor, code);
				if (code === SPACE && source.charCodeAt(cursor + 1) === BACKTICK) {
					cursor += 1;
					states.pop();
					states.push(state_kind.code_span_leading_space_end);
					continue;
				} else if (code === LINEFEED) {
					nodes.set_value_start(current_node, checkpoint_cursor);
					console.log(
						'code_span_content_leading_space with linefeed',
						cursor,
						checkpoint_cursor
					);
					cursor = checkpoint_cursor;
					states.pop();
					states.push(state_kind.code_span_end);
					continue;
				} else {
					cursor += 1;
					continue;
				}
			}

			case state_kind.code_span_leading_space_end: {
				console.log('code_span_leading_space_end', { cursor, code, extra });
				if (
					extra === 1 &&
					code === BACKTICK &&
					source.charCodeAt(cursor + 1) !== BACKTICK
				) {
					console.log('code_span_leading_space_end with 1 backtick');
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
					console.log('code_span_leading_space_end with  2 backticks');
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
				cursor += extra;
				continue;
			}

			case state_kind.code_span_end: {
				console.log('code_span_end', { cursor, code, extra });

				if (code === BACKTICK) {
					if (
						(extra === 1 && source.charCodeAt(cursor + 1) !== BACKTICK) ||
						(extra === 2 &&
							source.charCodeAt(cursor + 1) === BACKTICK &&
							source.charCodeAt(cursor + 2) !== BACKTICK)
					) {
						console.log('setting value end to', cursor);
						console.log('setting end to', cursor + extra - 1);
						nodes.set_value_end(current_node, cursor);
						states.pop();
						nodes.set_end(current_node, cursor + extra);
						node_stack.pop();
						cursor += extra;
						continue;
					}
				}

				if (
					(code === LINEFEED && source.charCodeAt(cursor + 1) === LINEFEED) ||
					isNaN(code)
				) {
					cursor = checkpoint_cursor;
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
				cursor += 1;
				continue;
			}

			default: {
				// TODO: why do we pop here?
				// states.pop();
				cursor += 1;
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
