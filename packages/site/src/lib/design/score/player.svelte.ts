// plays a streamed score bar by bar, for <Score stream={player.pos}>: quick
// through text, slower where the parser decides, and lingering where it holds,
// since a fermata means hold longer than written. From 05's player.svelte.ts
// and the penguin's Lingering
import { read } from './reading';

export class Player {
	pos = $state(0);
	playing = $state(false);
	#source: () => string;
	#frame = 0;

	/** the source getter is the same one the score is given */
	constructor(source: () => string) {
		this.#source = source;
	}

	#reading() {
		return read(this.#source(), { stream: true });
	}

	get last() {
		return this.#reading().bars.length - 1;
	}

	/** rubato: linger where a guess opens, longer where one is settled */
	beat(i: number) {
		const bar = this.#reading().bars[i];
		const ops = bar?.ops ?? [];
		if (ops.some((op) => op.op === 'revoke' || op.op === 'commit')) return 1100;
		if (ops.some((op) => op.op === 'open' && op.pending)) return 450;
		if (ops.some((op) => op.op === 'open') || bar?.held) return 160;
		return 38;
	}

	play() {
		if (this.pos >= this.last) this.pos = 0;
		this.playing = true;
		let wait = this.beat(this.pos);
		let then = performance.now();
		const tick = (now: number) => {
			if (!this.playing) return;
			wait -= now - then;
			then = now;
			// a slow frame owes several beats, a hidden tab many, play them all
			while (wait <= 0) {
				this.pos += 1;
				if (this.pos >= this.last) {
					this.playing = false;
					return;
				}
				wait += this.beat(this.pos);
			}
			this.#frame = requestAnimationFrame(tick);
		};
		this.#frame = requestAnimationFrame(tick);
	}

	stop() {
		this.playing = false;
		cancelAnimationFrame(this.#frame);
	}

	toggle() {
		if (this.playing) this.stop();
		else this.play();
	}
}
