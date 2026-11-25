import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { acquire_bench_lock } from '../perf/lock.mjs';
import { build_adapter } from './build.mjs';
import {
	DEFAULT_FIXTURES,
	PIERRE_FIXTURES,
	load_fixture,
} from './fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// the first is the reference every ratio divides by
const LIBS = {
	'mdsvex-svelte': 'mdsvex, Svelte Node view',
	'mdsvex-html': 'mdsvex, html per block, patched',
	'mdsvex-dom': 'mdsvex, dom from the tree, prototype',
	'words-dom': '@pierre/words, dom renderer',
	'words-react': '@pierre/words/react',
	streamdown: 'streamdown',
	'streaming-markdown': 'streaming-markdown',
	'react-markdown': 'react-markdown + gfm',
	marked: 'marked + innerHTML',
};
// only when libs names them
const EXTRA_LIBS = {
	'mdsvex-html-wire': 'mdsvex, html per block, over the wire',
	'mdsvex-html-replace': 'mdsvex, html per block, replaced',
};
const DEFAULT_LIBS = Object.keys(LIBS);
Object.assign(LIBS, EXTRA_LIBS);

const { values: args } = parseArgs({
	options: {
		libs: { type: 'string', default: DEFAULT_LIBS.join(',') },
		fixtures: { type: 'string', default: DEFAULT_FIXTURES.join(',') },
		pierre: { type: 'boolean', default: false },
		chunk: { type: 'string', default: '256,16' },
		runs: { type: 'string', default: '5' },
		throttle: { type: 'string', default: '1' },
		interval: { type: 'string', default: '0' },
		'max-updates': { type: 'string', default: '1500' },
		'no-spin': { type: 'boolean', default: false },
		headed: { type: 'boolean', default: false },
		'no-lock': { type: 'boolean', default: false },
		json: { type: 'string' },
		dump: { type: 'string' },
	},
});

const libs = args.libs.split(',');
for (const lib of libs)
	if (!(lib in LIBS))
		throw new Error(
			`no library ${lib}, there are ${Object.keys(LIBS).join(', ')}`
		);
const fixture_names = [
	...args.fixtures.split(',').filter(Boolean),
	...(args.pierre ? PIERRE_FIXTURES : []),
];
const CHUNKS = args.chunk.split(',').map(Number);
const RUNS = Number(args.runs);
const THROTTLE = Number(args.throttle);
const INTERVAL = Number(args.interval);
const MAX_UPDATES = Number(args['max-updates']);

// localhost is a secure context, which cross origin isolation needs
const ORIGIN = 'http://localhost:4720';
const VIEWPORT = { width: 1280, height: 960 };
const FRAME = 1000 / 60;

