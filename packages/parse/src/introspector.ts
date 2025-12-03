import { kind_to_string } from './utils';
import { state_kind } from './main';

class Introspector {
	state_paths: number[] = [];
	/** 0 -> enter, 1-> exit */
	transitions: number[] = [];
	cursor_positions: number[] = [];
	input: string;

	constructor(input: string) {
		this.input = input;
	}
	enter(state: state_kind, cursor: number) {
		this.state_paths.push(state);
		this.transitions.push(0);
		this.cursor_positions.push;
	}

	exit(cursor: number) {
		this.state_paths.push(this.state_paths[this.state_paths.length - 1]);
		this.transitions.push(1);
		this.cursor_positions.push(cursor);
	}

	get_state_at(index: state_kind) {
		let state = [];
		for (let i = index - 1; i > 0; i--) {
			state.push({
				char: this.input[this.cursor_positions[i]],
				code: this.input.charCodeAt(this.cursor_positions[i]),
				cursor: this.cursor_positions[i],
				transition: this.transitions[i],
				state: kind_to_string(this.state_paths[i]),
			});

			if (this.state_paths[index] === 0) {
				break;
			}
		}

		return state.reverse();
	}
}
