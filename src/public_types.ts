type BufferEncoding =
	| 'ascii'
	| 'utf8'
	| 'utf-8'
	| 'utf16le'
	| 'ucs2'
	| 'ucs-2'
	| 'base64'
	| 'latin1'
	| 'binary'
	| 'hex';

/**
 * VFileContents can either be text, or a Buffer like structure
 * @remarks
 * This does not directly use type `Buffer, because it can also be used in a browser context.
 * Instead this leverages `Uint8Array` which is the base type for `Buffer`, and a native JavaScript construct.
 */
type VFileContents = string | Uint8Array;
type VFileCompatible = VFile | VFileOptions | VFileContents;

type VFileReporter<T = Settings> = (files: VFile[], options: T) => string;

interface VFileOptions {
	contents?: VFileContents;
	path?: string;
	basename?: string;
	stem?: string;
	extname?: string;
	dirname?: string;
	cwd?: string;
	data?: any;
	[key: string]: any;
}
interface VFile {
	/**
	 * Create a new virtual file. If `options` is `string` or `Buffer`, treats it as `{contents: options}`.
	 * If `options` is a `VFile`, returns it. All other options are set on the newly created `vfile`.
	 *
	 * Path related properties are set in the following order (least specific to most specific): `history`, `path`, `basename`, `stem`, `extname`, `dirname`.
	 *
	 * It’s not possible to set either `dirname` or `extname` without setting either `history`, `path`, `basename`, or `stem` as well.
	 *
	 * @param options If `options` is `string` or `Buffer`, treats it as `{contents: options}`. If `options` is a `VFile`, returns it. All other options are set on the newly created `vfile`.
	 */
	<F extends VFile>(input?: VFileContents | F | VFileOptions): F;
	/**
	 * List of file-paths the file moved between.
	 */
	history: string[];
	/**
	 * Place to store custom information.
	 * It's OK to store custom data directly on the `vfile`, moving it to `data` gives a little more privacy.
	 */
	data: unknown;
	/**
	 * List of messages associated with the file.
	 */
	messages: VFileMessage[];
	/**
	 * Raw value.
	 */
	contents: VFileContents;
	/**
	 * Path of `vfile`.
	 * Cannot be nullified.
	 */
	path?: string;
	/**
	 * Path to parent directory of `vfile`.
	 * Cannot be set if there's no `path` yet.
	 */
	dirname?: string;
	/**
	 * Current name (including extension) of `vfile`.
	 * Cannot contain path separators.
	 * Cannot be nullified either (use `file.path = file.dirname` instead).
	 */
	basename?: string;
	/**
	 * Name (without extension) of `vfile`.
	 * Cannot be nullified, and cannot contain path separators.
	 */
	stem?: string;
	/**
	 * Extension (with dot) of `vfile`.
	 * Cannot be set if there's no `path` yet and cannot contain path separators.
	 */
	extname?: string;
	/**
	 * Base of `path`.
	 * Defaults to `process.cwd()`.
	 */
	cwd: string;
	/**
	 * Convert contents of `vfile` to string.
	 * @param encoding If `contents` is a buffer, `encoding` is used to stringify buffers (default: `'utf8'`).
	 */
	toString: (encoding?: BufferEncoding) => string;
	/**
	 * Associates a message with the file for `reason` at `position`.
	 * When an error is passed in as `reason`, copies the stack.
	 * Each message has a `fatal` property which by default is set to `false` (ie. `warning`).
	 * @param reason Reason for message. Uses the stack and message of the error if given.
	 * @param position Place at which the message occurred in `vfile`.
	 * @param ruleId Category of message.
	 */
	message: (
		reason: string,
		position?: Point | Position | Node,
		ruleId?: string
	) => VFileMessage;
	/**
	 * Associates a fatal message with the file, then immediately throws it.
	 * Note: fatal errors mean a file is no longer processable.
	 * Calls `message()` internally.
	 * @param reason Reason for message. Uses the stack and message of the error if given.
	 * @param position Place at which the message occurred in `vfile`.
	 * @param ruleId Category of message.
	 */
	fail: (
		reason: string,
		position?: Point | Position | Node,
		ruleId?: string
	) => never;
	/**
	 * Associates an informational message with the file, where `fatal` is set to `null`.
	 * Calls `message()` internally.
	 * @param reason Reason for message. Uses the stack and message of the error if given.
	 * @param position Place at which the message occurred in `vfile`.
	 * @param ruleId Category of message.
	 */
	info: (
		reason: string,
		position?: Point | Position | Node,
		ruleId?: string
	) => VFileMessage;
}

