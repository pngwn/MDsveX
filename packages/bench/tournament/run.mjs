import { spawn } from "node:child_process";
import {
	cp,
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build_corpus } from "./corpus.mjs";
import { variants } from "./variants.mjs";

const tournament_directory = dirname(fileURLToPath(import.meta.url));
const repo_root = resolve(tournament_directory, "../../..");

function parse_arguments(argv) {
	const options = {
		mode: "smoke",
		duration: 120,
		warmup: 40,
		limit: 3,
		pairs: 2,
		match: "",
		keep: false,
		controlThreshold: 0.08,
		minimumGain: 0.02,
		maxGzipGrowth: 1_536,
		externalDirectory: undefined,
		output: undefined,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--smoke") options.mode = "smoke";
		else if (argument === "--screen") {
			options.mode = "screen";
			options.duration = 750;
			options.warmup = 200;
			options.limit = variants.length;
			options.pairs = 4;
			options.controlThreshold = 0.03;
		} else if (argument === "--full") {
			options.mode = "full";
			options.duration = 1_500;
			options.warmup = 300;
			options.limit = variants.length;
			options.pairs = 6;
			options.controlThreshold = 0.02;
			options.minimumGain = 0.01;
		} else if (argument === "--keep") options.keep = true;
		else if (argument === "--duration") {
			options.duration = Number(argv[++index]);
		} else if (argument === "--warmup") {
			options.warmup = Number(argv[++index]);
		} else if (argument === "--limit") {
			options.limit = Number(argv[++index]);
		} else if (argument === "--pairs") {
			options.pairs = Number(argv[++index]);
		} else if (argument === "--match") {
			options.match = argv[++index];
		} else if (argument === "--control-threshold") {
			options.controlThreshold = Number(argv[++index]);
		} else if (argument === "--minimum-gain") {
			options.minimumGain = Number(argv[++index]);
		} else if (argument === "--max-gzip-growth") {
			options.maxGzipGrowth = Number(argv[++index]);
		} else if (argument === "--external-dir") {
			options.externalDirectory = resolve(argv[++index]);
		} else if (argument === "--output") {
			options.output = resolve(argv[++index]);
		} else {
			throw new Error(`unknown argument: ${argument}`);
		}
	}
	if (
		!Number.isFinite(options.duration) ||
		!Number.isFinite(options.warmup) ||
		!Number.isInteger(options.limit) ||
		!Number.isInteger(options.pairs) ||
		!Number.isFinite(options.controlThreshold) ||
		!Number.isFinite(options.minimumGain) ||
		!Number.isFinite(options.maxGzipGrowth) ||
		options.duration <= 0 ||
		options.warmup < 0 ||
		options.limit < 0 ||
		options.pairs <= 0 ||
		options.controlThreshold < 0 ||
		options.minimumGain < 0 ||
		options.maxGzipGrowth < 0
	) {
		throw new Error("numeric tournament options must be non-negative");
	}
	return options;
}

function run(command, args, options = {}) {
	return new Promise((resolve_promise, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: process.env,
			stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
		});

		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve_promise(stdout);
			else {
				reject(
					new Error(
						`${command} ${args.join(" ")} exited ${code}\n${stderr}`,
					),
				);
			}
		});
	});
}

