import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { acquire_bench_lock } from '../perf/lock.mjs';
import { build_arm } from './build.mjs';
import { make_page, STYLES } from './pages.mjs';

const { values: args } = parseArgs({
	options: {
		blocks: { type: 'string', default: '300' },
		cold: { type: 'string', default: '30' },
		warm: { type: 'string', default: '300' },
		throttle: { type: 'string', default: '1' },
		styles: { type: 'string', default: Object.keys(STYLES).join(',') },
		seed: { type: 'string', default: '1' },
		'no-lock': { type: 'boolean', default: false },
		json: { type: 'string' },
	},
});

const BLOCKS = Number(args.blocks);
const COLD = Number(args.cold);
const WARM = Number(args.warm);
const THROTTLE = Number(args.throttle);
const SEED = Number(args.seed);
const styles = args.styles.split(',');

// the arms, the first is the reference every ratio divides by
const ARMS = [
	{ name: 'plain', options: {} },
	{ name: 'wrap_static', options: { wrap_static: true } },
];

// localhost is a secure context, which cross origin isolation needs
const ORIGIN = 'http://localhost:4719';

// prose css, so parse and layout see what a docs page gives them
const CSS = `body{font:16px/1.6 system-ui;max-width:70ch;margin:2rem auto}
h2{margin:2rem 0 1rem}p,ul,ol,blockquote,pre,table{margin:0 0 1rem}
blockquote{border-left:3px solid #ccc;padding-left:1rem}pre{background:#f4f4f4;padding:1rem}
table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:.25rem .5rem}`;

const json_script = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

/** one load, one arm, hydrates the server html as the page loads */
function cold_page(arm) {
	return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><div id="app">${arm.html}</div>
<script type="module">
import { run } from './${arm.name}.js';
const r = run(document.getElementById('app'));
window.__result = { ms: r.ms, isolated: crossOriginIsolated };
</script></body></html>`;
}

// both bundles in one page, the warm loop alternates them rep by rep so both
// share every gc and jit state the page goes through
function warm_page(arms, reps) {
	return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><div id="app"></div>
<script type="module">
${arms.map((a, i) => `import * as m${i} from './${a.name}.js';`).join('\n')}
const mods = [${arms.map((_, i) => `m${i}`).join(', ')}];
const html = ${json_script(arms.map((a) => a.html))};
const target = document.getElementById('app');
const hydrate = [], dom = [];
for (let a = 0; a < mods.length; a++) { hydrate.push([]); dom.push([]); }
const reps = ${reps};
for (let i = 0; i < reps + 20; i++) {
	for (let j = 0; j < mods.length; j++) {
		// alternate which arm leads each rep
		const a = i % 2 === 0 ? j : mods.length - 1 - j;
		const t0 = performance.now();
		target.innerHTML = html[a];
		// style and layout of the fresh dom, which wrappers could change
		target.getBoundingClientRect();
		const t1 = performance.now();
		const r = mods[a].run(target);
		mods[a].unmount(r.app);
		// the first reps warm the jit
		if (i >= 20) { dom[a].push(t1 - t0); hydrate[a].push(r.ms); }
	}
}
window.__result = { hydrate, dom };
</script></body></html>`;
}

