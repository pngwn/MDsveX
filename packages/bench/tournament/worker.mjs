import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function parse_arguments(argv) {
	const values = {};
	for (let index = 0; index < argv.length; index += 2) {
		values[argv[index].slice(2)] = argv[index + 1];
	}
	return values;
}

function module_url(path) {
	return pathToFileURL(path).href;
}

function update_typed_array(hash, value, size) {
	hash.update(
		Buffer.from(value.buffer, value.byteOffset, size * value.BYTES_PER_ELEMENT),
	);
}

function hash_parse_result(hash, result) {
	const nodes = result.nodes;
	hash.update(String(nodes.size));

	for (const field of [
		"_kinds",
		"_starts",
		"_ends",
		"_extras",
		"_value_starts",
		"_value_ends",
		"_parents",
		"_next_siblings",
		"_prev_siblings",
		"_children_starts",
		"_children_ends",
		"_pending_nodes",
	]) {
		update_typed_array(hash, nodes[field], nodes.size);
	}

	for (let index = 0; index < nodes.size; index += 1) {
		hash.update(JSON.stringify(nodes.metadata_at(index)) ?? "undefined");
		hash.update(nodes._strings[index] ?? "");
	}

	const errors = result.errors.slice();
	hash.update(
		Buffer.from(
			errors.buffer,
			errors.byteOffset,
			errors.length * errors.BYTES_PER_ELEMENT,
		),
	);
	hash.update(result.source);
}

function warm(run, warmup_ms) {
	const warmup_deadline = performance.now() + warmup_ms;
	while (performance.now() < warmup_deadline) {
		run();
	}
}

function calibrate_iterations(run, duration_ms) {
	const calibration_ms = Math.min(100, Math.max(30, duration_ms / 3));
	const start = performance.now();
	let iterations = 0;
	do {
		run();
		iterations += 1;
	} while (performance.now() - start < calibration_ms);
	const elapsed = performance.now() - start;
	return Math.max(2, Math.ceil((iterations * duration_ms) / elapsed));
}

function measure_iterations(run, iterations) {
	globalThis.gc?.();
	const start = performance.now();
	let checksum = 0;
	for (let index = 0; index < iterations; index += 1) {
		checksum ^= run();
	}
	const elapsed = performance.now() - start;

	return {
		hz: (iterations * 1_000) / elapsed,
		iterations,
		elapsed,
		checksum,
	};
}

async function load_pipeline(workspace) {
	const parse_module = await import(
		module_url(join(workspace, "packages/parse/dist/main.js"))
	);
	const render_module = await import(
		module_url(join(workspace, "packages/render/dist/html_cursor.js"))
	);
	const sourcemap_module = await import(
		module_url(join(workspace, "packages/render/dist/sourcemap.js"))
	);
	const compiler_module = await import(
		module_url(join(workspace, "packages/mdsvex/dist/main.js"))
	);

	return {
		parse_markdown_svelte: parse_module.parse_markdown_svelte,
		CursorHTMLRenderer: render_module.CursorHTMLRenderer,
		mappings_to_v3: sourcemap_module.mappings_to_v3,
		compile: compiler_module.compile,
		CompilerSession: compiler_module.CompilerSession,
	};
}

function prepare_pipeline(pipeline, corpus) {
	const {
		parse_markdown_svelte,
		CursorHTMLRenderer,
		mappings_to_v3,
		compile,
		CompilerSession,
	} = pipeline;
	const sources = corpus.documents.map((document) => document.source);
	const parsed = sources.map((source) => parse_markdown_svelte(source));
	const compiler = new CompilerSession();
	const oracle = createHash("sha256");

	for (const source of sources) {
		const parsed_result = parse_markdown_svelte(source);
		hash_parse_result(oracle, parsed_result);
		const compiled = compile(source, { sourcemap: true });
		oracle.update(compiled.code);
		oracle.update(JSON.stringify(compiled.mappings));
	}

	return {
		oracle: oracle.digest("hex"),
		runs: {
			parse() {
				let nodes = 0;
				for (const source of sources) {
					nodes += parse_markdown_svelte(source).nodes.size;
				}
				return nodes;
			},
			renderMapped() {
				let output = 0;
				for (const result of parsed) {
					const renderer = new CursorHTMLRenderer({ cache: false });
					const rendered = renderer.update_mapped(result.nodes, result.source);
					output += renderer.html.length + rendered.mappings.length;
				}
				return output;
			},
			compileMappedCold() {
				let output = 0;
				for (const source of sources) {
					const result = compile(source, { sourcemap: true });
					output += result.code.length + result.mappings.length;
				}
				return output;
			},
			compileMappedReused() {
				let output = 0;
				for (const source of sources) {
					const result = compiler.compile(source, { sourcemap: true });
					output += result.code.length + result.mappings.length;
				}
				return output;
			},
			compileV3() {
				let output = 0;
				for (let index = 0; index < sources.length; index += 1) {
					const source = sources[index];
					const result = compiler.compile(source, { sourcemap: true });
					const map = mappings_to_v3(
						result.mappings,
						source,
						result.code,
						corpus.documents[index].name,
					);
					output += result.code.length + map.mappings.length;
				}
				return output;
			},
		},
	};
}

const args = parse_arguments(process.argv.slice(2));
const corpus = JSON.parse(await readFile(args.corpus, "utf8"));
const duration_ms = Number(args.duration);
const warmup_ms = Number(args.warmup);
const pipeline = prepare_pipeline(await load_pipeline(args.workspace), corpus);

const metrics = {};
for (const [name, run] of Object.entries(pipeline.runs)) {
	warm(run, warmup_ms);
	const iterations = calibrate_iterations(run, duration_ms);
	metrics[name] = measure_iterations(run, iterations);
}

process.stdout.write(
	`${JSON.stringify({
		oracle: pipeline.oracle,
		metrics,
	})}\n`,
);