async function copy_workspace(destination) {
	await mkdir(join(destination, "packages"), { recursive: true });

	for (const name of [
		"package.json",
		"pnpm-lock.yaml",
		"pnpm-workspace.yaml",
		"tsconfig.json",
		"vite.config.ts",
	]) {
		await cp(join(repo_root, name), join(destination, name));
	}

	await symlink(join(repo_root, "node_modules"), join(destination, "node_modules"));

	for (const name of ["parse", "render", "mdsvex"]) {
		const source = join(repo_root, "packages", name);
		const target = join(destination, "packages", name);
		await cp(source, target, {
			recursive: true,
			filter: (path) => {
				const relative_path = path.slice(source.length + 1);
				const first = relative_path.split("/")[0];
				return !["dist", "tsc", "node_modules"].includes(first);
			},
		});
		const source_node_modules = await realpath(
			join(source, "node_modules"),
		);
		await cp(source_node_modules, join(target, "node_modules"), {
			recursive: true,
			verbatimSymlinks: true,
		});
	}

	// Always relink workspace packages inside the isolated workspace. This is
	// required when a source checkout's package node_modules directory is
	// itself an absolute symlink to another worktree.
	for (const [package_name, dependency] of [
		["render", "parse"],
		["mdsvex", "parse"],
		["mdsvex", "render"],
	]) {
		const scope = join(
			destination,
			"packages",
			package_name,
			"node_modules",
			"@mdsvex",
		);
		const link = join(scope, dependency);
		await mkdir(scope, { recursive: true });
		await rm(link, { recursive: true, force: true });
		await symlink(`../../../${dependency}`, link);
	}

	for (const [package_name, dependency] of [
		["render", "parse"],
		["mdsvex", "parse"],
		["mdsvex", "render"],
	]) {
		const actual = await realpath(
			join(
				destination,
				"packages",
				package_name,
				"node_modules",
				"@mdsvex",
				dependency,
			),
		);
		const expected = await realpath(
			join(destination, "packages", dependency),
		);
		if (actual !== expected) {
			throw new Error(
				`workspace link escaped isolation: ${package_name} -> ${dependency}`,
			);
		}
	}
}

async function build_workspace(workspace) {
	for (const name of ["parse", "render", "mdsvex"]) {
		await run("pnpm", ["-C", `packages/${name}`, "build"], {
			cwd: workspace,
			capture: true,
		});
	}
}

async function measure_bundle(workspace) {
	const files = [
		"packages/parse/dist/main.js",
		"packages/render/dist/html_cursor.js",
		"packages/render/dist/sourcemap.js",
		"packages/mdsvex/dist/main.js",
	];
	let raw = 0;
	let gzip = 0;
	for (const file of files) {
		const contents = await readFile(join(workspace, file));
		raw += contents.length;
		gzip += gzipSync(contents).length;
	}
	return { raw, gzip };
}

async function run_worker(
	workspace,
	corpus_path,
	options,
) {
	const output = await run(
		process.execPath,
		[
			"--expose-gc",
			join(tournament_directory, "worker.mjs"),
			"--workspace",
			workspace,
			"--corpus",
			corpus_path,
			"--duration",
			String(options.duration),
			"--warmup",
			String(options.warmup),
		],
		{ capture: true },
	);
	return JSON.parse(output);
}

async function install_dist(source_workspace, execution_workspace) {
	for (const name of ["parse", "render", "mdsvex"]) {
		const destination = join(execution_workspace, "packages", name, "dist");
		await rm(destination, { recursive: true, force: true });
		await cp(
			join(source_workspace, "packages", name, "dist"),
			destination,
			{ recursive: true },
		);
	}
}

async function apply_variant(workspace, variant, originals) {
	for (const [file, source] of originals) {
		await writeFile(join(workspace, file), source);
	}

	for (const edit of variant.edits) {
		const path = join(workspace, edit.file);
		const source = await readFile(path, "utf8");
		const count = source.split(edit.find).length - 1;
		if (count !== edit.expectedCount) {
			throw new Error(
				`${variant.id}: expected ${edit.expectedCount} matches in ${edit.file}, found ${count}`,
			);
		}
		await writeFile(path, source.split(edit.find).join(edit.replace));
	}
}