type ProcessCallback = (error: Error | null, file: VFile) => void;

type RunCallback = (error: Error | null, node: Node, file: VFile) => void;

type CompilerFunction = (node: Node, file: VFile) => string;

interface Compiler {
	/**
	 * Transform an AST node/tree into text
	 *
	 * @returns Compiled text
	 */
	compile(): string;
}

type CompilerConstructor = new (node: Node, file: VFile) => Compiler;

type ParserFunction = (text: string, file: VFile) => Node;
interface Parser {
	/**
	 * Transform file contents into an AST
	 *
	 * @returns Parsed AST node/tree
	 */
	parse(): Node;
}
type ParserConstructor = new (text: string, file: VFile) => Parser;

interface ProcessorSettings<P = Settings> {
	settings: P;
}

type PluginTuple<S extends any[] = [Settings?], P = Settings> = [
	Plugin<S, P>,
	/**
	 * NOTE: ideally this would be S instead of any[]
	 * As of TypeScript 3.5.2 generic tuples cannot be spread
	 * See: https://github.com/microsoft/TypeScript/issues/26113
	 */
	...any[]
];
type Pluggable<S extends any[] = [Settings?], P = Settings> =
	| Plugin<S, P>
	| Preset<S, P>
	| PluginTuple<S, P>;

type PluggableList<P = Settings> = Array<Pluggable<[any?], P>>;
interface Preset<S = Settings, P = Settings> {
	plugins: PluggableList<P>;
	settings?: Settings;
}
interface Processor<P = Settings> {
	/**
	 * Clone current processor
	 *
	 * @returns New unfrozen processor which is configured to function the same as its ancestor.
	 * But when the descendant processor is configured in the future it does not affect the ancestral processor.
	 */
	(): Processor<P>;

	/**
	 * Configure the processor to use a plugin and optionally configure that plugin with options.
	 *
	 * @param plugin unified plugin
	 * @param settings Configuration for plugin
	 * @typeParam S Plugin settings
	 * @returns The processor on which use is invoked
	 */
	use<S extends any[] = [Settings?]>(
		plugin: Plugin<S, P>,
		...settings: S
	): Processor<P>;

	/**
	 * Configure the processor with a preset to use
	 *
	 * @param preset `Object` with an plugins (set to list), and/or an optional settings object
	 */
	use<S extends any[] = [Settings?]>(preset: Preset<S, P>): Processor<P>;

	/**
	 * Configure using a tuple of plugin and setting(s)
	 *
	 * @param pluginTuple pairs, plugin and settings in an array
	 * @typeParam S Plugin settings
	 */
	use<S extends any[] = [Settings?]>(
		pluginTuple: PluginTuple<S, P>
	): Processor<P>;

	/**
	 * A list of plugins and presets to be applied to processor
	 *
	 * @param list List of plugins, presets, and pairs
	 */
	use(list: PluggableList<P>): Processor<P>;

	/**
	 * Configuration passed to a frozen processor
	 *
	 * @param processorSettings Settings passed to processor
	 */
	use(processorSettings: ProcessorSettings<P>): Processor<P>;

	/**
	 * Parse text to a syntax tree.
	 *
	 * @param file VFile or anything which can be given to vfile()
	 * @returns Syntax tree representation of input.
	 */
	parse(file: VFileCompatible): Node;

	/**
	 * Function handling the parsing of text to a syntax tree.
	 * Used in the parse phase in the process and invoked with a `string` and `VFile` representation of the document to parse.
	 *
	 * `Parser` can be a normal function in which case it must return a `Node`: the syntax tree representation of the given file.
	 *
	 * `Parser` can also be a constructor function (a function with keys in its `prototype`) in which case it’s invoked with `new`.
	 * Instances must have a parse method which is invoked without arguments and must return a `Node`.
	 */
	Parser: ParserConstructor | ParserFunction;

	/**
	 * Compile a syntax tree to text.
	 *
	 * @param node unist node
	 * @param file `VFile` or anything which can be given to `vfile()`
	 * @returns String representation of the syntax tree file
	 */
	stringify(node: Node, file?: VFileCompatible): string;

