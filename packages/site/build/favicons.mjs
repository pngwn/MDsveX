// the favicons, drawn from the line bird (src/lib/design/penguin/pngwn.ts),
// facing left as it perches on the site. Run once when the bird changes:
//
//   node packages/site/build/favicons.mjs
//
// The SVG is the bird alone, in ink, and in paper on a dark tab. The PNGs and
// the ICO stand it on the paper, so they read on any background. A tab icon is
// 16 to 32px, where the site's 1px line would vanish, so the line is drawn
// heavier the smaller the icon. PNGs are rendered by Chromium through
// playwright-core: PLAYWRIGHT_CORE can name its path when it isn't resolvable
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { centre } from "../src/lib/design/penguin/pngwn.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../static");

const INK = "#121318";
const PAPER = "#fbfbf8";
const DARK_INK = "#e8e6de";

// a square around the bird, the drawing's middle at its middle, mirrored about it
const middle = { x: 48, y: 49.46 };

/** the bird in a square of `side` units, its line `weight` units wide */
function bird({ side, weight, ink = INK, paper, dark = false }) {
	const x = middle.x - side / 2;
	const y = middle.y - side / 2;
	const style = [
		`path{fill:none;stroke:${ink};stroke-width:${weight};stroke-linejoin:miter;stroke-miterlimit:8}`,
		".eye{stroke-linecap:square}",
		dark ? `@media (prefers-color-scheme:dark){path{stroke:${DARK_INK}}}` : "",
	].join("");
	const ground = paper ? `<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="${paper}"/>` : "";
	const paths = Object.entries(centre)
		.map(([name, d]) => `<path${name === "eye" ? ' class="eye"' : ""} d="${d}"/>`)
		.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}"><style>${style}</style>${ground}<g transform="translate(${middle.x * 2} 0) scale(-1 1)">${paths}</g></svg>\n`;
}

writeFileSync(join(out, "favicon.svg"), bird({ side: 82, weight: 5, dark: true }));

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const browser = await chromium.launch();
const page = await browser.newPage();

async function png(svg, size) {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(
		`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
	);
	return page.screenshot({ type: "png", omitBackground: true });
}

// the paper square gets more room around the bird as the icon grows
const icons = [
	["apple-touch-icon.png", 180, { side: 112, weight: 3 }],
	["icon-192.png", 192, { side: 112, weight: 3 }],
	["icon-512.png", 512, { side: 118, weight: 1.75 }],
];
for (const [name, size, shape] of icons) writeFileSync(join(out, name), await png(bird({ ...shape, paper: PAPER }), size));

// an ICO of one 32px PNG, which every browser that still asks for /favicon.ico reads
const small = await png(bird({ side: 84, weight: 5.5, paper: PAPER }), 32);
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6);
head.writeUInt8(32, 7);
head.writeUInt16LE(1, 10);
head.writeUInt16LE(32, 12);
head.writeUInt32LE(small.length, 14);
head.writeUInt32LE(22, 18);
writeFileSync(join(out, "favicon.ico"), Buffer.concat([head, small]));

await browser.close();
