import { state_kind } from './main';

export interface introspection_entry {
	step: number;
	cursor: number;
	char: string;
	code: number;
	states: string[];
	active: string;
}

export function state_kind_to_string(kind: state_kind): string {
	switch (kind) {
		case state_kind.root:
			return 'root';
		case state_kind.text:
			return 'text';
		case state_kind.heading_marker:
			return 'heading_marker';
		case state_kind.code_fence_start:
			return 'code_fence_start';
		case state_kind.code_fence_info:
			return 'code_fence_info';
		case state_kind.code_fence_content:
			return 'code_fence_content';
		case state_kind.code_fence_text_end:
			return 'code_fence_text_end';
		case state_kind.paragraph:
			return 'paragraph';
		case state_kind.inline:
			return 'inline';
		case state_kind.code_span_start:
			return 'code_span_start';
		case state_kind.code_span_info:
			return 'code_span_info';
		case state_kind.code_span_content_leading_space:
			return 'code_span_content_leading_space';
		case state_kind.code_span_leading_space_end:
			return 'code_span_leading_space_end';
		case state_kind.code_span_end:
			return 'code_span_end';
		case state_kind.strong_emphasis:
			return 'strong_emphasis';
		case state_kind.emphasis:
			return 'emphasis';
		default:
			return `unknown(${kind})`;
	}
}

export class Introspector {
	/** @internal */
	_steps: { cursor: number; states: number[] }[] = [];
	private input: string;

	constructor(input: string) {
		this.input = input;
	}

	/** Record the current parser state. Called each iteration of the main loop. */
	step(cursor: number, states: state_kind[]) {
		this._steps.push({ cursor, states: states.slice() });
	}

	/** Get the state stack at a given cursor position (last visit). */
	get_state_at(position: number): introspection_entry | null {
		for (let i = this._steps.length - 1; i >= 0; i--) {
			if (this._steps[i].cursor === position) {
				return this._format(i);
			}
		}
		return null;
	}

	/** Get all recorded states at a given cursor position (cursor may visit a position multiple times). */
	get_all_states_at(position: number): introspection_entry[] {
		const results: introspection_entry[] = [];
		for (let i = 0; i < this._steps.length; i++) {
			if (this._steps[i].cursor === position) {
				results.push(this._format(i));
			}
		}
		return results;
	}

	/** Get the full ordered trace of all steps. */
	get_trace(): introspection_entry[] {
		return this._steps.map((_, i) => this._format(i));
	}

	private _format(index: number): introspection_entry {
		const s = this._steps[index];
		const states = s.states.map((v) =>
			state_kind_to_string(v as state_kind)
		);
		return {
			step: index,
			cursor: s.cursor,
			char: this.input[s.cursor] ?? 'EOF',
			code: this.input.charCodeAt(s.cursor),
			states,
			active: states[states.length - 1],
		};
	}
}