	/**
	 * Function handling the compilation of syntax tree to a text.
	 * Used in the stringify phase in the process and invoked with a `Node` and `VFile` representation of the document to stringify.
	 *
	 * `Compiler` can be a normal function in which case it must return a `string`: the text representation of the given syntax tree.
	 *
	 * `Compiler` can also be a constructor function (a function with keys in its `prototype`) in which case it’s invoked with `new`.
	 * Instances must have a `compile` method which is invoked without arguments and must return a `string`.
	 */
	Compiler: CompilerConstructor | CompilerFunction;

	/**
	 * Transform a syntax tree by applying plugins to it.
	 *
	 * @param node Node to transform
	 * @returns `Promise` if `done` is not given. Rejected with an error, or resolved with the resulting syntax tree.
	 */
	run(node: Node): Promise<Node>;

	/**
	 * Transform a syntax tree by applying plugins to it.
	 *
	 * @param node Node to transform
	 * @param file `VFile` or anything which can be given to `vfile()`
	 * @returns `Promise` if `done` is not given. Rejected with an error, or resolved with the resulting syntax tree.
	 */
	run(node: Node, file: VFileCompatible): Promise<Node>;

	/**
	 * Transform a syntax tree by applying plugins to it.
	 *
	 * @param node Node to transform
	 * @param done Invoked when transformation is complete.
	 */
	run(node: Node, done: RunCallback): void;

	/**
	 * Transform a syntax tree by applying plugins to it.
	 *
	 * @param node Node to transform
	 * @param file `VFile` or anything which can be given to `vfile()`
	 * @param done Invoked when transformation is complete.
	 */
	run(node: Node, file: VFileCompatible, done: RunCallback): void;

	/**
	 * Transform a syntax tree by applying plugins to it.
	 *
	 * If asynchronous plugins are configured an error is thrown.
	 *
	 * @param node Node to transform
	 * @param file `VFile` or anything which can be given to `vfile()`
	 * @returns The given syntax tree.
	 */
	runSync(node: Node, file?: VFileCompatible): Node;

	/**
	 * Process the given representation of a file as configured on the processor. The process invokes `parse`, `run`, and `stringify` internally.
	 * @param file `VFile` or anything which can be given to `vfile()`
	 * @returns `Promise` if `done` is not given.
	 * Rejected with an error or resolved with the resulting file.
	 */
	process(file: VFileCompatible): Promise<VFile>;

	/**
	 * Process the given representation of a file as configured on the processor. The process invokes `parse`, `run`, and `stringify` internally.
	 * @param file `VFile` or anything which can be given to `vfile()`
	 * @param done Invoked when the process is complete. Invoked with a fatal error, if any, and the VFile.
	 */
	process(file: VFileCompatible, done: ProcessCallback): void;

	/**
	 * Process the given representation of a file as configured on the processor. The process invokes `parse`, `run`, and `stringify` internally.
	 *
	 * If asynchronous plugins are configured an error is thrown.
	 *
	 * @param file `VFile` or anything which can be given to `vfile()`
	 * @returns Virtual file with modified contents.
	 */
	processSync(file: VFileCompatible): VFile;

	/**
	 * Get or set information in an in-memory key-value store accessible to all phases of the process.
	 * An example is a list of HTML elements which are self-closing, which is needed when parsing, transforming, and compiling HTML.
	 *
	 * @returns key-value store object
	 */
	data(): { [key: string]: unknown };

	/**
	 * @param key Identifier
	 * @returns If getting, the value at key
	 */
	data(key: string): unknown;

	/**
	 * @param value Value to set. Omit if getting key
	 * @returns If setting, the processor on which data is invoked
	 */
	data(key: string, value: any): Processor<P>;

	/**
	 * Freeze a processor. Frozen processors are meant to be extended and not to be configured or processed directly.
	 *
	 * Once a processor is frozen it cannot be unfrozen. New processors functioning just like it can be created by invoking the processor.
	 *
	 * It’s possible to freeze processors explicitly, by calling `.freeze()`, but `.parse()`, `.run()`, `.stringify()`, and `.process()` call `.freeze()` to freeze a processor too.
	 *
	 * @returns The processor on which freeze is invoked.
	 */
	freeze(): Processor<P>;
}
type Transformer = (
	node: Node,
	file: VFile,
	next?: (
		error: Error | null,
		tree: Node,
		file: VFile
	) => Record<string, unknown>
) => Error | Node | Promise<Node> | void | Promise<void>;

