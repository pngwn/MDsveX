import { scan_exports_detail } from './scan_exports';
import type { ScannedExports } from './scan_exports';

export function same_names(
	a: readonly string[],
	b: readonly string[]
): boolean {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	for (let i = 0; i < b.length; i++) if (!set.has(b[i])) return false;
	return true;
}

export type Warn = (message: string) => void;

/**
 * export scans per resolved file and the files each document read names from,
 * any module that supplies replacements scans through here
 */
export function export_tracker() {
	const scanned = new Map<string, { code: string; result: ScannedExports }>();
	const doc_files = new Map<string, readonly string[]>();
	/** the timestamp of each file whose export set changed */
	const changed_at = new Map<string, number>();

	return {
		/** scanned again only when the code changed */
		async scan(
			file: string,
			warn: Warn,
			code?: string
		): Promise<ScannedExports> {
			if (code === undefined) {
				const fs = await import('node:fs/promises');
				code = await fs.readFile(file, 'utf8');
			}
			const hit = scanned.get(file);
			if (hit !== undefined && hit.code === code) return hit.result;
			const result = await scan_exports_detail(
				code,
				file.endsWith('.svelte') ? 'svelte' : 'js'
			);
			for (const star of result.stars) {
				warn(
					`${file} re-exports "${star}" with export *, whose names a static ` +
						`scan cannot see. export each replacement by name`
				);
			}
			scanned.set(file, { code, result });
			return result;
		},
		/** note a change the names cannot show, such as a moved directives module */
		mark(file: string, timestamp: number): void {
			changed_at.set(file, timestamp);
		},
		marked(file: string, timestamp: number): boolean {
			return changed_at.get(file) === timestamp;
		},
		/** true when the names differ, or differed at this timestamp, so every environment sees one change */
		changed(
			file: string,
			before: readonly string[],
			after: readonly string[],
			timestamp: number
		): boolean {
			if (!same_names(before, after)) {
				changed_at.set(file, timestamp);
				return true;
			}
			return changed_at.get(file) === timestamp;
		},
		track(doc: string, files: readonly string[]): void {
			doc_files.set(doc, files);
		},
		docs_using(file: string): string[] {
			const docs: string[] = [];
			for (const [doc, files] of doc_files) {
				if (files.includes(file)) docs.push(doc);
			}
			return docs;
		},
	};
}

export type ExportTracker = ReturnType<typeof export_tracker>;
