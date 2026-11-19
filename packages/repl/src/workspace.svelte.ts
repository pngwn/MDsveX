import {
	Compartment,
	EditorState,
	StateEffect,
	StateField,
} from '@codemirror/state';
import { compile_file } from './compiler';
import type { Compiled, ExposedCompilerOptions } from './workers/workers';
import { BROWSER } from 'esm-env';
import { basicSetup, EditorView } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { svelte } from '@replit/codemirror-lang-svelte';
import { Decoration, keymap, type DecorationSet } from '@codemirror/view';
import { acceptCompletion } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { theme } from './theme';
import { untrack } from 'svelte';
import type { Diagnostic } from '@codemirror/lint';

export interface File {
	type: 'file';
	name: string;
	basename: string;
	contents: string;
	text: boolean;
}

export interface Directory {
	type: 'directory';
	name: string;
	basename: string;
}

export type Item = File | Directory;

export type { Compiled, ExposedCompilerOptions };

const CONFIG_FILE = 'mdsvex.config.json';
const DEFAULT_EXTENSIONS = ['.svx', '.md'];

function is_file(item: Item): item is File {
	return item.type === 'file';
}

/** the config is user input, a broken one falls back to the defaults */
function markdown_extensions(items: Item[]): string[] {
	const config = items.find((item) => item.name === CONFIG_FILE);
	if (!config || !is_file(config)) return DEFAULT_EXTENSIONS;
	try {
		const extensions = JSON.parse(config.contents).extensions;
		if (Array.isArray(extensions)) {
			return extensions.map((ext: string) =>
				ext.startsWith('.') ? ext : '.' + ext
			);
		}
	} catch {}
	return DEFAULT_EXTENSIONS;
}

function is_markdown_file(file: File, extensions: string[]) {
	return extensions.some((ext) => file.name.endsWith(ext));
}

function is_compiled(file: File, extensions: string[]) {
	return /\.svelte(\.|$)/.test(file.name) || is_markdown_file(file, extensions);
}

function file_type(file: Item) {
	return file.name.split('.').pop();
}

const set_highlight = StateEffect.define<{
	start: number;
	end: number;
} | null>();

const highlight_field = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(highlights, tr) {
		for (let effect of tr.effects) {
			if (effect.is(set_highlight)) {
				if (effect.value) {
					const { start, end } = effect.value;
					const deco = Decoration.mark({ class: 'highlight' }).range(
						start,
						end
					);
					return Decoration.set([deco]);
				} else {
					return Decoration.none;
				}
			}
		}
		// edits move the highlight with the text instead of dropping it
		return highlights.map(tr.changes);
	},
	provide: (field) => EditorView.decorations.from(field),
});

const tab_behaviour = new Compartment();
const vim_mode = new Compartment();