type Attacher<S extends any[] = [Settings?], P = Settings> = (
	this: Processor<P>,
	...settings: S
) => Transformer | void;

type Settings = Record<string, unknown>;

type Plugin<S extends any[] = [Settings?], P = Settings> = Attacher<S, P>;
export interface Position {
	/**
	 * Place of the first character of the parsed source region.
	 */
	start: Point;

	/**
	 * Place of the first character after the parsed source region.
	 */
	end: Point;

	/**
	 * Start column at each index (plus start line) in the source region,
	 * for elements that span multiple lines.
	 */
	indent?: number[];
}

/**
 * One place in a source file.
 */
export interface Point {
	/**
	 * Line in a source file (1-indexed integer).
	 */
	line: number;

	/**
	 * Column in a source file (1-indexed integer).
	 */
	column: number;
	/**
	 * Character in a source file (0-indexed integer).
	 */
	offset?: number;
}
interface Data {
	[key: string]: unknown;
}
interface Node {
	/**
	 * The variant of a node.
	 */
	type: string;

	/**
	 * Information from the ecosystem.
	 */
	data?: Data;

	/**
	 * Location of a node in a source document.
	 * Must not be present if a node is generated.
	 */
	position?: Position;

	[key: string]: unknown;
}
interface VFileMessage extends Error {
	/**
	 * Constructor of a message for `reason` at `position` from `origin`.
	 * When an error is passed in as `reason`, copies the `stack`.
	 *
	 * @param reason Reason for message (`string` or `Error`). Uses the stack and message of the error if given.
	 * @param position Place at which the message occurred in a file (`Node`, `Position`, or `Point`, optional).
	 * @param origin Place in code the message originates from (`string`, optional).
	 */
	(
		reason: string | Error,
		position?: Node | Position | Point,
		origin?: string
	): VFileMessage;

	/**
	 * Constructor of a message for `reason` at `position` from `origin`.
	 * When an error is passed in as `reason`, copies the `stack`.
	 *
	 * @param reason Reason for message (`string` or `Error`). Uses the stack and message of the error if given.
	 * @param position Place at which the message occurred in a file (`Node`, `Position`, or `Point`, optional).
	 * @param origin Place in code the message originates from (`string`, optional).
	 */
	new (
		reason: string | Error,
		position?: Node | Position | Point,
		origin?: string
	): VFileMessage;

	/**
	 * Category of message.
	 */
	ruleId: string | null;

	/**
	 * Reason for message.
	 */
	reason: string;

	/**
	 * Starting line of error.
	 */
	line: number | null;

	/**
	 * Starting column of error.
	 */
	column: number | null;

	/**
	 * Full range information, when available.
	 * Has start and end properties, both set to an object with line and column, set to number?.
	 */
	location: Position;

	/**
	 * Namespace of warning.
	 */
	source: string | null;

	/**
	 * If true, marks associated file as no longer processable.
	 */
	fatal?: boolean | null;

	/**
	 * You may add a file property with a path of a file (used throughout the VFile ecosystem).
	 */
	file?: string;

	/**
	 * You may add a note property with a long form description of the message (supported by vfile-reporter).
	 */
	note?: string;

	/**
	 * You may add a url property with a link to documentation for the message.
	 */
	url?: string;

	/**
	 * It’s OK to store custom data directly on the VMessage, some of those are handled by utilities.
	 */
	[key: string]: unknown;
}