// one stylesheet for every library, so layout and paint see the same rules
const CSS = `body{font:16px/1.6 system-ui;max-width:70ch;margin:2rem auto}
h1,h2,h3{margin:2rem 0 1rem}p,ul,ol,blockquote,pre,table{margin:0 0 1rem}
blockquote{border-left:3px solid #ccc;padding-left:1rem}
pre{background:#f4f4f4;padding:1rem;overflow:auto}code{font:14px/1.5 ui-monospace,monospace}
table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:.25rem .5rem}`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><main id="host"></main><script type="module" src="/harness.js"></script></body></html>`;

function median(xs) {
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function quantile(xs, q) {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

async function serve(context, files, served) {
	await context.route(ORIGIN + '/**', (route) => {
		const path = new URL(route.request().url()).pathname;
		const file = files.get(path);
		if (file === undefined) return route.fulfill({ status: 404, body: '' });
		served.add(path);
		route.fulfill({
			status: 200,
			contentType: file.type,
			// cross origin isolation gives performance.now 5us steps rather than 100us
			headers: {
				'cross-origin-opener-policy': 'same-origin',
				'cross-origin-embedder-policy': 'require-corp',
			},
			body: file.body,
		});
	});
}

/** a new context and page with one adapter warmed and one document loaded */
async function open(browser, files, lib, fixture) {
	const context = await browser.newContext({ viewport: VIEWPORT });
	const served = new Set();
	await serve(context, files, served);
	const errors = [];
	context.on('weberror', (e) => errors.push(String(e.error())));
	const page = await context.newPage();
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	const cdp = await context.newCDPSession(page);
	if (THROTTLE !== 1)
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
	await page.goto(ORIGIN + '/');
	const ready = await page.evaluate(
		([l, f]) => window.bench.prepare(l, f),
		[lib, fixture]
	);
	if (!ready.isolated)
		throw new Error(
			'the page is not cross origin isolated, timings would be in 100us steps'
		);
	return { context, page, cdp, served, errors, frame_ms: ready.frame_ms };
}

/** the v8 heap in use after two collections */
async function heap(cdp) {
	await cdp.send('HeapProfiler.collectGarbage');
	await cdp.send('HeapProfiler.collectGarbage');
	return (await cdp.send('Runtime.getHeapUsage')).usedSize;
}

/** one replay boiled down, times in ms */
function summarise(r) {
	const n = r.script.length;
	const update = [];
	for (let i = 0; i < n; i++)
		update.push(r.script[i] + r.layout[i] + r.paint[i]);
	return {
		script: sum(r.script) + r.finish[0],
		layout: sum(r.layout) + r.finish[1],
		paint: sum(r.paint) + r.finish[2],
		total: sum(update) + sum(r.finish),
		update_median: median(update),
		update_p95: quantile(update, 0.95),
		update_max: Math.max(...update, sum(r.finish)),
		over_frame: update.filter((ms) => ms > FRAME).length,
	};
}

const num = (x, d = 1) => x.toFixed(d);

function table(head, rows) {
	const widths = head.map((h, i) =>
		Math.max(h.length, ...rows.map((r) => r[i].length))
	);
	const line = (cells) =>
		cells
			.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i])))
			.join('  ');
	console.log(line(head));
	console.log(widths.map((w) => '-'.repeat(w)).join('  '));
	for (const row of rows) console.log(line(row));
}

async function main() {
	const files = new Map();
	files.set('/', { body: PAGE, type: 'text/html' });
	files.set('/harness.js', {
		body: readFileSync(join(here, 'harness.js')),
		type: 'text/javascript',
	});
	const bundles = {};
	for (const lib of libs) {
		bundles[lib] = await build_adapter(lib);
		for (const [name, file] of bundles[lib])
			files.set(`/lib/${lib}/${name}`, {
				body: Buffer.from(file.body),
				type: 'text/javascript',
			});
	}
	const sources = {};
	for (const name of fixture_names) {
		sources[name] = await load_fixture(name);
		files.set('/fixtures/' + name, {
			body: sources[name],
			type: 'text/markdown; charset=utf-8',
		});
	}

	const release = args['no-lock']
		? () => {}
		: await acquire_bench_lock({ label: 'streaming bench' });

	// the full browser in its headless mode, not the headless shell
	const browser = await chromium.launch({
		channel: 'chromium',
		headless: !args.headed,
	});
	const report = {
		date: new Date().toISOString(),
		browser: browser.version(),
		cpu: cpus()[0].model,
		runs: RUNS,
		throttle: THROTTLE,
		interval: INTERVAL,
		spin: !args['no-spin'],
		viewport: VIEWPORT,
		libs: Object.fromEntries(libs.map((lib) => [lib, LIBS[lib]])),
		cases: [],
	};
	console.log(
		`chromium ${report.browser}, ${report.cpu}, ${RUNS} runs, cpu throttle ${THROTTLE}x\n`
	);

	try {
		for (const fixture of fixture_names) {
			for (const chunk of CHUNKS) {
				const chars = sources[fixture].length;
				const updates = Math.ceil(chars / chunk);
				if (updates > MAX_UPDATES) {
					console.log(
						`${fixture}, ${chunk} chars per update: skipped, ${updates} updates is over --max-updates\n`
					);
					continue;
				}

				// not timed, what each update does to the dom
				const census = {};
				const gzip = {};
				for (const lib of libs) {
					const { context, page, served, errors } = await open(
						browser,
						files,
						lib,
						fixture
					);
					const c = await page
						.evaluate((n) => window.bench.census(n), chunk)
						.catch((e) => ({ failed: String(e.message).split('\n')[0] }));
					if (c.failed !== undefined) {
						census[lib] = c;
						await context.close();
						continue;
					}
					if (args.dump)
						writeFileSync(
							join(args.dump, `${fixture}.${lib}.html`),
							c.html + '\n'
						);
					delete c.html;
					census[lib] = c;
					gzip[lib] = 0;
					for (const path of served) {
						const prefix = `/lib/${lib}/`;
						if (path.startsWith(prefix))
							gzip[lib] += bundles[lib].get(path.slice(prefix.length)).gzip;
					}
					await context.close();
					if (errors.length !== 0)
						throw new Error(`${lib} on ${fixture}:\n${errors.join('\n')}`);
				}

				const samples = Object.fromEntries(libs.map((lib) => [lib, []]));
				const heaps = Object.fromEntries(libs.map((lib) => [lib, []]));
				const hashes = Object.fromEntries(libs.map((lib) => [lib, new Set()]));
				for (let run = 0; run < RUNS; run++) {
					for (let j = 0; j < libs.length; j++) {
						// a different library leads each round
						const lib = libs[(j + run) % libs.length];
						if (census[lib].failed !== undefined) continue;
						const { context, page, cdp, errors, frame_ms } = await open(
							browser,
							files,
							lib,
							fixture
						);
						report.frame_ms = frame_ms;
						const before = await heap(cdp);
						const r = await page.evaluate(
							([n, i, s]) => window.bench.run(n, i, s),
							[chunk, INTERVAL, !args['no-spin']]
						);
						heaps[lib].push((await heap(cdp)) - before);
						await context.close();
						if (errors.length !== 0)
							throw new Error(`${lib} on ${fixture}:\n${errors.join('\n')}`);
						hashes[lib].add(r.text_hash);
						samples[lib].push({ ...summarise(r), elements: r.elements });
					}
				}

				const entry = { fixture, chunk, chars, updates, libs: {} };
				const rows = [];
				const failures = [];
				let reference = 0;
				for (const lib of libs) {
					if (census[lib].failed !== undefined) {
						entry.libs[lib] = { failed: census[lib].failed };
						rows.push([LIBS[lib], 'failed', ...new Array(13).fill('')]);
						failures.push(`${LIBS[lib]}: ${census[lib].failed}`);
						continue;
					}
					const s = samples[lib];
					const mid = (key) => median(s.map((x) => x[key]));
					const c = census[lib];
					const row = {
						total: mid('total'),
						script: mid('script'),
						layout: mid('layout'),
						paint: mid('paint'),
						update_median: mid('update_median'),
						update_p95: mid('update_p95'),
						update_max: mid('update_max'),
						over_frame: mid('over_frame'),
						totals: s.map((x) => x.total),
						elements: s[0].elements,
						nodes: c.nodes,
						nodes_added: c.added,
						nodes_removed: c.removed,
						updates_shown: c.shown,
						stats: c.stats,
						text_chars: c.streamed_chars,
						stream_matches_whole: c.same_text,
						stable_text: hashes[lib].size === 1,
						heap_mb: median(heaps[lib]) / 1e6,
						gzip_kb: gzip[lib] / 1e3,
					};
					if (c.drift > 0) {
						row.drift = c.drift;
						failures.push(
							`${LIBS[lib]}: the page differed from its html after ${c.drift} updates, first ${c.first_drift}`
						);
					}
					if (lib === libs[0]) reference = row.total;
					row.vs_reference = reference === 0 ? NaN : row.total / reference;
					entry.libs[lib] = row;
					rows.push([
						LIBS[lib],
						num(row.total),
						num(row.vs_reference, 2) + 'x',
						num(row.script),
						num(row.layout),
						num(row.paint),
						num(row.update_median, 2),
						num(row.update_p95, 2),
						num(row.update_max, 2),
						String(row.over_frame),
						String(c.shown),
						`${c.added}/${c.nodes}`,
						String(row.text_chars) + (row.stream_matches_whole ? '' : ' !'),
						num(row.heap_mb, 2),
						num(row.gzip_kb),
					]);
				}
				report.cases.push(entry);

				console.log(
					`${fixture}, ${chars} chars, ${chunk} per update, ${updates} updates`
				);
				table(
					[
						'library',
						'to paint',
						'vs',
						'script',
						'layout',
						'paint',
						'median',
						'p95',
						'max',
						'>16.7',
						'shown',
						'nodes made/kept',
						'text',
						'heap MB',
						'gzip kB',
					],
					rows
				);
				for (const failure of failures) console.log(failure);
				console.log('');
			}
		}
	} finally {
		await browser.close();
		release();
	}

	if (args.json)
		writeFileSync(args.json, JSON.stringify(report, null, '\t') + '\n');
}

await main();