function median(values) {
	const sorted = values.toSorted((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 === 1
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize_pair(baseline_runs, candidate_runs) {
	const metrics = {};
	for (const name of Object.keys(baseline_runs[0].metrics)) {
		const baseline_hz =
			(baseline_runs[0].metrics[name].hz +
				baseline_runs[1].metrics[name].hz) /
			2;
		const candidate_hz =
			(candidate_runs[0].metrics[name].hz +
				candidate_runs[1].metrics[name].hz) /
			2;
		metrics[name] = {
			baselineHz: baseline_hz,
			candidateHz: candidate_hz,
			ratio: candidate_hz / baseline_hz,
		};
	}
	return {
		correct: candidate_runs.every(
			(result) => result.oracle === baseline_runs[0].oracle,
		),
		baselineOracle: baseline_runs[0].oracle,
		candidateOracle: candidate_runs[0].oracle,
		metrics,
	};
}

function summarize(variant, pair_results, baseline_bundle, candidate_bundle) {
	const ratios = {};
	const wins = {};
	for (const name of Object.keys(pair_results[0].metrics)) {
		const samples = pair_results.map(
			(result) => result.metrics[name].ratio,
		);
		ratios[name] = median(samples);
		wins[name] = samples.filter((ratio) => ratio > 1).length;
	}

	const values = Object.values(ratios);
	return {
		id: variant.id,
		family: variant.family,
		description: variant.description,
		targetMetrics: variant.metrics,
		bundle: {
			baseline: baseline_bundle,
			candidate: candidate_bundle,
			rawDelta: candidate_bundle.raw - baseline_bundle.raw,
			gzipDelta: candidate_bundle.gzip - baseline_bundle.gzip,
		},
		correct: pair_results.every((result) => result.correct),
		ratios,
		wins,
		pairs: pair_results,
		geomean:
			Math.exp(
				values.reduce((total, ratio) => total + Math.log(ratio), 0) /
					values.length,
			),
	};
}

function geomean(values) {
	return Math.exp(
		values.reduce((total, value) => total + Math.log(value), 0) /
			values.length,
	);
}

function classify_results(results, options) {
	const control = results.find((result) => result.family === "control");
	if (!control) {
		throw new Error("tournament requires a control variant");
	}

	const control_noise = Object.fromEntries(
		Object.entries(control.ratios).map(([name, ratio]) => [
			name,
			Math.abs(ratio - 1),
		]),
	);
	const invalid_metrics = Object.entries(control_noise)
		.filter(([, noise]) => noise > options.controlThreshold)
		.map(([name]) => name);
	const bracket_valid = control.correct && invalid_metrics.length === 0;
	control.decision = bracket_valid ? "control-valid" : "control-invalid";
	control.targetGeomean = control.geomean;

	for (const result of results) {
		if (result === control) continue;
		const target_ratios = result.targetMetrics.map(
			(name) => result.ratios[name],
		);
		const target_geomean = geomean(target_ratios);
		const target_noise = Math.max(
			...result.targetMetrics.map((name) => control_noise[name]),
		);
		const required_gain = Math.max(
			options.minimumGain,
			target_noise * 2,
		);
		const pair_scores = result.pairs.map((pair) =>
			geomean(
				result.targetMetrics.map(
					(name) => pair.metrics[name].ratio,
				),
			),
		);
		const required_wins = Math.ceil(options.pairs * 0.75);
		const wins = pair_scores.filter((ratio) => ratio > 1).length;
		const important_regression = target_ratios.some(
			(ratio) => ratio < 0.95,
		);

		result.targetGeomean = target_geomean;
		result.controlNoise = target_noise;
		result.requiredGain = required_gain;
		result.targetWins = wins;
		if (!bracket_valid) result.decision = "reject-noisy-bracket";
		else if (!result.correct) result.decision = "reject-correctness";
		else if (result.bundle.gzipDelta > options.maxGzipGrowth) {
			result.decision = "reject-size";
		} else if (important_regression) result.decision = "reject-regression";
		else if (
			target_geomean < 1 + required_gain ||
			wins < required_wins
		) {
			result.decision = "reject-noise";
		} else {
			result.decision = "advance";
		}
	}

	return {
		bracketValid: bracket_valid,
		controlNoise: control_noise,
		invalidMetrics: invalid_metrics,
	};
}

function print_result(result) {
	const percent = (ratio) => `${((ratio - 1) * 100).toFixed(2)}%`;
	const marker = result.correct ? "ok" : "WRONG";
	console.log(
		[
			marker.padEnd(5),
			percent(result.geomean).padStart(8),
			percent(result.ratios.parse).padStart(8),
			percent(result.ratios.renderMapped).padStart(8),
			percent(result.ratios.compileMappedCold).padStart(8),
			percent(result.ratios.compileMappedReused).padStart(8),
			percent(result.ratios.compileV3).padStart(8),
			percent(result.ratios.compileV3Direct).padStart(8),
			result.id,
		].join("  "),
	);
}

const options = parse_arguments(process.argv.slice(2));
const control_variant = variants.find((variant) => variant.family === "control");
const candidate_variants = variants
	.filter((variant) => variant.family !== "control")
	.filter(
		(variant) =>
			!options.match ||
			variant.id.includes(options.match) ||
			variant.family.includes(options.match),
	)
	.slice(0, options.limit);
const selected_variants = [control_variant, ...candidate_variants];

if (!control_variant) {
	throw new Error("control variant is missing");
}
if (candidate_variants.length === 0 && options.match !== "control") {
	throw new Error("no variants selected");
}

const temporary_root = await mkdtemp(join(tmpdir(), "mdsvex-tournament-"));
const baseline_workspace = join(temporary_root, "baseline");
const candidate_workspace = join(temporary_root, "candidate");
const execution_workspace = join(temporary_root, "execution");
const corpus_path = join(temporary_root, "corpus.json");

try {
	const corpus = await build_corpus(
		repo_root,
		options.mode,
		options.externalDirectory,
	);
	await writeFile(corpus_path, JSON.stringify(corpus));

	console.log(
		`tournament ${options.mode}: ${corpus.summary.documents} documents, ${corpus.summary.characters} characters, ${selected_variants.length} variants`,
	);
	console.log(`temporary workspaces: ${temporary_root}`);
	console.log("copying and building isolated baseline/candidate workspaces");

	await copy_workspace(baseline_workspace);
	await copy_workspace(candidate_workspace);
	await copy_workspace(execution_workspace);
	await Promise.all([
		build_workspace(baseline_workspace),
		build_workspace(candidate_workspace),
	]);
	const baseline_bundle = await measure_bundle(baseline_workspace);

	const edited_files = new Set(
		selected_variants.flatMap((variant) =>
			variant.edits.map((edit) => edit.file),
		),
	);
	const originals = new Map();
	for (const file of edited_files) {
		originals.set(
			file,
			await readFile(join(candidate_workspace, file), "utf8"),
		);
	}

	console.log(
		"state  geomean     parse    render      cold    reused        v3    direct  variant",
	);
	const results = [];
	for (const variant of selected_variants) {
		await apply_variant(candidate_workspace, variant, originals);
		await build_workspace(candidate_workspace);
		const candidate_bundle = await measure_bundle(candidate_workspace);

		// A-B-B-A counterbalances process order and uses fresh V8 isolates.
		const pair_results = [];
		for (let pair = 0; pair < options.pairs; pair += 1) {
			const sample = async (workspace) => {
				await install_dist(workspace, execution_workspace);
				return run_worker(execution_workspace, corpus_path, options);
			};
			let baseline_runs;
			let candidate_runs;
			if (pair % 2 === 0) {
				const baseline_first = await sample(baseline_workspace);
				const candidate_first = await sample(candidate_workspace);
				const candidate_second = await sample(candidate_workspace);
				const baseline_second = await sample(baseline_workspace);
				baseline_runs = [baseline_first, baseline_second];
				candidate_runs = [candidate_first, candidate_second];
			} else {
				const candidate_first = await sample(candidate_workspace);
				const baseline_first = await sample(baseline_workspace);
				const baseline_second = await sample(baseline_workspace);
				const candidate_second = await sample(candidate_workspace);
				baseline_runs = [baseline_first, baseline_second];
				candidate_runs = [candidate_first, candidate_second];
			}
			pair_results.push(summarize_pair(baseline_runs, candidate_runs));
		}

		const result = summarize(
			variant,
			pair_results,
			baseline_bundle,
			candidate_bundle,
		);
		results.push(result);
		print_result(result);
	}

	const classification = classify_results(results, options);
	if (classification.bracketValid) {
		console.log("control valid");
	} else {
		console.log(
			`control invalid: ${classification.invalidMetrics.join(", ")} exceeded ${(options.controlThreshold * 100).toFixed(1)}%`,
		);
	}
	for (const result of results) {
		if (result.family !== "control") {
			console.log(
				`${result.decision.padEnd(21)} ${((result.targetGeomean - 1) * 100).toFixed(2).padStart(8)}%  ${String(result.bundle.gzipDelta).padStart(6)} B gzip  ${result.id}`,
			);
		}
	}

	results.sort((a, b) => b.targetGeomean - a.targetGeomean);
	const report = {
		createdAt: new Date().toISOString(),
		options,
		corpus: corpus.summary,
		classification,
		results,
	};
	const output_path =
		options.output ?? join(temporary_root, "tournament-results.json");
	await mkdir(dirname(output_path), { recursive: true });
	await writeFile(output_path, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`results: ${output_path}`);
} finally {
	if (!options.keep) {
		await rm(temporary_root, { recursive: true, force: true });
	}
}