export declare type frontmatter_options = {
	/**
	 * **parse** - defines a custom parse function for frontmatter. The function receives the frontmatter string and an errors array as arguments and must return either `undefined` or an object of options containing the frontmatter data. Errors or warnings can be pushed to the messages array and will be printed to the user, they should take the shape of a {@link https://github.com/vfile/vfile-message vfile message}. The default frontmatter parser only handles `yaml`.
	 *
	 * *example:*
	 * ```js
	 * parse(frontmatter, messages) {
	 *   try {
	 *     return parse(frontmatter);
	 *   } catch(e) {
	 *     messages.push(new Message(e.message));
	 *   }
	 * }
	 * ```
	 */
	parse: (
		fm: string,
		messages: VFileMessage[]
	) => undefined | Record<string, unknown>;
	/**
	 * **type** - a string describing the language of your frontmatter. Default: `yaml`.
	 *
	 * *example:*
	 * ```js
	 * type: "toml"
	 * ```
	 */
	type: string;
	/**
	 * **marker** - a character describing the fence that should be used for frontmatter. Passing `"+"` allows the use of `+++`. Default: `"-"`.
	 *
	 * *example:*
	 * ```js
	 * marker: "+"
	 * ```
	 */
	marker: string;
};

export declare type smartypants_options =
	| boolean
	| {
			/**
			 * **quotes** - Converts straight double and single quotes to fancy curly double or single quotes. Default: `true`.
			 *
			 *  *example:*
			 * ```js
			 * quotes: false // to disable
			 * ```
			 */
			quotes?: boolean;
			/**
			 * **ellipses** - Converts three dots (`...`) to a real ellipsis character. Default: `true`.
			 *
			 *  *example:*
			 * ```js
			 * ellipses: true // to disable
			 * ```
			 */
			ellipses?: boolean;
			/**
			 * **backticks** - When `true`, converts double back-ticks into an opening curly double quote, and double straight single quotes into a closing curly double quote. When `"all"` it also converts single back-ticks into a single opening quote, and a single straight quote into a closing single, curly quote. Default: `true`.
			 *
			 * Note: Quotes can not be `true` when backticks is `'all'`;
			 *
			 *  *example:*
			 * ```js
			 * backticks: "all" // to disable
			 * ```
			 */
			backticks?: boolean | 'all';

			/**
			 * **dashes** - When `true`, converts two dashes into an em-dash character. When `'oldschool'`, converts two dashes into an en-dash, and three dashes into an em-dash. When `'inverted'`, converts two dashes into an em-dash, and three dashes into an en-dash. Default: `true`.
			 *
			 * *example:*
			 * ```js
			 * dashes: "oldschool"
			 * ```
			 */
			dashes?: boolean | 'oldschool' | 'inverted';
	  };

export declare type highlight = {
	/**
	 * **highlighter** - A custom highlight function for syntax highlighting. Two arguments are passed, both strings: the code to highlight and the language (if one is provided). It must return a string that will be injected into the document.
	 *
	 *  *example:*
	 * ```js
	 * highlighter(code, lang = "") {
	 *  return `<pre class="${lang}"><code>${code}</code></pre>`;
	 * }
	 * ```
	 */
	highlighter?: (code: string, lang: string | undefined) => string;

	/**
	 * **alias** - An object of aliases for standard language names. This allow you to map arbitrary names to standard names.
	 *
	 *  *example:*
	 * ```js
	 * alias: {
	 *   yavascript: 'javascript'
	 * }
	 * ```
	 */
	alias?: Record<string, string>;
};

/**
 * The mdsvex options object
 */

