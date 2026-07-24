import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const SOURCE_EXTENSIONS = new Set([".md", ".svx", ".svelte"]);

function hash_string(value) {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

async function walk_sources(root, origin) {
	const documents = [];

	async function visit(directory) {
		const entries = await readdir(directory, { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));

		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
			} else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
				const name = relative(root, path).split(sep).join("/");
				documents.push({
					name: `${origin}/${name}`,
					origin,
					category: category_for(origin, name),
					source: await readFile(path, "utf8"),
				});
			}
		}
	}

	await visit(root);
	return documents;
}

function category_for(origin, name) {
	const parts = name.split("/");
	if (origin === "fixture") {
		if (parts[0] === "pfm") return `pfm/${parts[1] ?? "other"}`;
		return parts[0] ?? "fixture";
	}
	return origin;
}

function balanced_sample(documents, limit) {
	if (documents.length <= limit) return documents;

	const buckets = new Map();
	for (const document of documents) {
		const bucket = buckets.get(document.category) ?? [];
		bucket.push(document);
		buckets.set(document.category, bucket);
	}

	const ordered_buckets = [...buckets.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, bucket]) =>
			bucket.sort(
				(a, b) => hash_string(a.name) - hash_string(b.name),
			),
		);

	const selected = [];
	for (let index = 0; selected.length < limit; index += 1) {
		let added = false;
		for (const bucket of ordered_buckets) {
			if (index < bucket.length) {
				selected.push(bucket[index]);
				added = true;
				if (selected.length === limit) break;
			}
		}
		if (!added) break;
	}
	return selected;
}

function synthetic_documents() {
	const prose = [
		"# A representative document",
		"",
		"Paragraphs should dominate many real documents, with **emphasis**,",
		"[links](https://example.com), `inline code`, and punctuation.",
		"",
	].join("\n");

	return [
		{
			name: "synthetic/long-prose.md",
			origin: "synthetic",
			category: "synthetic/prose",
			source: prose.repeat(160),
		},
		{
			name: "synthetic/many-small-blocks.md",
			origin: "synthetic",
			category: "synthetic/blocks",
			source: Array.from(
				{ length: 240 },
				(_, i) => `## Heading ${i}\n\nShort paragraph ${i}.\n`,
			).join("\n"),
		},
		{
			name: "synthetic/deep-containers.md",
			origin: "synthetic",
			category: "synthetic/containers",
			source: Array.from(
				{ length: 100 },
				(_, i) =>
					`${"> ".repeat((i % 6) + 1)}- item ${i}\n${"  ".repeat(i % 5)}  continuation`,
			).join("\n"),
		},
		{
			name: "synthetic/delimiter-storm.md",
			origin: "synthetic",
			category: "synthetic/inline",
			source: Array.from(
				{ length: 180 },
				(_, i) =>
					`***a${i}*** ~~b${i}~~ ^c${i}^ ~d${i}~ [e${i}](url) \`f${i}\``,
			).join("\n\n"),
		},
		{
			name: "synthetic/code-heavy.md",
			origin: "synthetic",
			category: "synthetic/code",
			source: Array.from(
				{ length: 80 },
				(_, i) =>
					`~~~js title="example-${i}.js"\nconst value${i} = ${i};\nconsole.log(value${i});\n~~~`,
			).join("\n\n"),
		},
		{
			name: "synthetic/svelte-heavy.svx",
			origin: "synthetic",
			category: "synthetic/svelte",
			source: Array.from(
				{ length: 120 },
				(_, i) =>
					`{#if ready${i}}<Component value={items[${i}]} />{:else}<span>waiting</span>{/if}`,
			).join("\n"),
		},
		{
			name: "synthetic/tables.md",
			origin: "synthetic",
			category: "synthetic/tables",
			source: Array.from(
				{ length: 90 },
				(_, i) =>
					`| key | value | note |\n| --- | ---: | :--- |\n| ${i} | ${i * 7} | row ${i} |`,
			).join("\n\n"),
		},
		{
			name: "synthetic/html-heavy.md",
			origin: "synthetic",
			category: "synthetic/html",
			source: Array.from(
				{ length: 100 },
				(_, i) =>
					`<section data-index="${i}"><strong>item ${i}</strong><br /></section>`,
			).join("\n"),
		},
	];
}

export async function build_corpus(repo_root, mode, external_directory) {
	const fixture_root = join(repo_root, "packages/parse/test/fixtures");
	const benchmark_root = join(repo_root, "packages/bench/benchmarks");

	const fixtures = await walk_sources(fixture_root, "fixture");
	const benchmarks = (await walk_sources(benchmark_root, "benchmark")).filter(
		(document) => document.name.includes("/fixture"),
	);

	let external = [];
	if (external_directory) {
		external = await walk_sources(external_directory, "external");
	}

	const local_limit =
		mode === "smoke" ? 24 : mode === "screen" ? 128 : fixtures.length;
	const external_limit =
		mode === "smoke" ? 4 : mode === "screen" ? 32 : external.length;

	const documents = [
		...balanced_sample(fixtures, local_limit),
		...benchmarks,
		...synthetic_documents(),
		...balanced_sample(external, external_limit),
	];

	return {
		mode,
		documents,
		summary: {
			documents: documents.length,
			characters: documents.reduce(
				(total, document) => total + document.source.length,
				0,
			),
			fixturesAvailable: fixtures.length,
			externalAvailable: external.length,
		},
	};
}
