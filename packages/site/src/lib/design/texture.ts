// the ink textures, design/SCORE.md "Ink texture": linen on Playfair, riso on
// the mono, the body serif plain. From 01's plates (lib/experiments/01-wordmark/
// print.ts on p/mdsvex-1.0-design), which 05 had copied; this is the one copy.
//
// Each is a mask: the paper in the texture, its threads and flecks, is cut out
// of the ink with `exclude` against a solid layer, so every face keeps its own
// colour and the texture shows as gaps where the paper comes through. The dark
// specks of 01's plates have nothing to cut, so they are left out. All of it is
// inline SVG, no image files.
//
// A page sets `texture` on an element as custom properties (the frame does),
// and texture.css applies them by face

const svg = (body: string, w: number, h: number) =>
	`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

/** speckle from feTurbulence: one colour where the noise runs high, scaled
 * and cut so only its peaks show */
const speckle = (frequency: string, colour: [number, number, number], gain: number, bias: number, size: number, id: string, cut = '', seed = id.length * 7) =>
	`<filter id='${id}' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='2' stitchTiles='stitch' seed='${seed}'/><feColorMatrix values='0 0 0 0 ${colour[0]} 0 0 0 0 ${colour[1]} 0 0 0 0 ${colour[2]} ${gain} 0 0 0 ${bias}'/>${cut ? `<feComponentTransfer><feFuncA type='discrete' tableValues='${cut}'/></feComponentTransfer>` : ''}</filter><rect width='${size}' height='${size}' filter='url(#${id})'/>`;

/** only the mask's alpha counts, the colour is the paper's for reading the source */
const PAPER: [number, number, number] = [0.984, 0.984, 0.973];

/** linen: light threads on the diagonal, fainter ones across them, broken by
 * noise so they read as thread and not as hatching */
const threads = (id: string, d: string, opacity: number, seed: number) =>
	`<pattern id='${id}p' width='4' height='4' patternUnits='userSpaceOnUse'><path d='${d}' stroke='rgb(251,251,248)' stroke-width='1.1'/></pattern><filter id='${id}' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.5' numOctaves='2' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 0 0 0 -0.9'/><feComposite in='SourceGraphic' operator='in'/></filter><rect width='96' height='96' fill='url(#${id}p)' filter='url(#${id})' opacity='${opacity}'/>`;

const linen = threads('u', 'M0 4L4 0M-1 1L1 -1M3 5L5 3', 0.22, 3) + threads('v', 'M0 0L4 4M-1 3L1 5M3 -1L5 1', 0.12, 9);

/** riso: a drum's ink, density that drifts, fine grain, crisp flecks of paper */
const riso =
	speckle('0.01', PAPER, -0.8, 0.42, 300, 'm', '', 2) +
	speckle('0.8', PAPER, -1.6, 0.8, 300, 'l', '', 4) +
	speckle('0.9', PAPER, 4, -2.3, 300, 'k', '0 0 0 1', 8);

export interface Knock {
	image: string;
	size: string;
	composite: string;
}

const SOLID = 'linear-gradient(#000 0 0)';
const cut = (tile: string, size: string): Knock => ({ image: `${tile}, ${SOLID}`, size: `${size} ${size}, auto`, composite: 'exclude' });

export const knock = {
	linen: cut(svg(linen, 96, 96), '96px'),
	riso: cut(svg(riso, 300, 300), '300px'),
};

/** the custom properties texture.css reads, for a page to set on its root */
export const texture: Record<string, string> = {
	'--linen-image': knock.linen.image,
	'--linen-size': knock.linen.size,
	'--linen-composite': knock.linen.composite,
	'--riso-image': knock.riso.image,
	'--riso-size': knock.riso.size,
	'--riso-composite': knock.riso.composite,
};

/** `texture` as one inline style */
export const texture_style = Object.entries(texture)
	.map(([k, v]) => `${k}: ${v}`)
	.join('; ');

/** the id of the ragged edge filter the frame draws once, for display Playfair */
export const RAG = 'design-rag';

/** how far the edge rags, in px: linen ink doesn't hold a clean edge at display
 * size. On 14px text a pixel is the difference between legible and not, so
 * only titles take it (texture.css's .rag) */
export const RAG_SCALE = 1.2;
