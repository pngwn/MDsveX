<script lang="ts" module>
	/** a lit phrase: what hover, focus or a caret points at, shared with the output beside a score */
	export interface Focus {
		start: number;
		end: number;
		kind: string;
	}
</script>

<script lang="ts">
	// the score, design/SCORE.md: the parser's reading of a source drawn over the
	// source. From 05's Notation.svelte with v12's choices as its only behaviour:
	//
	// - no stave rules, only the phrases over the underlay, unless given `staves`:
	//   then each row of phrases sits on a stave as long as its line, as 02's v7 drew it
	// - nested: a block that takes more than one system is drawn once, over its
	//   first, as wide as its widest line, with a bracket down the margin
	// - a bar where a phrase opens and one where it closes, 1.5px like its line
	// - text phrases quiet, unnamed, their rows closed up, given `text`
	// - names hugging the corner of their opening bar and their line
	// - a bar line after the last line of a block, the double bar at the end,
	//   given `bars`
	// - pointing at a phrase washes its characters in its own colour and steps
	//   everything else back
	//
	// Given `stream`, the bar it names is drawn instead of the settled reading,
	// with the streaming marks: guesses raised and dashed, revoked guesses struck,
	// held characters under the bird's eye
	import BirdsEye from '../penguin/BirdsEye.svelte';
	import { tone, type Tone } from './kinds';
	import { place, strokes, systems, type Placed, type Stroke, type System } from './layout';
	import { read, settled } from './reading';
	import type { Syntax } from '../pfm';

	interface Props {
		/** the PFM source to read */
		source: string;
		/**
		 * riso, pngwn's pick, or Okabe and Ito's colour blind safe colours, or the
		 * four voices, colouring by family rather than construct, for a Title
		 */
		palette?: 'riso' | 'cvd' | 'voice';
		/**
		 * streams the source a character at a time and draws this bar of it, with
		 * the streaming marks: bar i is the reading after i + 1 characters, the
		 * last is the finished document. Leave it out for the settled reading
		 */
		stream?: number;
		/** the lit phrase, bindable so the output beside the score can light with it */
		focus?: Focus | null;
		/** draw a stave under each row of phrases, the length of its line */
		staves?: boolean;
		label?: string;
		/**
		 * source ranges the page points at, `[start, end)`, ruled under their cells
		 * in the ink: the characters a docs contrast turns on, a space included
		 */
		cue?: [number, number][];
		/**
		 * the syntax choices the parser reads with, mdsvex's `unwrap_images`, for
		 * a docs example compiled with a config that sets it
		 */
		syntax?: Syntax;
		/**
		 * draw the text phrases, the quiet strokes under plain runs of text, and
		 * their rows. Off, only structure is drawn and the source reads clearer;
		 * the atlas and the design page turn it on
		 */
		text?: boolean;
		/** draw a bar line after each block and the double bar at the end */
		bars?: boolean;
	}

	let {
		source,
		palette = 'riso',
		stream,
		focus = $bindable(null),
		staves = false,
		label = 'The parser’s reading of the source',
		cue = [],
		syntax = {},
		text = false,
		bars = false,
	}: Props = $props();

	const NBSP = String.fromCharCode(160);

	let streaming = $derived(stream !== undefined);
	let reading = $derived(read(source, { stream: streaming, syntax }));
	let bar = $derived(streaming ? reading.bars[Math.max(0, Math.min(stream!, reading.bars.length - 1))] : settled(reading));
	let length = $derived(source.length);
	let fed = $derived(streaming ? bar.fed : length);
	let drawn = $derived.by(() => {
		const all = strokes(bar, streaming);
		return text ? all : all.filter((m) => m.ink !== 'text');
	});

	/** each markup character takes the name tone of the construct it belongs to */
	let owner = $derived.by(() => {
		const out: (Tone | undefined)[] = new Array(length);
		const structure = bar.phrases.filter((p) => p.kind !== 'text').sort((a, b) => a.depth - b.depth);
		for (const p of structure) for (let i = p.start; i < (p.end ?? fed); i++) out[i] = tone(p.kind);
		// a quote's `>` on a line inside a list item still belongs to the quote, which
		// the ranges alone don't say: the item's range runs over it
		for (const q of structure.filter((p) => p.kind === 'block_quote')) {
			const column = q.start - (source.lastIndexOf('\n', q.start - 1) + 1);
			for (let line = q.start - column; line < (q.end ?? fed); line = source.indexOf('\n', line) + 1 || length) {
				const at = line + column;
				if (source[at] === '>') out[at] = 'quote';
			}
		}
		return out;
	});

	// a nested block's bracket sits in the margin, one step in for each block around it
	let levels = $derived(Math.max(1, ...drawn.filter((m) => m.block).map((m) => m.depth)));

	// the measure: how many characters fit, from the real width of a cell
	let width = $state(0);
	let cell = $state(0);
	let gutter = $state(0);
	let letter = $state(0);
	let probe: HTMLElement | undefined = $state();
	let margin_probe: HTMLElement | undefined = $state();
	let name_probe: HTMLElement | undefined = $state();

	function measure() {
		if (!probe || !margin_probe || !name_probe) return;
		cell = probe.getBoundingClientRect().width;
		gutter = margin_probe.getBoundingClientRect().width;
		letter = name_probe.getBoundingClientRect().width / 10;
	}

	$effect(() => {
		void width;
		void levels;
		measure();
	});

	$effect(() => {
		document.fonts?.ready.then(measure);
	});

	let cols = $derived(width && cell ? Math.max(10, Math.floor((width - gutter) / cell) - 1) : 64);
	let laid = $derived(systems(source, cols));

	/** the first and last system each phrase falls in */
	let spans = $derived.by(() => {
		const out = new Map<string, [number, number]>();
		for (const m of drawn) {
			let a = -1;
			let b = -1;
			laid.forEach((sys, k) => {
				if (!place(m, sys, fed)) return;
				if (a < 0) a = k;
				b = k;
			});
			out.set(m.key, [a, b]);
		}
		return out;
	});

	function nested(m: Stroke) {
		const [a, b] = spans.get(m.key) ?? [0, 0];
		return m.block && b > a;
	}

	type Named = Placed & { name: string | null; header?: boolean };

	interface Row {
		key: string;
		header: boolean;
		placed: Named[];
		/** only text phrases, so no names: the row closes up */
		quiet: boolean;
		/** it holds a guess, raised, so the row is taller by the raise */
		raised: boolean;
	}

	interface Bracket {
		stroke: Stroke;
		level: number;
		/** the grid row it starts on, its header's in the first system */
		row: number;
		first: boolean;
		last: boolean;
	}

	interface Laid {
		sys: System;
		rows: Row[];
		brackets: Bracket[];
		/** a block ends here, a bar line closes the system */
		closes: boolean;
		/** the column the system's widest phrase runs to */
		to: number;
	}

	let engraved = $derived.by((): Laid[] =>
		laid.map((sys, k) => {
			const rows: Row[] = [];
			// a nested block opening in this system gets a row of its own, the outermost first
			const opening = drawn.filter((m) => nested(m) && spans.get(m.key)![0] === k).sort((a, b) => a.depth - b.depth);
			for (const m of opening) {
				const [, b] = spans.get(m.key)!;
				// as wide as the construct's widest line, not only the first
				let x1 = 0;
				for (let j = k; j <= b; j++) x1 = Math.max(x1, place(m, laid[j], fed)?.x1 ?? 0);
				rows.push({
					key: `h${m.key}`,
					header: true,
					quiet: false,
					raised: !!m.pending,
					placed: [{ stroke: m, x0: m.start - sys.start, x1, head: true, tail: false, name: m.name, header: true }],
				});
			}
			const by_depth = new Map<number, Placed[]>();
			for (const m of drawn) {
				if (nested(m)) continue;
				const p = place(m, sys, fed);
				if (!p) continue;
				by_depth.set(m.depth, [...(by_depth.get(m.depth) ?? []), p]);
			}
			for (const depth of [...by_depth.keys()].sort((a, b) => a - b)) {
				const placed = named(by_depth.get(depth)!);
				rows.push({
					key: `d${depth}`,
					header: false,
					quiet: placed.every((p) => p.stroke.ink === 'text'),
					raised: placed.some((p) => p.stroke.pending),
					placed,
				});
			}

			const brackets: Bracket[] = [];
			for (const m of drawn) {
				if (!nested(m)) continue;
				const [a, b] = spans.get(m.key)!;
				if (k < a || k > b) continue;
				const row = k === a ? rows.findIndex((r) => r.key === `h${m.key}`) + 1 : 1;
				brackets.push({ stroke: m, level: m.depth - 1, row, first: k === a, last: k === b });
			}

			// a top level block that ends in this system ends a passage
			const closes =
				k === laid.length - 1 || drawn.some((m) => m.depth === 1 && m.ink !== 'text' && spans.get(m.key)![1] === k);
			const to = Math.max(sys.end - sys.start, ...rows.flatMap((r) => r.placed.map((p) => p.x1)));
			return { sys, rows, brackets, closes, to };
		}),
	);

	/** which strokes in a row get their name, so no two names collide */
	function named(placed: Placed[]): Named[] {
		const taken: [number, number][] = [];
		const clear = (l: number, r: number) => taken.every(([a, b]) => r <= a || l >= b);
		const name_of = (p: Placed): string | null => {
			const s = p.stroke;
			// a text phrase is never named, its quiet line says enough
			if (s.ink === 'text') return null;
			const label = p.head ? s.name : `(${s.name})`;
			const left = p.x0 * (cell || 10);
			const right = left + label.length * (letter || 6) + 16;
			if (!clear(left, right)) return null;
			taken.push([left, right]);
			return label;
		};
		return placed.sort((a, b) => a.x0 - b.x0).map((p) => ({ ...p, name: name_of(p) }));
	}

	/** the grid column a phrase ends on; one that goes on into the next system runs to the widest line */
	function end_of(p: Named, to: number) {
		return p.header || p.tail ? p.x1 + 2 : to + 2;
	}

	/** the held characters, fed and not yet in any node, where the bird's eye sits over them */
	let fermata = $derived.by(() => {
		const held = streaming ? bar.held : null;
		if (!held) return null;
		const k = laid.findIndex((sys) => sys.end > held[0] && sys.start < held[1]);
		if (k < 0) return null;
		const sys = laid[k];
		const x0 = Math.max(held[0], sys.start) - sys.start;
		const x1 = Math.min(held[1], sys.end) - sys.start;
		// how many bars this hold has lasted, so a long one blinks
		let bars = 0;
		for (let i = stream!; i >= 0 && reading.bars[i]?.held?.[0] === held[0]; i--) bars++;
		return { k, x0, span: Math.max(1, x1 - x0), at: held[0], bars };
	});

	function is_held(i: number) {
		return streaming && !!bar.held && i >= bar.held[0] && i < bar.held[1];
	}

	function cued(i: number) {
		return cue.some(([a, b]) => i >= a && i < b);
	}

	function lit(i: number) {
		return !!focus && i >= focus.start && i < focus.end;
	}

	// a list and its only item can cover the same characters, so the kind decides
	function is_lit(s: Stroke) {
		return !!focus && focus.start === s.start && focus.end === (s.end ?? fed) && (!focus.kind || focus.kind === s.kind);
	}

	// pointing at a phrase lights it, pointing at a character lights the innermost node it is in
	function over(e: PointerEvent) {
		const el = (e.target as HTMLElement).closest<HTMLElement>('[data-start]');
		if (!el) return (focus = null);
		const start = Number(el.dataset.start);
		if (el.dataset.end) {
			focus = { start, end: Number(el.dataset.end), kind: el.dataset.kind ?? '' };
			return;
		}
		const inner = bar.phrases
			.filter((p) => p.kind !== 'text' && p.start <= start && start < (p.end ?? fed))
			.sort((a, b) => b.depth - a.depth)[0];
		focus = inner ? { start: inner.start, end: inner.end ?? fed, kind: inner.kind } : null;
	}
