<script lang="ts">
	import { get_repl_context } from '../context';
	import { BROWSER } from 'esm-env';
	import { onMount, untrack } from 'svelte';
	import Message from '../Message.svelte';
	import PaneWithPanel from './PaneWithPanel.svelte';
	import ReplProxy from './ReplProxy.js';
	import Console from './console/Console.svelte';
	import get_location_from_stack from './get_location_from_stack';
	import srcdoc from './srcdoc/index.html?raw';
	import srcdoc_styles from './srcdoc/styles.css?raw';
	import ErrorOverlay from './ErrorOverlay.svelte';
	import type { CompileError } from 'svelte/compiler';
	import type Bundler from '../bundler.svelte';
	import type { BundleResult } from '../types';
	import { Log } from './console/Log.svelte';

	interface Props {
		error: Error | null;
		/** status from the bundler */
		status: string | null;
		/** sandbox allow-same-origin */
		relaxed?: boolean;
		/** sandbox allow-popups-to-escape-sandbox, so links in the preview can open pages */
		can_escape?: boolean;
		/** extra js evaluated before each run */
		injected_js?: string;
		/** extra css added to the preview */
		injected_css?: string;
		theme: 'light' | 'dark';
		/** takes precedence over the bundler from context */
		bundler?: Bundler;
		/** called on every log, setting it hides the built in console */
		onlog?: ((logs: Log[]) => void) | undefined;
	}

	let {
		error = $bindable(),
		status,
		relaxed = false,
		can_escape = false,
		injected_js = '',
		injected_css = '',
		theme,
		bundler,
		onlog = undefined
	}: Props = $props();

	let context = get_repl_context();
	let bundle = $derived((bundler ?? context?.bundler)?.result);

	let logs: Log[] = $state([]);
	let log_group_stack: Log[][] = [];
	// svelte-ignore state_referenced_locally
	let current_log_group = logs;
	let last_console_event: Log;

	let iframe = $state.raw<HTMLIFrameElement>();
	let pending_imports = $state(0);
	let pending = false;

	let proxy: ReplProxy | null = $state.raw(null);
	let ready = $state(false);
	let inited = $state(false);

	onMount(() => {
		proxy = new ReplProxy(iframe!, {
			on_fetch_progress: (progress) => {
				pending_imports = progress;
			},
			on_error: (event) => {
				push_logs({ command: 'error', args: [event.value] });
			},
			on_unhandled_rejection: (event) => {
				let error = event.value;
				if (typeof error === 'string') error = { message: error };
				error.message = 'Uncaught (in promise): ' + error.message;
				push_logs({ command: 'error', args: [error] });
			},
			on_iframe_reload: () => {
				ready = false;
			},
			on_console: (log) => {
				switch (log.command) {
					case 'clear':
						clear_logs();
						push_logs(log);
						break;

					case 'group':
						group_logs(log);
						break;

					case 'groupEnd':
						ungroup_logs();
						break;

					case 'duplicate':
						increment_duplicate_log();
						break;

					default:
						push_logs(log);
				}
			}
		});

		iframe!.addEventListener('load', () => {
			proxy?.handle_links();
			ready = true;
		});

		return () => {
			proxy?.destroy();
		};
	});

	$effect(() => {
		if (ready) {
			proxy?.iframe_command('set_theme', { theme });
		}
	});

	async function apply_bundle(bundle: BundleResult | null) {
		if (!bundle) return;

		try {
			clear_logs();

			if (!bundle.error) {
				await proxy?.eval(
					`
					${injected_js}

					if (!window.__setup_focus_handling) {
						let can_focus = false;

						window.addEventListener('pointerdown', (e) => (can_focus = true));
						window.addEventListener('pointerup', (e) => (can_focus = false));
						window.addEventListener('keydown', (e) => (can_focus = true));
						window.addEventListener('keyup', (e) => (can_focus = false));

						// the iframe can steal focus in ways we cannot prevent, so the editor takes it back
						window.addEventListener('focusin', (e) => {
							// focus from a pointer or keyboard is a user choice
							if (can_focus) return;

							// focus moving to the body from somewhere is a navigation the user made
							if (e.target.tagName === 'BODY' && e.relatedTarget) return;

							// anything else hands focus back to the editor
							parent.postMessage({ type: 'iframe_took_focus' }, '*');
						});

						window.__setup_focus_handling = true;
					}

					{
						const styles = document.querySelectorAll('style[id^=svelte-]');

						let i = styles.length;
						while (i--) styles[i].parentNode.removeChild(styles[i]);

						if (window.__unmount_previous) {
							try {
								window.__unmount_previous();
							} catch (err) {
								console.error(err);
							}
						}
						window.__reset_custom_elements?.();

						document.body.innerHTML = '';
						window._svelteTransitionManager = null;
					}

					if (!window.__reset_custom_elements) {
						const registered = new Map();
						const define = CustomElementRegistry.prototype.define;
						CustomElementRegistry.prototype.define = function(name, el, options) {
							let ce = registered.get(name);
							if (ce) {
								if (ce.registered) {
									// defining it again surfaces the browser error
									define.call(this, name, ce.el, options);
								}
								if (ce.options?.extends != options?.extends) {
									parent.postMessage({ action: 'iframe_reload' }, '*');
									location.reload();
								}
								ce.el = el;
								ce.registered = true;
							} else {
								ce = { el, options, registered: true };
								registered.set(name, ce);
								const Wrapper = class extends el {
									connectedCallback() {
										ce.el.prototype.connectedCallback?.apply(this, arguments);
									}
									disconnectedCallback() {
										ce.el.prototype.disconnectedCallback?.apply(this, arguments);
									}
									adoptedCallback() {
										ce.el.prototype.adoptedCallback?.apply(this, arguments);
									}
								};
								const DynamicWrapper = new Proxy(Wrapper, {
									construct: function (_, args, newTarget) {
										return Reflect.construct(ce.el, args, newTarget);
									}
								});
								try {
									define.call(this, name, DynamicWrapper, options);
								} catch (error) {
									console.error(error);
									throw new Error('Failed to define a custom element '+name);
								}
							}
						};
						window.__reset_custom_elements = () => {
							for (const ce of registered.values()) {
								if (ce.registered) {
									ce.el = HTMLElement;
									ce.registered = false;
								}
							}
						}
					}

					const __repl_exports = ${bundle.client?.code};
					{
						const { mount, unmount, App, untrack } = __repl_exports;

						const console_methods = ['log', 'error', 'trace', 'assert', 'warn', 'table', 'group'];

						// untracking stops the console panel deep read from subscribing to state

						const original = {};

						for (const method of console_methods) {
							original[method] = console[method];
							console[method] = function (...v) {
								return untrack(() => original[method].apply(this, v));
							}
						}
						let component;
						try {
							component = mount(App, { target: document.body });
						} finally {
							window.__unmount_previous = () => {
								for (const method of console_methods) {
									console[method] = original[method];
								}
								if (component) unmount(component);
								window.__unmount_previous = null;
							}
						}
					}
					//# sourceURL=playground:output
				`,
					bundle?.css ?? srcdoc_styles
				);
				error = null;
			}
		} catch (e) {
			console.error(e);
			// @ts-ignore
			show_error(e);
		}

		inited = true;
	}

	$effect(() => {
		if (ready) {
			const b = bundle ?? null;

			untrack(() => {
				apply_bundle(b);
			});
		}
	});

	$effect(() => {
		if (injected_css && proxy && ready) {
			proxy.eval(
				`{
					const style = document.createElement('style');
					style.textContent = ${JSON.stringify(injected_css)};
					document.head.appendChild(style);
				}`
			);
		}
	});

	function show_error(e: CompileError & { loc: { line: number; column: number } }) {
		const map = bundle?.client?.map;

		// @ts-ignore INVESTIGATE
		const loc = map && get_location_from_stack(e.stack, map);
		if (loc) {
			e.filename = loc.source;
			e.loc = { line: loc.line, column: loc.column ?? 0 };
		}

		// @ts-ignore name is there, just not part of public API
		error = e;
	}

	function push_logs(data: any) {
		const log = new Log(data);
		current_log_group.push((last_console_event = log));
		onlog?.(logs);
	}

	function group_logs(data: any) {
		const log = new Log(data);
		current_log_group.push(log);
		log_group_stack.push(current_log_group);
		current_log_group = log.logs;
		onlog?.(logs);
	}

	function ungroup_logs() {
		const last = log_group_stack.pop();

		if (last) current_log_group = last;
	}

	function increment_duplicate_log() {
		last_console_event.count += 1;

		if (current_log_group.includes(last_console_event)) {
			onlog?.(logs);
		} else {
			// a cleared console no longer holds the event, so it is pushed again
			push_logs(last_console_event);
		}
	}

	function clear_logs() {
		current_log_group = logs = [];
		onlog?.(logs);
	}