const default_extensions = [
	basicSetup,
	EditorState.tabSize.of(2),
	tab_behaviour.of(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
	indentUnit.of('\t'),
	theme,
	vim_mode.of([]),
	highlight_field,
];

export class Workspace {
	creating = $state.raw<{ parent: string; type: 'file' | 'directory' } | null>(
		null
	);
	modified = $state<Record<string, boolean>>({});

	#compiler_options = $state.raw<ExposedCompilerOptions>({
		generate: 'client',
		dev: false,
		// undefined drops the option for compilers that do not support it
		fragments: undefined,
		async: true,
	});
	compiled = $state<Record<string, Compiled>>({});

	#svelte_version = $state('');
	#readonly = false;
	#files = $state.raw<Item[]>([]);
	#current = $state.raw() as File;
	#vim = $state(false);
	supports_async = $state(true);

	#handlers = {
		hover: new Set<(pos: number | null) => void>(),
		select: new Set<(from: number, to: number) => void>(),
	};

	#onupdate: (file: File) => void;
	#onreset: (items: Item[]) => void | Promise<void>;

	states = new Map<string, EditorState>();
	#view: EditorView | null = null;

	diagnostics = $derived.by(() => {
		const diagnostics: Diagnostic[] = [];

		const error = this.current_compiled?.error;
		const warnings = this.current_compiled?.result?.warnings ?? [];

		if (error) {
			// legacy compilers may report no position range
			const from = error.position?.[0] ?? 0;
			const to = error.position?.[1] ?? from;

			diagnostics.push({
				severity: 'error',
				from,
				to,
				message: error.message,
				renderMessage: () => {
					let html = error.message
						.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(/`(.+?)`/g, `<code>$1</code>`);

					if (error.code) {
						html += ` (<a href="https://svelte.dev/docs/svelte/compiler-errors#${error.code}" target="_blank">${error.code}</a>)`;
					}

					const span = document.createElement('span');
					span.innerHTML = html;

					return span;
				},
			});
		}

		for (const warning of warnings) {
			diagnostics.push({
				severity: 'warning',
				from: warning.start!.character,
				to: warning.end!.character,
				message: warning.message,
				renderMessage: () => {
					const span = document.createElement('span');
					span.innerHTML = `${warning.message
						.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(
							/`(.+?)`/g,
							`<code>$1</code>`
						)} (<a href="https://svelte.dev/docs/svelte/compiler-warnings#${warning.code}" target="_blank">${warning.code}</a>)`;

					return span;
				},
			});
		}

		return diagnostics;
	});

	constructor(
		files: Item[],
		{
			svelte_version = 'latest',
			initial,
			readonly = false,
			onupdate,
			onreset,
		}: {
			svelte_version?: string;
			initial?: string;
			readonly?: boolean;
			onupdate?: (file: File) => void;
			onreset?: (items: Item[]) => void | Promise<void>;
		} = {}
	) {
		this.#svelte_version = svelte_version;
		this.#readonly = readonly;

		this.set(files, initial);

		this.#onupdate = onupdate ?? (() => {});
		this.#onreset = onreset ?? (() => {});

		this.#reset_diagnostics();
	}

	get files() {
		return this.#files;
	}

	get file_nodes(): File[] {
		return this.#files.filter(is_file);
	}

	get compiler_options() {
		return this.#compiler_options;
	}

	get current() {
		return this.#current;
	}

	get current_compiled() {
		if (this.#current.name in this.compiled) {
			return this.compiled[this.#current.name];
		}

		return null;
	}

	add(item: Item) {
		this.#create_directories(item);
		this.#files = this.#files.concat(item);

		if (is_file(item)) {
			this.#select(item);
			this.#onreset?.(this.#files);

			this.modified[item.name] = true;
		}

		return item;
	}

	disable_tab_indent() {
		this.#view?.dispatch({
			effects: tab_behaviour.reconfigure(
				keymap.of([{ key: 'Tab', run: acceptCompletion }])
			),
		});
	}

	enable_tab_indent() {
		this.#view?.dispatch({
			effects: tab_behaviour.reconfigure(
				keymap.of([{ key: 'Tab', run: acceptCompletion }, indentWithTab])
			),
		});
	}

	focus() {
		setTimeout(() => {
			this.#view?.focus();
		});
	}

	highlight_range(node: { start: number; end: number } | null, scroll = false) {
		if (!this.#view) return;

		const effects: StateEffect<any>[] = [set_highlight.of(node)];

		if (scroll && node) {
			effects.push(EditorView.scrollIntoView(node.start, { y: 'center' }));
		}

		this.#view.dispatch({
			effects,
		});
	}

	mark_saved() {
		this.modified = {};
	}

	async link(view: EditorView) {
		if (this.#view) throw new Error('view is already linked');
		this.#view = view;

		untrack(() => {
			view.setState(this.#get_state(untrack(() => this.#current)));

			try {
				this.vim = localStorage.getItem('vim') === 'true';
			} catch {
				// storage can be blocked, vim mode is only a preference
			}
		});
	}

	move(from: Item, to: Item) {
		const from_index = this.#files.indexOf(from);
		const to_index = this.#files.indexOf(to);

		this.#files.splice(from_index, 1);

		this.#files = this.#files
			.slice(0, to_index)
			.concat(from)
			.concat(this.#files.slice(to_index));
	}

	onhover(fn: (pos: number | null) => void) {
		$effect(() => {
			this.#handlers.hover.add(fn);

			return () => {
				this.#handlers.hover.delete(fn);
			};
		});
	}

	onselect(fn: (from: number, to: number) => void) {
		$effect(() => {
			this.#handlers.select.add(fn);

			return () => {
				this.#handlers.select.delete(fn);
			};
		});
	}

	remove(item: Item) {
		const index = this.#files.indexOf(item);

		if (index === -1) {
			throw new Error(
				'Tried to remove a file that does not exist in the workspace'
			);
		}

		let next = this.#current;

		if (next === item) {
			const file =
				this.#files.slice(0, index).findLast(is_file) ??
				this.#files.slice(index + 1).find(is_file);

			if (!file) {
				throw new Error('Cannot delete the only file');
			}

			next = file;
		}

		this.#files = this.#files.filter((f) => {
			if (f === item) return false;
			if (f.name.startsWith(item.name + '/')) return false;
			return true;
		});

		this.#select(next);

		this.#onreset?.(this.#files);
	}

	rename(previous: Item, name: string) {
		const index = this.files.indexOf(previous);
		const was_current = previous === this.#current;

		const state = this.states.get(previous.name);
		this.states.delete(previous.name);

		const new_item: Item = {
			...previous,
			name,
			basename: name.split('/').pop()!,
		};

		this.#create_directories(new_item);

		this.#files = this.#files.map((item, i) => {
			if (i === index) return new_item;

			if (
				previous.type === 'directory' &&
				item.name.startsWith(previous.name + '/')
			) {
				return {
					...item,
					name: item.name.replace(previous.name, name),
				};
			}

			return item;
		});

		// editor state survives a rename unless the language changes
		if (state && file_type(previous) === file_type(new_item)) {
			this.states.set(name, state);
		}

		if (was_current) {
			this.#select(new_item as File);
		}

		if (this.modified[previous.name]) {
			delete this.modified[previous.name];
			this.modified[name] = true;
		}

		this.#onreset?.(this.#files);
	}

	reset(new_files: Item[], selected?: string) {
		this.states.clear();

		const bundle = this.set(new_files, selected);

		this.mark_saved();

		const diagnostics = this.#reset_diagnostics();

		return Promise.all([bundle, diagnostics])
			.then(() => {})
			.catch(() => {});
	}

	select(name: string) {
		const file = this.#files.find(
			(file) => is_file(file) && file.name === name
		);

		if (!file) {
			throw new Error(`File ${name} does not exist in workspace`);
		}

		this.#select(file as File);
	}

	set(files: Item[], selected = this.#current?.name) {
		const first = files.find(is_file);

		if (!first) {
			throw new Error('Workspace must have at least one file');
		}

		const matching_file =
			selected && files.find((file) => is_file(file) && file.name === selected);
		if (matching_file) {
			this.#select(matching_file as File);
		} else {
			this.#select(first);
		}

		this.#files = files;

		for (const [name, state] of this.states) {
			const file = files.find((file) => file.name === name) as File;

			if (file) {
				this.#update_state(file, state);
			} else {
				this.states.delete(name);
			}
		}

		return this.#onreset?.(this.files);
	}

	unlink(view: EditorView) {
		if (this.#view !== view) throw new Error('Wrong editor view');
		this.#view = null;
	}

	update_compiler_options(options: Partial<ExposedCompilerOptions>) {
		this.#compiler_options = { ...this.#compiler_options, ...options };
		this.#reset_diagnostics();
		for (let file of this.#files) {
			if (is_file(file)) {
				this.#onupdate(file);
			}
		}
	}

	update_file(file: File) {
		this.#update_file(file);

		const state = this.states.get(file.name);
		if (state) {
			this.#update_state(file, state);
		}
	}

	get svelte_version() {
		return this.#svelte_version;
	}

	set_svelte_version(value: string, notify = false) {
		this.#svelte_version = value;
		if (notify) {
			this.#update_file(this.#current);
			this.#reset_diagnostics();
		}
	}

	get vim() {
		return this.#vim;
	}

	set vim(value) {
		this.#toggle_vim(value);
	}

	async #toggle_vim(value: boolean) {
		this.#vim = value;

		try {
			localStorage.setItem('vim', String(value));
		} catch {
			// storage can be blocked, vim mode is only a preference
		}

		// compartment.of returns an extension that records its compartment, codemirror does not type it
		let vim_extension_index = default_extensions.findIndex(
			(ext) => (ext as { compartment?: Compartment }).compartment === vim_mode
		);

		let extension: any = [];

		if (value) {
			const { vim } = await import('@replit/codemirror-vim');
			extension = vim();
		}

		default_extensions[vim_extension_index] = vim_mode.of(extension);

		this.#view?.dispatch({
			effects: vim_mode.reconfigure(extension),
		});

		for (const file of this.#files) {
			if (file.type !== 'file') continue;
			if (file === this.#current) continue;

			this.states.set(file.name, this.#create_state(file));
		}
	}

	#create_directories(item: Item) {
		const parts = item.name.split('/');

		while (parts.length > 1) {
			parts.pop();
			const joined = parts.join('/');

			if (this.files.find((file) => file.name === joined)) {
				return;
			}

			this.#files.push({
				type: 'directory',
				name: joined,
				basename: joined.split('/').pop()!,
			});
		}
	}

	#get_state(file: File) {
		return this.states.get(file.name) ?? this.#create_state(file);
	}

	#create_state(file: File) {
		const extensions = [
			...default_extensions,
			EditorState.readOnly.of(this.#readonly),
			EditorView.editable.of(!this.#readonly),
			EditorView.updateListener.of((update) => {
				const state = this.#view!.state!;

				if (update.docChanged) {
					this.#update_file({
						...this.#current,
						contents: state.doc.toString(),
					});

					// keeps undo history per file
					this.states.set(this.#current.name, state);
				}

				if (update.selectionSet) {
					if (state.selection.ranges.length === 1) {
						for (const handler of this.#handlers.select) {
							const { from, to } = state.selection.ranges[0];
							handler(from, to);
						}
					}
				}
			}),
			EditorView.domEventObservers({
				mousemove: (event, view) => {
					const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });

					if (pos !== null) {
						for (const handler of this.#handlers.hover) {
							handler(pos);
						}
					}
				},
				mouseleave: (event, view) => {
					for (const handler of this.#handlers.hover) {
						handler(null);
					}
				},
			}),
		];

		if (is_markdown_file(file, markdown_extensions(this.#files))) {
			extensions.push(markdown());
		}

		switch (file_type(file)) {
			case 'js':
				extensions.push(javascript());
				break;

			case 'json':
				extensions.push(json());
				break;

			case 'css':
				extensions.push(css());
				break;

			case 'ts':
				extensions.push(javascript({ typescript: true }));
				break;

			case 'html':
				extensions.push(html());
				break;

			case 'svelte':
				extensions.push(svelte());
				break;
		}

		const state = EditorState.create({
			doc: file.contents,
			extensions,
		});

		this.states.set(file.name, state);

		return state;
	}

	#reset_diagnostics() {
		if (!BROWSER) return;

		const keys = Object.keys(this.compiled);
		const seen: string[] = [];

		let files = this.#files;

		// the selected file compiles first so its diagnostics show soonest
		if (this.current) {
			const i = this.#files.indexOf(this.current!);
			files = [
				this.current,
				...this.#files.slice(0, i),
				...this.#files.slice(i + 1),
			];
		}

		const extensions = markdown_extensions(files);
		const all = this.file_nodes;

		const done = files.map((file) => {
			if (file.type !== 'file') return;
			if (!is_compiled(file, extensions)) return;

			seen.push(file.name);

			return compile_file(
				file,
				all,
				this.#svelte_version,
				this.compiler_options
			).then((compiled) => {
				this.compiled[file.name] = compiled;
			});
		});

		for (const key of keys) {
			if (!seen.includes(key)) {
				delete this.compiled[key];
			}
		}

		return Promise.all(done)
			.then(() => {})
			.catch(() => {});
	}

	#select(file: File) {
		this.#current = file as File;
		this.#view?.setState(this.#get_state(this.#current));
	}

	#update_file(file: File) {
		if (file.name === this.#current.name) {
			this.#current = file;
		}

		this.#files = this.#files.map((old) => {
			if (old.name === file.name) {
				return file;
			}
			return old;
		});

		this.modified[file.name] = true;

		if (BROWSER) {
			const extensions = markdown_extensions(this.#files);

			if (
				is_compiled(file, extensions) &&
				!is_markdown_file(file, extensions)
			) {
				this.#compile(file);
			}

			// markdown output depends on the config and templates, so every markdown file recompiles
			for (const other of this.file_nodes) {
				if (is_markdown_file(other, extensions)) this.#compile(other);
			}
		}

		this.#onupdate(file);
	}

	#compile(file: File) {
		compile_file(
			file,
			this.file_nodes,
			this.#svelte_version,
			this.compiler_options
		).then((compiled) => {
			this.compiled[file.name] = compiled;
		});
	}

	#update_state(file: File, state: EditorState) {
		const existing = state.doc.toString();

		if (file.contents !== existing) {
			const current_cursor_position = Math.min(
				this.#view?.state.selection.ranges[0].from!,
				file.contents.length
			);

			const transaction = state.update({
				changes: {
					from: 0,
					to: existing.length,
					insert: file.contents,
				},
				selection: {
					anchor: current_cursor_position,
					head: current_cursor_position,
				},
			});

			this.states.set(file.name, transaction.state);

			if (file === this.#current) {
				this.#view?.setState(transaction.state);
			}
		}
	}
}