export declare type mdsvex_options = {
	/**
	 * **remarkPlugins** - an array with each element being either a {@link https://github.com/remarkjs/remark/blob/HEAD/doc/plugins.md#list-of-plugins remark plugin} or a tuple of `plugin` and `pluginOptions`. Default: `[ ]`. {@link https://mdsvex.com/docs#remarkplugins--rehypeplugins More details.}
	 *
	 * *examples:*
	 * ```js
	 * remarkPlugins: [ plugin1, plugin2 ]
	 * ```
	 * ```js
	 * remarkPlugins: [ [ plugin, options], [ plugin2, options2 ] ]
	 * ```
	 * ```js
	 * remarkPlugins: [ plugin, [ plugin2, options2 ] ]
	 * ```
	 */
	remarkPlugins?: Array<[Plugin, Settings] | Plugin>;
	/**
	 * **rehypePlugins** - an array with each element being either a {@link https://github.com/rehypejs/rehype/blob/HEAD/doc/plugins.md#list-of-plugins rehype plugin} or a tuple of `plugin` and `pluginOptions`. Default: `[ ]`. {@link https://mdsvex.com/docs#remarkplugins--rehypeplugins More details.}
	 *
	 * *examples:*
	 * ```js
	 * rehypePlugins: [ plugin1, plugin2 ]
	 * ```
	 * ```js
	 * rehypePlugins: [ [ plugin, options], [ plugin2, options2 ] ]
	 * ```
	 * ```js
	 * rehypePlugins: [ plugin, [ plugin2, options2 ] ]
	 * ```
	 */
	rehypePlugins?: Array<[Plugin, Settings] | Plugin>;
	/**
	 * **frontmatter** - an object of frontmatter options. {@link https://mdsvex.com/docs#frontmatter More details.}
	 *  - `parse` - a custom frontmatter parser.
	 *  - `type` - the name of your frontmatter language.
	 *  - `marker` - a character describing the fence to be used for frontmatter.
	 */
	frontmatter?: frontmatter_options;
	/**
	 * **smartypants** - smartypants transforms ASCII punctuation into fancy typography, this property configures it with an object of options. all are optional. It can be disabled by passing `false`. {@link https://mdsvex.com/docs#smartypants More details.}
	 *
	 * - `quotes` - converts stright quotes to curly quotes.
	 * - `ellipses` - converts three dots into an ellipsis.
	 * - `backticks` - converts backtick and stright quote combinations into curly quotes.
	 * - `dashes` - converts hyphens into en and em dashes.
	 */
	smartypants?: smartypants_options;
	/**
	 * **highlight** - Configures the syntax highlighting in mdsvex documents. Can be either `false` (to disable highlighting) or take an options object with following properties. {@link https://mdsvex.com/docs#highlight More details.}
	 *
	 * - `highlighter` - A custom highlight function.
	 * - `alias` - map language arbitrary names to standard language names
	 */
	highlight?: highlight | false;
	/**
	 * **extension** - the extension to use for mdsvex files. Default: `".svx"`. {@link https://mdsvex.com/docs#extension More details.}
	 *
	 *  *example:*
	 * ```js
	 * extension: ".svexy",
	 * ```
	 */
	extension?: string;
	/**
	 * **layout** - A string defining a single layout to use for everything or an object of named layouts. When using names layouts, a key of `_` will define the fallback layout. Default: `undefined` (no layouts). {@link https://mdsvex.com/docs#layouts More details.}
	 *
	 *  *examples:*
	 * ```js
	 * layout: "/path/to/layout.svelte"
	 * ```
	 * ```js
	 * layout: {
	 *   blog: "/path/to/layout/blog.svelte",
	 *   _: "/path/to/layout/default.svelte"
	 * }
	 * ```
	 */
	layout?: string | Record<string, string> | boolean;
};

type preprocessor_return = Promise<
	| {
			code: string;
			map?: string;
	  }
	| undefined
>;

type preprocessor = {
	markup: (args: { content: string; filename: string }) => preprocessor_return;
};

/**
 * The svelte preprocessor for use with svelte.preprocess
 *
 * **options** - An options object with the following properties, all are optional.
 *
 * - `extension` - The extension to use for mdsvex files
 * - `layout` - Layouts to apply to mdsvex documents
 * - `frontmatter` - frontmatter options for documents
 * - `highlight` - syntax highlighting options
 * - `smartypants` - smart typography options
 * - `remarkPlugins` - remark plugins to apply to the markdown
 * - `rehypePlugins` - rehype plugins to apply to the rendered html
 *
 */

export declare const mdsvex: (options?: mdsvex_options) => preprocessor;

/**
 * The standalone compile function.
 *
 * - **source** - the source code to convert.
 * - **options** - An options object with the following properties, all are optional.
 *
 *
 * - `extension` - The extension to use for mdsvex files
 * - `layout` - Layouts to apply to mdsvex documents
 * - `frontmatter` - frontmatter options for documents
 * - `highlight` - syntax highlighting options
 * - `smartypants` - smart typography options
 * - `remarkPlugins` - remark plugins to apply to the markdown
 * - `rehypePlugins` - rehype plugins to apply to the rendered html
 */

declare const compile: (
	source: string,
	opts: mdsvex_options & {
		/**
		 * **filename** - the name of the file, this is used mainly for logiing/ reporting purposes and doesn't have need to correspond to the _actual_ filename, nor does source even need to come from a real file. This is an optional field.
		 *
		 * *example:*
		 * ```js
		 * filename: "path.svx"
		 * ```
		 */
		filename?: string;
	}
) => preprocessor_return;