</script>

{#snippet main()}
	<iframe
		title="Result"
		class:inited
		bind:this={iframe}
		sandbox={[
			'allow-scripts',
			'allow-popups',
			'allow-forms',
			'allow-pointer-lock',
			'allow-modals',
			can_escape ? 'allow-popups-to-escape-sandbox' : '',
			relaxed ? 'allow-same-origin' : ''
		].join(' ')}
		class={error || pending || pending_imports ? 'greyed-out' : ''}
		srcdoc={BROWSER ? srcdoc : ''}
	></iframe>

	<div class="overlay">
		{#if bundle?.error}
			<ErrorOverlay error={bundle.error} />
		{:else if error}
			<Message kind="error" details={error} />
		{:else if status || !bundle}
			<Message kind="info" truncate>{status || 'loading Svelte compiler...'}</Message>
		{/if}
	</div>
{/snippet}

<div class="iframe-container">
	{#if !onlog}
		<PaneWithPanel pos="100%" panel="Console" {main}>
			{#snippet header()}
				<button
					class="raised"
					disabled={logs.length === 0}
					onclick={(e) => {
						e.stopPropagation();
						clear_logs();
					}}
				>
					{#if logs.length > 0}
						({logs.length})
					{/if}
					Clear
				</button>
			{/snippet}

			{#snippet body()}
				<Console {logs} />
			{/snippet}
		</PaneWithPanel>
	{:else}
		{@render main()}
	{/if}
</div>

<style>
	.iframe-container {
		position: absolute;
		background-color: var(--repl-bg-1, white);
		border: none;
		width: 100%;
		height: 100%;
	}

	iframe {
		width: 100%;
		height: 100%;
		border: none;
		display: block;
	}

	.greyed-out {
		filter: grayscale(50%) blur(1px);
		opacity: 0.25;
	}

	button {
		font: var(--repl-font-ui-small);
		text-transform: uppercase;
		display: block;
		padding: 3px 8px;

		&:disabled {
			color: var(--repl-fg-4);
		}
	}

	.overlay {
		position: absolute;
		top: 0;
		width: 100%;
	}
</style>
