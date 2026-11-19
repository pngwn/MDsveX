// generated pages for the hydration benchmark, the same seed gives the same
// document so every arm and every run hydrates identical markdown

function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const WORDS =
	'hydration walks the server markup and attaches listeners to the nodes that change, everything else is skipped over one sibling at a time while the runtime looks for the next node it owns'.split(
		' '
	);

function sentence(rand, min, max) {
	const n = min + Math.floor(rand() * (max - min));
	const out = [];
	for (let i = 0; i < n; i++) {
		let w = WORDS[Math.floor(rand() * WORDS.length)].replace(',', '');
		const r = rand();
		if (r < 0.06) w = `*${w}*`;
		else if (r < 0.1) w = `**${w}**`;
		else if (r < 0.13) w = '`' + w + '`';
		else if (r < 0.16) w = `[${w}](https://example.com/${w})`;
		out.push(w);
	}
	const s = out.join(' ');
	return s[0].toUpperCase() + s.slice(1) + '.';
}

function paragraph(rand) {
	const n = 2 + Math.floor(rand() * 3);
	const s = [];
	for (let i = 0; i < n; i++) s.push(sentence(rand, 6, 16));
	return s.join(' ');
}

// markdown with no svelte in it, braces would make the block an expression
const STATIC = [
	(rand, i) => `## Section ${i}`,
	(rand) => paragraph(rand),
	(rand) => paragraph(rand),
	(rand) => paragraph(rand),
	(rand) => {
		const n = 3 + Math.floor(rand() * 3);
		const items = [];
		for (let i = 0; i < n; i++) items.push('- ' + sentence(rand, 3, 9));
		return items.join('\n');
	},
	(rand) => {
		const n = 2 + Math.floor(rand() * 3);
		const items = [];
		for (let i = 0; i < n; i++) items.push(`${i + 1}. ` + sentence(rand, 3, 9));
		return items.join('\n');
	},
	(rand) => '> ' + paragraph(rand),
	(rand) =>
		'```sh\npnpm add -D mdsvex\npnpm exec vite build\nls -la dist/\n```',
	(rand) =>
		'| name | kind | size |\n| --- | --- | --- |\n' +
		[1, 2, 3]
			.map(
				(r) =>
					`| ${WORDS[Math.floor(rand() * WORDS.length)].replace(',', '')} | block | ${r * 12} |`
			)
			.join('\n'),
	() => '---',
];

// the svelte a page puts between its prose, components, expressions and blocks
const DYNAMIC = [
	(rand, i) => `<Counter start={${i}} />`,
	() => 'The running total is {total} and doubled it is {total * 2}.',
	() => '{#if show}\n\nThis paragraph is behind a condition.\n\n{/if}',
	() => '<button onclick={() => total++}>add one</button>',
];

const SCRIPT = `<script>
	import Counter from './Counter.svelte';
	let total = $state(1);
	let show = $state(true);
</script>`;

/** the page styles, each plans which of its blocks are dynamic */
export const STYLES = {
	// runs of one to three static blocks between dynamic ones, about 2 to 1
	interleaved: {
		describe: '1 to 3 static blocks, then 1 dynamic',
		plan(rand, blocks) {
			const out = [];
			while (out.length < blocks) {
				const run = 1 + Math.floor(rand() * 3);
				for (let i = 0; i < run && out.length < blocks; i++) out.push(false);
				if (out.length < blocks) out.push(true);
			}
			return out;
		},
	},
	mostly_static: {
		describe: '10 static blocks, then 1 dynamic',
		plan(rand, blocks) {
			const out = [];
			for (let i = 0; i < blocks; i++) out.push(i % 11 === 10);
			return out;
		},
	},
	static: {
		describe: 'static blocks only',
		plan(rand, blocks) {
			return new Array(blocks).fill(false);
		},
	},
};

/** the markdown of a page of a style with this many top level blocks */
export function make_page(style, blocks, seed = 1) {
	const rand = mulberry32(seed);
	const plan = STYLES[style].plan(rand, blocks);
	const parts = [];
	let dynamic = 0;
	for (let i = 0; i < plan.length; i++) {
		if (plan[i]) {
			parts.push(DYNAMIC[dynamic % DYNAMIC.length](rand, i));
			dynamic++;
		} else {
			parts.push(STATIC[Math.floor(rand() * STATIC.length)](rand, i));
		}
	}
	const body = parts.join('\n\n') + '\n';
	return { source: dynamic === 0 ? body : SCRIPT + '\n\n' + body, dynamic };
}
