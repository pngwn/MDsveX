<script>
  import { getContext, onMount } from "svelte";
  import SplitPane from "../SplitPane.svelte";
  import Viewer from "./Viewer.svelte";
  import PaneWithPanel from "./PaneWithPanel.svelte";
  import CompilerOptions from "./CompilerOptions.svelte";
  import Compiler from "./Compiler.js";
  import CodeMirror from "../CodeMirror.svelte";
  import { is_browser } from "../env.js";

  const { register_output } = getContext("REPL");

  export let svelteUrl;
  export let workersUrl;
  export let status;
  export let sourceErrorLoc = null;
  export let runtimeError = null;
  export let embedded = false;
  export let relaxed = false;
  export let injectedJS;
  export let injectedCSS;
  export let funky = false;

  injectedCSS = `code[class*=language-],pre[class*=language-]{color:#657b83;font-family:Consolas,Monaco,'Andale Mono','Ubuntu Mono',monospace;font-size:0.9em;text-align:left;white-space:pre;word-spacing:normal;word-break:normal;word-wrap:normal;line-height:1.5;-moz-tab-size:4;-o-tab-size:4;tab-size:4;-webkit-hyphens:none;-moz-hyphens:none;-ms-hyphens:none;hyphens:none}code[class*=language-] ::-moz-selection,code[class*=language-]::-moz-selection,pre[class*=language-] ::-moz-selection,pre[class*=language-]::-moz-selection{background:#073642}code[class*=language-] ::selection,code[class*=language-]::selection,pre[class*=language-] ::selection,pre[class*=language-]::selection{background:#073642}pre[class*=language-]{padding:1em;margin:.5em 0;overflow:auto;border-radius:.3em}:not(pre)>code[class*=language-],pre[class*=language-]{background-color:#fdf6e3}:not(pre)>code[class*=language-]{padding:.1em;border-radius:.3em}.token.cdata,.token.comment,.token.doctype,.token.prolog{color:#93a1a1}.token.punctuation{color:#586e75}.token.namespace{opacity:.7}.token.boolean,.token.constant,.token.deleted,.token.number,.token.property,.token.symbol,.token.tag{color:#268bd2}.token.attr-name,.token.builtin,.token.char,.token.inserted,.token.selector,.token.string,.token.url{color:#2aa198}.token.entity{color:#657b83;background:#eee8d5}.token.atrule,.token.attr-value,.token.keyword{color:#859900}.token.class-name,.token.function{color:#b58900}.token.important,.token.regex,.token.variable{color:#cb4b16}.token.bold,.token.important{font-weight:700}.token.italic{font-style:italic}.token.entity{cursor:help}`;

  let foo; // TODO workaround for https://github.com/sveltejs/svelte/issues/2122

  register_output({
    set: async (selected, options) => {
      if (selected.type === "js") {
        js_editor.set(`/* Select a component to see its compiled code */`);
        css_editor.set(`/* Select a component to see its compiled code */`);
        return;
      }

      const compiled = await compiler.compile(selected, options);
      if (!js_editor) return; // unmounted

      js_editor.set(compiled.js, "js");
      css_editor.set(compiled.css, "css");
    },

    update: async (selected, options) => {
      if (selected.type === "js") return;

      const compiled = await compiler.compile(selected, options);
      if (!js_editor) return; // unmounted

      js_editor.update(compiled.js);
      css_editor.update(compiled.css);
    }
  });

  const compiler = is_browser && new Compiler(workersUrl, svelteUrl);

  // refs
  let viewer;
  let js_editor;
  let css_editor;
  const setters = {};

  let view = "result";
</script>

<style>
  .tab-content {
    position: absolute;
    width: 100%;
    height: 100% !important;
    opacity: 0;
    pointer-events: none;
  }

  .tab-content.visible {
    /* can't use visibility due to a weird painting bug in Chrome */
    opacity: 1;
    pointer-events: all;
  }
</style>

<div class="tab-content" class:visible={view === 'result'}>
  <Viewer
    {funky}
    bind:this={viewer}
    bind:error={runtimeError}
    {status}
    {relaxed}
    {injectedJS}
    {injectedCSS} />
</div>
