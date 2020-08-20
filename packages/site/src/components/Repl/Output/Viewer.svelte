<script>
  import { onMount, getContext } from "svelte";
  import getLocationFromStack from "./getLocationFromStack.js";
  import SplitPane from "../SplitPane.svelte";
  import PaneWithPanel from "./PaneWithPanel.svelte";
  import ReplProxy from "./ReplProxy.js";
  import Console from "./Console.svelte";
  import Message from "../Message.svelte";
  import srcdoc from "./srcdoc/index.js";

  const { bundle } = getContext("REPL");

  export let error; // TODO should this be exposed as a prop?
  let logs = [];

  export function setProp(prop, value) {
    if (!proxy) return;
    proxy.setProp(prop, value);
  }

  export let status;
  export let relaxed = false;
  export let injectedJS = "";
  export let injectedCSS = "";
  export let funky = false;

  let iframe;
  let pending_imports = 0;
  let pending = false;

  let proxy = null;

  let ready = false;
  let inited = false;

  let log_height = 90;
  let prev_height;

  let last_console_event;

  onMount(() => {
    proxy = new ReplProxy(iframe, {
      on_fetch_progress: (progress) => {
        pending_imports = progress;
      },
      on_error: (event) => {
        push_logs({ level: "error", args: [event.value] });
      },
      on_unhandled_rejection: (event) => {
        let error = event.value;
        if (typeof error === "string") error = { message: error };
        error.message = "Uncaught (in promise): " + error.message;
        push_logs({ level: "error", args: [error] });
      },
      on_console: (log) => {
        if (log.level === "clear") {
          logs = [log];
        } else if (log.duplicate) {
          const last_log = logs[logs.length - 1];

          if (last_log) {
            last_log.count = (last_log.count || 1) + 1;
            logs = logs;
          } else {
            last_console_event.count = 1;
            logs = [last_console_event];
          }
        } else {
          push_logs(log);
          last_console_event = log;
        }
      },
    });

    iframe.addEventListener("load", () => {
      proxy.handle_links();
      ready = true;
    });

    return () => {
      proxy.destroy();
    };
  });

  async function apply_bundle($bundle) {
    if (!$bundle || $bundle.error) return;

    try {
      clear_logs();

      await proxy.eval(`
				${injectedJS}

				${styles}

				const styles = document.querySelectorAll('style[id^=svelte-]');

				${$bundle.dom.code}

				let i = styles.length;
				while (i--) styles[i].parentNode.removeChild(styles[i]);

				if (window.component) {
					try {
						window.component.$destroy();
					} catch (err) {
						console.error(err);
					}
				}

				document.body.innerHTML = '';
				window.location.hash = '';
				window._svelteTransitionManager = null;

				window.component = new SvelteComponent.default({
					target: document.body
				});
			`);

      error = null;
    } catch (e) {
      show_error(e);
    }

    inited = true;
  }

  $: if (ready) apply_bundle($bundle);

  $: styles =
    injectedCSS &&
    `{
		const style = document.createElement('style');
		style.textContent = ${JSON.stringify(injectedCSS)};
		document.head.appendChild(style);
	}`;

  function show_error(e) {
    const loc = getLocationFromStack(e.stack, $bundle.dom.map);
    if (loc) {
      e.filename = loc.source;
      e.loc = { line: loc.line, column: loc.column };
    }

    error = e;
  }

  function push_logs(log) {
    logs = [...logs, log];
  }

  function on_toggle_console() {
    if (log_height < 90) {
      prev_height = log_height;
      log_height = 90;
    } else {
      log_height = prev_height || 45;
    }
  }

  function clear_logs() {
    logs = [];
  }
</script>

<style>
  .iframe-container {
    position: absolute;
    border: none;
    width: 100%;
    height: 100%;
    /* padding: 0 30px; */
  }

  iframe {
    width: 100%;
    height: 100%;
    height: calc(100vh);
    border: none;
    display: block;
    opacity: 0;
  }

  .inited {
    opacity: 1;
    height: 100%;
  }

  .greyed-out {
    filter: grayscale(50%) blur(1px);
    opacity: 0.25;
  }

  .overlay {
    position: absolute;
    bottom: 0;
    width: 100%;
  }
</style>

<div class="iframe-container">
  <div style="height: 100%">
    <iframe
      title="Result"
      class:inited
      bind:this={iframe}
      sandbox="allow-popups-to-escape-sandbox allow-scripts allow-popups
      allow-forms allow-pointer-lock allow-top-navigation allow-modals {relaxed ? 'allow-same-origin' : ''}"
      class={error || pending || pending_imports ? 'greyed-out' : ''}
      {srcdoc} />
  </div>

  <div class="overlay">
    {#if error}
      <Message kind="error" details={error} />
    {:else if status || !$bundle}
      <Message kind="info" truncate>
        {status || 'loading Svelte compiler...'}
      </Message>
    {/if}
  </div>
</div>
