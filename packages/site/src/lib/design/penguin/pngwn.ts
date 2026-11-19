// pngwn's own penguin, the logo of pngwn's blog, copied here to perch in the score.
// pngwn owns the drawing. The geometry is copied unchanged from the at_beta
// repository (~/Projects/_pngwn/at_beta, origin/main):
//   mark  packages/blog/static/favicon.svg, commit c8138ec "add penguin favicons"
//   line  packages/blog/src/lib/pngwn_penguin.js, commit d37582c "replace header
//         dot with idle penguin", the RIG's head, chest, wing and eye
// Both share one coordinate space: the tail's tip, the lowest point, is at
// y = 85.61, which the box puts on the line.
//
// The site draws only the line bird (design/SCORE.md "The penguin"), from the
// centrelines below, traced over the header bird's outline so it can be stroked
// at a fixed weight. The mark and the outline paths stay in
// lib/experiments/penguin/pngwn.ts on p/mdsvex-1.0-design

/** the drawing's box, the tail tip on its bottom edge, the beak tip near its right */
export const box = { x: 12.5, y: 13.3, w: 71, h: 72.31 };
export const view_box = `${box.x} ${box.y} ${box.w} ${box.h}`;

/** where the blog's idle loop turns the bird, about its weight on the ground */
export const ground = '42px 84px';

/** the line drawn along the middle of each of its strokes, so it can be stroked
 * at a fixed weight whatever size it is drawn at. The tail runs on to the ground
 * it stands on, the beak keeps its sharp tip with a mitred join. New, traced
 * over the header bird's outline */
export const centre = {
	body: 'M16.2 85.61L29 71.5L32.5 48L40.5 17H59L65 22L77.6 23.4L59.5 33',
	chest: 'M60 37L63.5 41V71L56.4 77.6',
	wing: 'M41.5 51L49.5 68.5V43',
	/** the eye as a dot of no length, drawn as a square as wide as the line */
	eye: 'M54.5 25h0.01',
};

/** how far the drawing sits above its lowest point under its middle, as a share
 * of its height: on a post, a bar line, the bird sits on its belly there and
 * its tail hangs past the post, instead of balancing on the tail's tip */
export const post_drop = (85.61 - 80.8) / box.h;
