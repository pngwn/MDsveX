import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Section, Snippet } from "./snippets";

const FIXTURES_ROOT = resolve(
	fileURLToPath(import.meta.url),
	"../../../../parse/test/fixtures/pfm",
);

function numeric_sort(a: string, b: string): number {
	const na = parseInt(a, 10);
	const nb = parseInt(b, 10);
	if (!isNaN(na) && !isNaN(nb)) return na - nb;
	return a.localeCompare(b);
}

function slug_from_category(cat: string): string {
	return cat.replace(/_/g, "-");
}

function name_from_category(cat: string): string {
	return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function load_fixture_sections(): Section[] {
	const categories = readdirSync(FIXTURES_ROOT, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();

	return categories.map((cat) => {
		const cat_dir = join(FIXTURES_ROOT, cat);
		const files = readdirSync(cat_dir)
			.filter((f) => f.endsWith(".md"))
			.sort(numeric_sort);

		const snippets: Snippet[] = files.map((file) => {
			const id = basename(file, ".md");
			const markdown = readFileSync(join(cat_dir, file), "utf8");
			return {
				name: `#${id}`,
				slug: id,
				markdown,
			};
		});

		return {
			name: name_from_category(cat),
			slug: `fixtures--${slug_from_category(cat)}`,
			snippets,
		};
	});
}
