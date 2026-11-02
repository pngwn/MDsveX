// the Svelte plate of v7's Title: 01's linen plate (lib/experiments/01-wordmark/
// print.ts on p/mdsvex-1.0-design), ink on linen paper. The weave stands proud
// of the orange in light threads, with a few burnt specks in the ink. The black
// letters take the frame's linen knock (../texture.ts), which is these threads
// cut out of the ink; the specks are only the plate's, a knock has nothing to
// cut for them. All inline SVG, no image files

const svg = (body: string, w: number, h: number) =>
	`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

const threads = (id: string, d: string, opacity: number, seed: number) =>
	`<pattern id='${id}p' width='4' height='4' patternUnits='userSpaceOnUse'><path d='${d}' stroke='rgb(251,251,248)' stroke-width='1.1'/></pattern><filter id='${id}' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.5' numOctaves='2' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 0 0 0 -0.9'/><feComposite in='SourceGraphic' operator='in'/></filter><rect width='96' height='96' fill='url(#${id}p)' filter='url(#${id})' opacity='${opacity}'/>`;

const specks = `<filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch' seed='5'/><feColorMatrix values='0 0 0 0 0.45 0 0 0 0 0.1 0 0 0 0 0 1.6 0 0 0 -0.8'/></filter><rect width='96' height='96' filter='url(#g)'/>`;

/** the linen plate, a 96px tile, over a flat fill of the Svelte ink */
export const linen = svg(
	threads('u', 'M0 4L4 0M-1 1L1 -1M3 5L5 3', 0.22, 3) + threads('v', 'M0 0L4 4M-1 3L1 5M3 -1L5 1', 0.12, 9) + specks,
	96,
	96,
);