function median(xs) {
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** mean of the middle half, timings come in 5us steps where a median sticks to one step */
function iqm(xs) {
	const s = [...xs].sort((a, b) => a - b);
	const q = s.length >> 2;
	const mid = s.slice(q, s.length - q);
	return mid.reduce((x, y) => x + y, 0) / mid.length;
}

/** median of paired ratios with a bootstrap 95% interval */
function paired(a, b) {
	const r = a.map((x, i) => b[i] / x);
	const boots = [];
	let state = 12345;
	const rand = () => (state = (state * 1103515245 + 12345) >>> 0) / 2 ** 32;
	for (let k = 0; k < 1000; k++) {
		const s = [];
		for (let i = 0; i < r.length; i++) s.push(r[Math.floor(rand() * r.length)]);
		boots.push(median(s));
	}
	boots.sort((x, y) => x - y);
	return { ratio: median(r), lo: boots[25], hi: boots[974] };
}

/** top level nodes of the server html, what the hydration walk steps over */
async function count_top_level(page, html) {
	return page.evaluate((h) => {
		const d = document.createElement('div');
		d.innerHTML = h;
		return d.childNodes.length;
	}, html);
}

async function new_page(context) {
	const page = await context.newPage();
	if (THROTTLE !== 1) {
		const cdp = await context.newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
	}
	return page;
}

async function serve(context, files) {
	await context.route(ORIGIN + '/**', (route) => {
		let path = new URL(route.request().url()).pathname.slice(1);
		// a page imports its bundles relative to wherever it sits
		if (path.endsWith('.js')) path = path.slice(path.lastIndexOf('/') + 1);
		const body = files.get(path);
		if (body === undefined) return route.fulfill({ status: 404, body: '' });
		route.fulfill({
			status: 200,
			contentType: path.endsWith('.js') ? 'text/javascript' : 'text/html',
			// cross origin isolation gives performance.now 5us steps rather than 100us
			headers: {
				'cross-origin-opener-policy': 'same-origin',
				'cross-origin-embedder-policy': 'require-corp',
			},
			body,
		});
	});
}

const pct = (r) => `${r >= 1 ? '+' : ''}${((r - 1) * 100).toFixed(1)}%`;
const ms = (x) => `${x.toFixed(3)}ms`;

async function main() {
	const release = args['no-lock']
		? () => {}
		: await acquire_bench_lock({ label: 'hydration bench' });

	const built = {};
	for (const style of styles) {
		const { source, dynamic } = make_page(style, BLOCKS, SEED);
		built[style] = { dynamic, arms: [] };
		for (const arm of ARMS)
			built[style].arms.push({
				name: arm.name,
				...(await build_arm(source, arm.options)),
			});
	}

	const browser = await chromium.launch();
	const report = {
		blocks: BLOCKS,
		cold: COLD,
		warm: WARM,
		throttle: THROTTLE,
		seed: SEED,
		browser: browser.version(),
		styles: {},
	};
	console.log(
		`chromium ${browser.version()}, ${BLOCKS} blocks, ${COLD} cold loads and ${WARM} warm reps per arm, cpu throttle ${THROTTLE}x\n`
	);

	try {
		for (const style of styles) {
			const { arms, dynamic } = built[style];
			const files = new Map();
			for (const arm of arms) {
				files.set(arm.name + '.js', arm.client);
				files.set('cold/' + arm.name, cold_page(arm));
			}
			// the bundle a page imports second reads a few percent slow against itself,
			// so the warm loop runs once in each order and every arm fills both slots
			const orders = [
				arms.map((_, i) => i),
				arms.map((_, i) => arms.length - 1 - i),
			];
			orders.forEach((order, k) =>
				files.set(
					'warm/' + k,
					warm_page(
						order.map((a) => arms[a]),
						WARM >> 1
					)
				)
			);

			const context = await browser.newContext();
			await serve(context, files);
			const probe = await context.newPage();
			const top = [];
			for (const arm of arms) top.push(await count_top_level(probe, arm.html));
			await probe.close();

			// a mismatch makes svelte throw the server dom away and mount, which would time a mount
			const warnings = [];
			context.on('console', (m) => {
				if (/hydrat/i.test(m.text())) warnings.push(m.text());
			});
			context.on('weberror', (e) => warnings.push(String(e.error())));

			const cold = arms.map(() => []);
			for (let i = 0; i < COLD; i++) {
				for (let j = 0; j < arms.length; j++) {
					const a = i % 2 === 0 ? j : arms.length - 1 - j;
					const page = await new_page(context);
					await page.goto(`${ORIGIN}/cold/${arms[a].name}`);
					await page.waitForFunction(() => window.__result !== undefined);
					const result = await page.evaluate(() => window.__result);
					if (!result.isolated)
						throw new Error(
							'the page is not cross origin isolated, timings would be in 100us steps'
						);
					cold[a].push(result.ms);
					await page.close();
				}
			}

			const warm = { hydrate: arms.map(() => []), dom: arms.map(() => []) };
			for (let k = 0; k < orders.length; k++) {
				const page = await new_page(context);
				// the loop runs in the module script and holds up load for as long as it takes
				await page.goto(`${ORIGIN}/warm/${k}`, { waitUntil: 'commit' });
				await page.waitForFunction(() => window.__result !== undefined, null, {
					timeout: 0,
				});
				const r = await page.evaluate(() => window.__result);
				await page.close();
				// slot to arm, pairs stay in rep order so paired ratios line up
				orders[k].forEach((a, slot) => {
					warm.hydrate[a].push(...r.hydrate[slot]);
					warm.dom[a].push(...r.dom[slot]);
				});
			}
			await context.close();

			if (warnings.length !== 0)
				throw new Error(`${style}: hydration warnings\n${warnings.join('\n')}`);

			const row = { describe: STYLES[style].describe, dynamic, arms: {} };
			console.log(
				`${style} (${STYLES[style].describe}, ${dynamic} dynamic of ${BLOCKS})`
			);
			for (let a = 0; a < arms.length; a++) {
				const r = {
					top_level_nodes: top[a],
					client_bytes: arms[a].client.length,
					cold_ms: iqm(cold[a]),
					warm_ms: iqm(warm.hydrate[a]),
					dom_ms: iqm(warm.dom[a]),
				};
				let line = `  ${arms[a].name.padEnd(12)} top level ${String(top[a]).padStart(5)}  cold ${ms(r.cold_ms)}  warm ${ms(r.warm_ms)}  parse+layout ${ms(r.dom_ms)}`;
				if (a !== 0) {
					r.cold_vs_plain = paired(cold[0], cold[a]);
					r.warm_vs_plain = paired(warm.hydrate[0], warm.hydrate[a]);
					r.dom_vs_plain = paired(warm.dom[0], warm.dom[a]);
					const f = (p) => `${pct(p.ratio)} [${pct(p.lo)}, ${pct(p.hi)}]`;
					line += `\n  ${''.padEnd(12)} vs plain: cold ${f(r.cold_vs_plain)}  warm ${f(r.warm_vs_plain)}  parse+layout ${f(r.dom_vs_plain)}`;
				}
				row.arms[arms[a].name] = r;
				console.log(line);
			}
			console.log('');
			report.styles[style] = row;
		}
	} finally {
		await browser.close();
		release();
	}

	if (args.json)
		writeFileSync(args.json, JSON.stringify(report, null, '\t') + '\n');
}

await main();
