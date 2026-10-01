import { parse_yaml, YamlError } from './yaml';

export interface FrontmatterOptions {
	/**
	 * replaces the built in yaml parser, null or undefined means no metadata
	 * @example parse: (raw) => yaml.parse(raw)
	 */
	parse?: (raw: string) => Record<string, unknown> | null | undefined;
}

/** line and column index the document */
export class FrontmatterError extends Error {
	/** 1 based line in the document */
	line: number;
	/** 1 based column */
	column: number;

	constructor(message: string, line: number, column: number) {
		super(message);
		this.name = 'FrontmatterError';
		this.line = line;
		this.column = column;
	}
}

const HINT =
	"mdsvex's built-in parser handles common YAML. For anything else pass a parser, for example frontmatter: { parse: (raw) => yaml.parse(raw) }";

/** start and end index the normalized source */
export function parse_frontmatter(
	source: string,
	start: number,
	end: number,
	parse: FrontmatterOptions['parse']
): Record<string, unknown> {
	const raw = source.slice(start, end);
	if (parse === undefined) {
		try {
			return parse_yaml(raw);
		} catch (e) {
			if (!(e instanceof YamlError)) throw e;
			const line = e.line + lines_before(source, start);
			throw new FrontmatterError(
				`Unsupported frontmatter at line ${line}: ${e.reason}. ${HINT}`,
				line,
				e.column
			);
		}
	}
	const metadata = parse(raw);
	if (metadata == null) return {};
	if (typeof metadata !== 'object' || Array.isArray(metadata)) {
		throw new FrontmatterError(
			`frontmatter.parse must return an object of metadata, it returned ${
				Array.isArray(metadata) ? 'an array' : typeof metadata
			}`,
			1,
			1
		);
	}
	return metadata;
}

function lines_before(source: string, offset: number): number {
	let n = 0;
	let i = source.indexOf('\n');
	while (i !== -1 && i < offset) {
		n++;
		i = source.indexOf('\n', i + 1);
	}
	return n;
}

// svelte and preprocessors find script and style tags even inside strings
const TAG = /<(?=\/?(?:script|style))/gi;

export function metadata_export(metadata: Record<string, unknown>): string {
	let json = JSON.stringify(metadata);
	// < only occurs in a json string, where \u003c reads the same
	if (json.indexOf('<') !== -1) json = json.replace(TAG, '\\u003c');
	return 'export const metadata = ' + json + ';';
}