</script>

<figure
	class="score"
	class:dimmed={!!focus}
	data-palette={palette}
	style:--wash-c={focus ? `var(--line-${tone(focus.kind)})` : undefined}
	style:--levels={levels}
	bind:clientWidth={width}
	aria-label={label}
	onpointerover={over}
	onpointerleave={() => (focus = null)}
>
	<span class="probe cellw" bind:this={probe} aria-hidden="true"></span>
	<span class="probe marginw" bind:this={margin_probe} aria-hidden="true"></span>
	<em class="probe namew" bind:this={name_probe} aria-hidden="true">aceimnorst</em>
	<!-- the drawing is a character per cell, so a screen reader gets the source whole -->
	<pre class="said">{source}</pre>

	{#each engraved as { sys, rows, brackets, closes, to }, k (sys.start)}
		<div
			class="system"
			class:closes
			class:fine={sys.fine}
			aria-hidden="true"
			style:--cols={cols}
			style:--template={rows.map((r) => (r.quiet ? 'var(--_quiet-row)' : r.raised ? 'var(--_raised-row)' : 'var(--_row)')).join(' ')}
		>
			{#if staves}
				{#each rows as row, r (row.key)}
					<!-- as long as its line, or as the phrases on it when they run further -->
					<i
						class="stave"
						style:grid-row={r + 1}
						style:grid-column="2 / {Math.max(sys.end - sys.start + 2, ...row.placed.map((p) => end_of(p, to)))}"
					></i>
				{/each}
			{/if}

			{#each rows as row, r (row.key)}
				{#each row.placed as p (p.stroke.key)}
					{@const s = p.stroke}
					<span
						class="phrase {s.ink}"
						class:header={p.header}
						class:pending={s.pending}
						class:ghost={s.ghost}
						class:lit={is_lit(s)}
						style:grid-row={r + 1}
						style:grid-column="{p.header ? 1 : p.x0 + 2} / {end_of(p, to)}"
						style:--c={s.ghost ? 'var(--quiet)' : `var(--line-${s.tone})`}
						style:--n={s.ghost ? 'var(--quiet)' : `var(--name-${s.tone})`}
						style:--x0={p.x0}
						style:--level={s.depth - 1}
						data-start={s.start}
						data-end={s.end ?? fed}
						data-kind={s.kind}
						title="{s.name}, characters {s.start} to {s.end ?? fed}"
					>
						<i class="line"></i>
						{#if p.head}<i class="head"></i>{/if}
						<!-- a one character text phrase is its opening bar, a second beside it is noise -->
						{#if p.tail && !(s.ink === 'text' && p.x1 - p.x0 <= 1)}<i class="tick"></i>{/if}
						{#if p.name}<em class="name">{p.name}</em>{/if}
					</span>
				{/each}
			{/each}

			{#each brackets as b (b.stroke.key)}
				<span
					class="bracket-of"
					class:lit={is_lit(b.stroke)}
					class:first={b.first}
					class:last={b.last}
					style:--c="var(--line-{b.stroke.tone})"
					style:--level={b.level}
					style:grid-row="{b.row} / {b.last ? rows.length + 2 : rows.length + 3}"
				></span>
			{/each}

			{#if closes && bars}
				<span class="barline" style:grid-row={rows.length + 1} style:grid-column="{to + 2} / {to + 3}"></span>
			{/if}

			<div class="underlay" style:grid-row={rows.length + 1}>
				{#each source.slice(sys.start, sys.end) as ch, i (i)}
					{@const at = sys.start + i}
					{@const marked = !!bar.marks[at] && at < fed}
					<span
						class="ch"
						class:markup={marked}
						class:unread={at >= fed}
						class:held={is_held(at)}
						class:lit={lit(at)}
						class:cued={cued(at)}
						style:--c={marked ? `var(--name-${owner[at] ?? 'other'})` : undefined}
						data-start={at}
						style:grid-column={i + 1}>{ch === ' ' ? NBSP : ch}</span
					>
				{/each}
			</div>

			<!-- outside the underlay, whose riso mask would cut it where it rises over the cell -->
			{#if fermata?.k === k}
				<span class="fermata" style:grid-row={rows.length + 1} style:grid-column="{fermata.x0 + 2} / span {fermata.span}">
					{#key fermata.at}<BirdsEye held={fermata.bars} />{/key}
				</span>
			{/if}
		</div>
	{/each}
</figure>

<style>
	.score {
		/* the underlay: tracked wide like the Title, a little tighter as it gets
		   smaller. A page sets these to engrave a score larger or smaller */
		--_size: var(--size, 1.0625rem);
		--_track: var(--track, 0.22em);
		--_row: var(--row, 1.25rem);
		--_name-size: var(--name-size, 0.875rem);
		/* a row of text phrases alone, no names over it, only its bars to clear */
		--_quiet-row: var(--quiet-row, 0.6rem);
		/* how far a guess is raised while streaming, and its row grows by as much,
		   so a raised name never reaches the line of the row above */
		--_raise: calc(var(--_row) * 0.32);
		--_raised-row: calc(var(--_row) + var(--_raise));
		/* the gap after a system whose block goes on, and after one where a block ends */
		--_line-gap: var(--line-gap, 1.4rem);
		--_block-gap: var(--block-gap, 2.5rem);
		--_underlay-gap: var(--underlay-gap, 0.55rem);
		/* how far in each nested bracket steps */
		--_inset: var(--inset, 0.5rem);
		--_margin: var(--margin, calc(var(--_inset) * var(--levels) + 0.5rem));
		/* lines, bars and brackets, SCORE.md: heavier reads clearer but loses the lightness */
		--_w: 1.5px;

		position: relative;
		margin: 0;
		display: grid;
		color: var(--ink, #121318);
	}

	/* a phone holds about twenty characters at the desktop size, so the underlay
	   comes down to 15px at the tracking's floor, and nested brackets step in less */
	@media (max-width: 600px) {
		.score {
			--_size: var(--size, 0.9375rem);
			--_track: var(--track, 0.2em);
			--_inset: var(--inset, 0.4rem);
			--_name-size: var(--name-size, 0.8125rem);
		}
	}

	.probe {
		position: absolute;
		visibility: hidden;
		pointer-events: none;
	}

	.said {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: pre;
	}

	.cellw,
	.system {
		font: 400 var(--_size) / 1 var(--face-mono, 'Berkeley Mono', 'IBM Plex Mono', ui-monospace, monospace);
		font-variant-ligatures: none;
	}

	.cellw {
		width: calc(1ch + var(--_track));
	}

	.marginw {
		width: var(--_margin);
	}

	.namew,
	.name {
		font: italic 400 var(--_name-size) / 1 var(--face-display, 'Playfair', Georgia, serif);
		white-space: nowrap;
	}

	/* phrase names are Playfair, so they take linen; the mono takes riso */
	.name {
		mask-image: var(--linen-image, none);
		mask-size: var(--linen-size, auto);
		mask-composite: var(--linen-composite, add);
	}

	.system {
		display: grid;
		grid-template-columns: var(--_margin) repeat(var(--cols), calc(1ch + var(--_track))) minmax(0, 1fr);
		grid-template-rows: var(--template) auto var(--_line-gap);
		position: relative;
	}

	.system.closes {
		grid-template-rows: var(--template) auto var(--_block-gap);
	}

	.system.fine {
		grid-template-rows: var(--template) auto 0;
	}

	/* with no staves, the bar line belongs to the underlay alone, just past its last character */
	.barline {
		align-self: stretch;
		justify-self: start;
		width: 0;
		margin-left: 0.6rem;
		border-right: 1px solid var(--ink, #121318);
		pointer-events: none;
	}

	.fine .barline {
		width: 4px;
		border-right-width: 3.5px;
		border-left: 1px solid var(--ink, #121318);
		padding-left: 3px;
	}

	/* a stave sits under its row's phrases, centred on their lines and in their insets */
	.stave {
		align-self: end;
		margin: 0 calc(var(--_track) * 0.5);
		border-bottom: 1px solid var(--staff, #b9bac2);
		translate: 0 0.5px;
		pointer-events: none;
	}

	/* --at and --past are lengths in the underlay's cells, which are 1ch and an em
	   of tracking in Berkeley Mono. Registered, they resolve where they're set, on
	   the phrase in the mono, not again in the name's Playfair, whose ch is narrower */
	@property --at {
		syntax: '<length>';
		inherits: true;
		initial-value: 0px;
	}

	@property --past {
		syntax: '<length>';
		inherits: true;
		initial-value: 0px;
	}

	.phrase {
		/* where a name starts, 2px past its opening bar */
		--past: calc(var(--_track) * 0.5 + var(--_w) + 2px);
		position: relative;
		align-self: stretch;
		color: var(--c);
		cursor: default;
	}

	.line {
		position: absolute;
		left: calc(var(--_track) * 0.5);
		right: calc(var(--_track) * 0.5);
		bottom: calc(var(--_w) / -2);
		border-bottom: var(--_w) solid currentColor;
	}

	/* a bar where the node opens and where it closes, centred on its line */
	.head,
	.tick {
		position: absolute;
		bottom: -0.35rem;
		height: 0.7rem;
	}

	.head {
		left: calc(var(--_track) * 0.5);
		border-left: var(--_w) solid currentColor;
	}

	.tick {
		right: calc(var(--_track) * 0.5);
		border-right: var(--_w) solid currentColor;
	}

	/* the marks hang over the rows next to theirs, only the phrase's own row points at it */
	.line,
	.head,
	.tick,
	.name {
		pointer-events: none;
	}

	/* the name sits in the corner of its bar and its line, its left edge 2px past
	   the bar, its descenders 1px clear of the line. A line-height 1 box of
	   Playfair ends at its descenders, 0.22em under the baseline, so the baseline
	   sits about 4px over the line and the name reads as the line's, not the row's
	   above. Set lower, p and g cut the line */
	.name {
		position: absolute;
		color: var(--n, currentColor);
		left: var(--past);
		bottom: calc(var(--_w) / 2 + 1px);
		line-height: 1;
	}

	/* a nested block's phrase starts at its bracket in the margin and runs out to
	   its widest line; its opening bar and name sit at its first character */
	.header {
		--at: calc(var(--_margin) + var(--x0) * (1ch + var(--_track)));
	}

	.header .line {
		left: calc(var(--_inset) * var(--level) + 0.15rem);
	}

	.header .head {
		left: calc(var(--at) + var(--_track) * 0.5);
	}

	.header .name {
		left: calc(var(--at) + var(--past));
	}

	/* its bracket runs down the margin, from its phrase to the foot of its last line */
	.bracket-of {
		grid-column: 1;
		justify-self: start;
		margin-left: calc(var(--_inset) * var(--level) + 0.15rem);
		width: 0;
		border-left: var(--_w) solid var(--c);
		pointer-events: none;
	}

	.bracket-of.first {
		margin-top: calc(var(--_row) - var(--_w) / 2);
	}

	.bracket-of.last {
		width: 0.3rem;
		border-bottom: var(--_w) solid var(--c);
		margin-bottom: 0.1rem;
	}

	.text .line {
		border-bottom-width: 1px;
		bottom: -0.5px;
	}

	.text .head,
	.text .tick {
		height: 0.4rem;
		bottom: -0.2rem;
		border-width: 1px;
	}

	.underlay {
		grid-column: 2 / -1;
		display: grid;
		grid-template-columns: subgrid;
		position: relative;
		padding-top: var(--_underlay-gap);
		line-height: 1.25;
		mask-image: var(--riso-image, none);
		mask-size: var(--riso-size, auto);
		mask-composite: var(--riso-composite, add);
	}

	.ch {
		grid-row: 1;
		text-align: center;
	}

	/* Berkeley Mono has no 500, syntax is set apart by its construct's colour alone */
	.ch.markup {
		color: var(--c);
	}

	/* a character the page points at, ruled under its cell in the ink, so a
	   space or an indent shows as well as a star */
	.ch.cued {
		box-shadow: inset 0 calc(var(--_w) * -1) 0 var(--ink, #121318);
	}

	/* pointing at a phrase washes its characters in its own colour, pale, and
	   steps every other phrase and character back. Nothing thickens or moves */
	.ch.lit {
		background-color: color-mix(in srgb, var(--wash-c, var(--line-list)) 13%, transparent);
	}

	.dimmed :is(.phrase, .bracket-of, .barline):not(.lit) {
		opacity: 0.35;
	}

	.dimmed .ch:not(.lit) {
		opacity: 0.4;
	}

	/* streaming, only given a stream. A guess is written small, raised and
	   dashed, its opening bar hollow */
	.pending {
		translate: 0 calc(var(--_raise) * -1);
	}

	.pending .line {
		border-bottom-style: dashed;
	}

	.pending .head {
		width: calc(var(--_w) * 2 + 1px);
		border: var(--_w) solid currentColor;
		background: var(--paper, #fbfbf8);
	}

	.pending .name {
		font-size: 0.6875rem;
	}

	/* a revoked guess, struck through and quiet; its delimiter is ink again,
	   since the parser gave it back to the text */
	.ghost .line {
		border-bottom-width: 1px;
	}

	.ghost .head::after {
		content: '';
		position: absolute;
		left: -0.2rem;
		top: 50%;
		width: 0.55rem;
		border-top: var(--_w) solid var(--voice-rose, #d4145a);
		rotate: -50deg;
	}

	.ghost .name {
		text-decoration: line-through var(--voice-rose, #d4145a);
	}

	/* fed but not yet read, and held, fed but not yet decided */
	.ch.unread {
		color: var(--faint, #c9cad1);
	}

	.ch.held {
		color: var(--quiet, #5d606b);
		font-style: italic;
	}

	/* the bird's eye stands over the held characters, its feet on their cap height */
	.fermata {
		justify-self: center;
		align-self: start;
		margin-top: var(--_underlay-gap);
		translate: 0 calc(-100% + 0.15rem);
		pointer-events: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.phrase,
		.bracket-of,
		.barline,
		.ch {
			transition:
				opacity 160ms ease,
				background-color 160ms ease;
		}
	}
</style>
