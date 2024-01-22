import { S as SvelteComponentDev, i as init, s as safe_not_equal, d as dispatch_dev, v as validate_slots, a as element, c as claim_element, b as children, f as detach_dev, h as attr_dev, j as add_location, k as insert_hydration_dev, n as noop, y as add_render_callback, V as create_slot, aj as stores$1, G as validate_store, H as component_subscribe, I as onMount, a3 as globals, r as append_hydration_dev, K as listen_dev, e as ensure_array_like_dev, p as space, q as claim_space, ag as get_svelte_dataset, g as set_style, a4 as toggle_class, m as destroy_each, t as text, w as claim_text, ah as null_to_empty, L as create_component, ak as HtmlTagHydration, U as head_selector, M as claim_component, al as claim_html_tag, N as mount_component, Z as update_slot_base, _ as get_all_dirty_from_scope, $ as get_slot_changes, O as transition_in, P as transition_out, Q as destroy_component, a5 as run_all, a0 as binding_callbacks, a6 as svg_element, a7 as claim_svg_element } from './client.05fefd69.js';
import { f as fade } from './index.214e2fce.js';

var docs = `<h1 id="mdsvex"><a aria-hidden="true" href="#mdsvex"><span class="icon icon-link"></span></a>mdsvex</h1>
<p>mdsvex is a markdown preprocessor for <a
  href="https://svelte.dev/"
  rel="nofollow"
>Svelte</a> components. Basically <a href="https://mdxjs.com/" rel="nofollow">MDX</a> for Svelte.</p>
<p>This preprocessor allows you to use Svelte components in your markdown, or markdown in your Svelte components.</p>
<p>mdsvex supports all Svelte syntax and <em>almost</em> all markdown syntax. See <a href="docs/#limitations">limitations</a> for more information.</p>
<p>You can do this:</p>
<pre class="language-svx">
<code class="language-svx"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
	<span class="token keyword">import</span> <span class="token punctuation">&#123;</span> Chart <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">"../components/Chart.svelte"</span><span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span>

<span class="token title important"><span class="token punctuation">#</span> Here’s a chart</span>

The chart is rendered inside our MDsveX document.

<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Chart</span> <span class="token punctuation">/></span></span></code>
</pre>
<p>It uses <a href="https://unifiedjs.com/" rel="nofollow">unified</a>, <a href="https://github.com/remarkjs" rel="nofollow">remark</a> and <a href="https://github.com/rehypejs/rehype" rel="nofollow">rehype</a> and you can use any <a
  href="https://github.com/remarkjs/remark/blob/main/doc/plugins.md#list-of-plugins"
  rel="nofollow"
>remark plugins</a> or <a
  href="https://github.com/rehypejs/rehype/blob/main/doc/plugins.md#list-of-plugins"
  rel="nofollow"
>rehype plugins</a> to enhance your experience.</p>
<p><a href="/playground">Try it</a></p>
<h2 id="install-it"><a aria-hidden="true" href="#install-it"><span class="icon icon-link"></span></a>Install it</h2>
<p>Install it as a dev-dependency.</p>
<p>With <code>npm</code>:</p>
<pre class="language-bash">
<code class="language-bash"><span class="token function">npm</span> i --save-dev mdsvex</code>
</pre>
<p>With <code>yarn</code>:</p>
<pre class="language-bash">
<code class="language-bash"><span class="token function">yarn</span> <span class="token function">add</span> --dev mdsvex</code>
</pre>
<h2 id="use-it"><a aria-hidden="true" href="#use-it"><span class="icon icon-link"></span></a>Use it</h2>
<p>There are two named exports from <code>mdsvex</code> that can be used to transform mdsvex documents, <code>mdsvex</code> and <code>compile</code>. <code>mdsvex</code> is a Svelte preprocessor and is the preferred way to use this library. The <code>compile</code> function is useful when you wish to compile mdsvex documents to Svelte components directly, without hooking into the Svelte compiler.</p>
<h3 id="mdsvex-1"><a aria-hidden="true" href="#mdsvex-1"><span class="icon icon-link"></span></a><code>mdsvex</code></h3>
<p>The <code>mdsvex</code> preprocessor function is a named import from the <code>mdsvex</code> module. Add it as a preprocessor to your rollup or webpack config, and tell the Svelte plugin or loader to also handle <code>.svx</code> files.</p>
<p>With rollup and <code>rollup-plugin-svelte</code>:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> <span class="token punctuation">&#123;</span> mdsvex <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">"mdsvex"</span><span class="token punctuation">;</span>

<span class="token keyword">export</span> <span class="token keyword">default</span> <span class="token punctuation">&#123;</span>
	<span class="token operator">...</span>boring_config_stuff<span class="token punctuation">,</span>
	plugins<span class="token operator">:</span> <span class="token punctuation">[</span>
		<span class="token function">svelte</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
			<span class="token comment">// these are the defaults. If you want to add more extensions, see https://mdsvex.pngwn.io/docs#extensions</span>
			extensions<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">".svelte"</span><span class="token punctuation">,</span> <span class="token string">".svx"</span><span class="token punctuation">]</span><span class="token punctuation">,</span>
			preprocess<span class="token operator">:</span> <span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">)</span>
		<span class="token punctuation">&#125;</span><span class="token punctuation">)</span>
	<span class="token punctuation">]</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">;</span></code>
</pre>
<p>With webpack and <code>svelte-loader</code>:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">const</span> <span class="token punctuation">&#123;</span> mdsvex <span class="token punctuation">&#125;</span> <span class="token operator">=</span> <span class="token function">require</span><span class="token punctuation">(</span><span class="token string">'mdsvex'</span><span class="token punctuation">)</span>

<span class="token comment">// add ".svx" to the extensions array</span>
<span class="token keyword">const</span> extensions <span class="token operator">=</span> <span class="token punctuation">[</span><span class="token string">'.mjs'</span><span class="token punctuation">,</span> <span class="token string">'.js'</span><span class="token punctuation">,</span> <span class="token string">'.json'</span><span class="token punctuation">,</span> <span class="token string">'.svelte'</span><span class="token punctuation">,</span> <span class="token string">'.html'</span><span class="token punctuation">,</span> <span class="token string">'.svx'</span><span class="token punctuation">]</span><span class="token punctuation">;</span>

module<span class="token punctuation">.</span>exports <span class="token operator">=</span> <span class="token punctuation">&#123;</span>
	<span class="token operator">...</span>boring_config_stuff<span class="token punctuation">,</span>
	resolve<span class="token operator">:</span> <span class="token punctuation">&#123;</span> alias<span class="token punctuation">,</span> extensions<span class="token punctuation">,</span> mainFields <span class="token punctuation">&#125;</span><span class="token punctuation">,</span>
	module<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		rules<span class="token operator">:</span> <span class="token punctuation">[</span>
			<span class="token punctuation">&#123;</span>
				<span class="token comment">// tell svelte-loader to handle svx files as well</span>
				test<span class="token operator">:</span> <span class="token regex">/\.(svelte|html|svx)$/</span><span class="token punctuation">,</span>
				use<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
					loader<span class="token operator">:</span> <span class="token string">'svelte-loader'</span><span class="token punctuation">,</span>
					options<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
						<span class="token operator">...</span>svelte_options<span class="token punctuation">,</span>
						preprocess<span class="token operator">:</span> <span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">)</span>
					<span class="token punctuation">&#125;</span>
				<span class="token punctuation">&#125;</span>
			<span class="token punctuation">&#125;</span>
		<span class="token punctuation">]</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">;</span></code>
</pre>
<p>If you want to use mdsvex without a bundler because you are your own person, then you can use <code>svelte.preprocess</code> directly:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">const</span> svelte <span class="token operator">=</span> <span class="token function">require</span><span class="token punctuation">(</span><span class="token string">'svelte/compiler'</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token keyword">const</span> <span class="token punctuation">&#123;</span> mdsvex <span class="token punctuation">&#125;</span> <span class="token operator">=</span> <span class="token function">require</span><span class="token punctuation">(</span><span class="token string">'mdsvex'</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// This will give you a valid svelte component</span>
<span class="token keyword">const</span> preprocessed <span class="token operator">=</span> <span class="token keyword">await</span> svelte<span class="token punctuation">.</span><span class="token function">preprocess</span><span class="token punctuation">(</span>
	source<span class="token punctuation">,</span>
	<span class="token function">mdsvex</span><span class="token punctuation">(</span>mdsvex_opts<span class="token punctuation">)</span>
<span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// Now you can compile it if you wish</span>
<span class="token keyword">const</span> compiled <span class="token operator">=</span> svelte<span class="token punctuation">.</span><span class="token function">compile</span><span class="token punctuation">(</span>
	preprocessed<span class="token punctuation">,</span>
	compiler_options
<span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<blockquote>
<p>If you don’t like the <code>.svx</code> file extension, fear not, it is easily customised.</p>
</blockquote>
<h3 id="compile"><a aria-hidden="true" href="#compile"><span class="icon icon-link"></span></a><code>compile</code></h3>
<p>This option performs a very similar task to the preprocessor but it can be used directly, without needing to hook into the Svelte compiler, either directly or via a bundler. The compile option will transform valid mdsvex code into valid svelte code, but it will perform no further actions such as resolving imports.</p>
<p>It supports all of the same options as the preprocessor although the function signature is slightly different. The first argument should be the mdsvex source code you wish to compile, the second argument is an object of options.</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> <span class="token punctuation">&#123;</span> compile <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">'mdsvex'</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> transformed_code <span class="token operator">=</span> <span class="token keyword">await</span> <span class="token function">compile</span><span class="token punctuation">(</span><span class="token template-string"><span class="token template-punctuation string">\`</span><span class="token string">
&lt;script>
  import Chart from './Chart.svelte';
&lt;/script>

# Hello friends

&lt;Chart />
</span><span class="token template-punctuation string">\`</span></span><span class="token punctuation">,</span>
	mdsvexOptions
<span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>In addition to the standard mdsvex options, the options object can also take an optional <code>filename</code> property which will be passed to mdsvex. There is no significant advantage to doing this but this provided filename may be used for error reporting in the future. The extension you give to this filename must match one of the extensions provided in the options (defaults to <code>['.svx']</code>).</p>
<h2 id="options"><a aria-hidden="true" href="#options"><span class="icon icon-link"></span></a>Options</h2>
<p>The preprocessor function accepts an object of options, that allow you to customise your experience. The options are global to all parsed files.</p>
<pre class="language-typescript">
<code class="language-typescript"><span class="token keyword">interface</span> <span class="token class-name">MdsvexOptions</span> <span class="token punctuation">&#123;</span>
	extensions<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">[</span><span class="token punctuation">]</span><span class="token punctuation">;</span>
	smartypants<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> smartypantsOptions<span class="token punctuation">;</span>
	layout<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token operator">|</span> <span class="token punctuation">&#123;</span> <span class="token punctuation">[</span>name<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">]</span><span class="token operator">:</span> <span class="token builtin">string</span> <span class="token punctuation">&#125;</span><span class="token punctuation">;</span>
	remarkPlugins<span class="token operator">:</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span>plugin<span class="token operator">></span> <span class="token operator">|</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span><span class="token punctuation">[</span>plugin<span class="token punctuation">,</span> plugin_options<span class="token punctuation">]</span><span class="token operator">></span><span class="token punctuation">;</span>
	rehypePlugins<span class="token operator">:</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span>plugin<span class="token operator">></span> <span class="token operator">|</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span><span class="token punctuation">[</span>plugin<span class="token punctuation">,</span> plugin_options<span class="token punctuation">]</span><span class="token operator">></span><span class="token punctuation">;</span>
	highlight<span class="token operator">:</span> <span class="token punctuation">&#123;</span> highlighter<span class="token operator">:</span> <span class="token builtin">Function</span><span class="token punctuation">,</span> alias<span class="token operator">:</span> <span class="token punctuation">&#123;</span> <span class="token punctuation">[</span>alias<span class="token punctuation">]</span><span class="token operator">:</span> lang <span class="token punctuation">&#125;</span> <span class="token punctuation">&#125;</span><span class="token punctuation">;</span>
	frontmatter<span class="token operator">:</span> <span class="token punctuation">&#123;</span> parse<span class="token operator">:</span> <span class="token builtin">Function</span><span class="token punctuation">;</span> marker<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token punctuation">&#125;</span><span class="token punctuation">;</span>
<span class="token punctuation">&#125;</span></code>
</pre>
<h3 id="extensions"><a aria-hidden="true" href="#extensions"><span class="icon icon-link"></span></a><code>extensions</code></h3>
<pre class="language-ts">
<code class="language-ts">extensions<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">[</span><span class="token punctuation">]</span> <span class="token operator">=</span> <span class="token punctuation">[</span><span class="token string">".svx"</span><span class="token punctuation">]</span><span class="token punctuation">;</span></code>
</pre>
<p>The <code>extensions</code> option allows you to set custom file extensions for files written in mdsvex; the default value is <code>['.svx']</code>. Whatever value you choose here must be passed to the <code>extensions</code> field of <code>rollup-plugin-svelte</code> or <code>svelte-loader</code>. If you do not change the default, you must still pass the extension name to the plugin or loader config.</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">export</span> <span class="token keyword">default</span> <span class="token punctuation">&#123;</span>
	<span class="token operator">...</span>config<span class="token punctuation">,</span>
	plugins<span class="token operator">:</span> <span class="token punctuation">[</span>
		<span class="token function">svelte</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
			extensions<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">".svelte"</span><span class="token punctuation">,</span> <span class="token string">".custom"</span><span class="token punctuation">]</span><span class="token punctuation">,</span>
			preprocess<span class="token operator">:</span> <span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
				extensions<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">".custom"</span><span class="token punctuation">]</span>
			<span class="token punctuation">&#125;</span><span class="token punctuation">)</span>
		<span class="token punctuation">&#125;</span><span class="token punctuation">)</span>
	<span class="token punctuation">]</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">;</span></code>
</pre>
<p>To import markdown files as components, add <code>.md</code> to both the Svelte compiler and <code>mdsvex</code> extensions:</p>
<pre class="language-js">
<code class="language-js"><span class="token comment">// svelte.config.js</span>
<span class="token keyword">import</span> <span class="token punctuation">&#123;</span> mdsvex <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">'mdsvex'</span>

<span class="token keyword">export</span> <span class="token keyword">default</span> <span class="token punctuation">&#123;</span>
  extensions<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">'.svelte'</span><span class="token punctuation">,</span> <span class="token string">'.svx'</span><span class="token punctuation">,</span> <span class="token string">'.md'</span><span class="token punctuation">]</span><span class="token punctuation">,</span>
  preprocess<span class="token operator">:</span> <span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span> extensions<span class="token operator">:</span> <span class="token punctuation">[</span><span class="token string">'.svx'</span><span class="token punctuation">,</span> <span class="token string">'.md'</span><span class="token punctuation">]</span> <span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">,</span>
<span class="token punctuation">&#125;</span></code>
</pre>
<p>Then you can do:</p>
<pre class="language-svx">
<code class="language-svx"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">import</span> Readme <span class="token keyword">from</span> <span class="token string">'../readme.md'</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span>

<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Readme</span> <span class="token punctuation">/></span></span></code>
</pre>
<h3 id="smartypants"><a aria-hidden="true" href="#smartypants"><span class="icon icon-link"></span></a><code>smartypants</code></h3>
<pre class="language-ts">
<code class="language-ts">smartypants<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> <span class="token punctuation">&#123;</span>
	quotes<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span>
	ellipses<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span>
	backticks<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> <span class="token string">'all'</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span>
	dashes<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> <span class="token string">'oldschool'</span> <span class="token operator">|</span> <span class="token string">'inverted'</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span>
<span class="token punctuation">&#125;</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span></code>
</pre>
<p>The <code>smartypants</code> option transforms ASCII punctuation into fancy typographic punctuation HTML entities.</p>
<p>It turns stuff like:</p>
<pre class="language-md">
<code class="language-md">"They said it was free..."</code>
</pre>
<p>into:</p>
<blockquote>
<p>“They said it was free…”</p>
</blockquote>
<p>Notice the beautiful punctuation. It does other nice things.</p>
<p><code>smartypants</code> can be either a <code>boolean</code> (pass <code>false</code> to disable it) or an options object (defaults to <code>true</code>). The possible options are as follows.</p>
<pre class="language-sig">
<code class="language-sig">quotes<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span></code>
</pre>
<p>Converts straight double and single quotes to smart double or single quotes.</p>
<ul>
<li><code>"words"</code> <strong>becomes</strong>: “words”</li>
<li><code>'words'</code> <strong>becomes</strong> ‘words’</li>
</ul>
<pre class="language-sig">
<code class="language-sig">ellipses<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span></code>
</pre>
<p>Converts triple-dot characters (with or without spaces) into a single Unicode ellipsis character.</p>
<ul>
<li><code>words...</code> <strong>becomes</strong> words…</li>
</ul>
<pre class="language-sig">
<code class="language-sig">backticks<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> <span class="token string">'all'</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span></code>
</pre>
<p>When <code>true</code>, converts double back-ticks into an opening double quote, and double straight single quotes into a closing double quote.</p>
<ul>
<li><code>\`\`words''</code> <strong>becomes</strong> “words”</li>
</ul>
<p>When <code>'all'</code> it also converts single back-ticks into a single opening quote, and a single straight quote into a closing single, smart quote.</p>
<p>Note: Quotes can not be <code>true</code> when backticks is <code>'all'</code>;</p>
<pre class="language-sig">
<code class="language-sig">dashes<span class="token operator">:</span> <span class="token builtin">boolean</span> <span class="token operator">|</span> <span class="token string">'oldschool'</span> <span class="token operator">|</span> <span class="token string">'inverted'</span> <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span></code>
</pre>
<p>When <code>true</code>, converts two dashes into an em-dash character.</p>
<ul>
<li><code>--</code> <strong>becomes</strong> —</li>
</ul>
<p>When <code>'oldschool'</code>, converts two dashes into an en-dash, and three dashes into an em-dash.</p>
<ul>
<li><code>--</code> <strong>becomes</strong> –</li>
<li><code>---</code> <strong>becomes</strong> —</li>
</ul>
<p>When <code>'inverted'</code>, converts two dashes into an em-dash, and three dashes into an en-dash.</p>
<ul>
<li><code>--</code> <strong>becomes</strong> —</li>
<li><code>---</code> <strong>becomes</strong> –</li>
</ul>
<h3 id="layout"><a aria-hidden="true" href="#layout"><span class="icon icon-link"></span></a><code>layout</code></h3>
<pre class="language-ts">
<code class="language-ts">layout<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token operator">|</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span><span class="token builtin">string</span> <span class="token operator">|</span> RegExp<span class="token punctuation">,</span> <span class="token builtin">string</span><span class="token operator">></span><span class="token punctuation">;</span></code>
</pre>
<p>The <code>layout</code> option allows you to provide a custom layout component that will wrap your mdsvex file like so:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Layout</span><span class="token punctuation">></span></span>
 <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>MdsvexDocument</span> <span class="token punctuation">/></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Layout</span><span class="token punctuation">></span></span></code>
</pre>
<blockquote>
<p>Layout components receive all frontmatter values as props, which should provide a great deal of flexibility when designing your layouts.</p>
</blockquote>
<p>You can provide a <code>string</code>, which should be the path to your layout component. An absolute path is preferred but mdsvex tries to resolve relative paths based upon the current working directory.</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> <span class="token punctuation">&#123;</span> join <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">"path"</span><span class="token punctuation">;</span>

<span class="token keyword">const</span> path_to_layout <span class="token operator">=</span> <span class="token function">join</span><span class="token punctuation">(</span>__dirname<span class="token punctuation">,</span> <span class="token string">"./src/Layout.svelte"</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	layout<span class="token operator">:</span> path_to_layout
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>In some cases you may want different layouts for different types of document, to address this you may pass an object of named layouts instead. Each key should be a name for your layout, the value should be a path as described above. A fallback layout, or default, can be passed using <code>_</code> (underscore) as a key name.</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	layout<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		blog<span class="token operator">:</span> <span class="token string">"./path/to/blog/layout.svelte"</span><span class="token punctuation">,</span>
		article<span class="token operator">:</span> <span class="token string">"./path/to/article/layout.svelte"</span><span class="token punctuation">,</span>
		_<span class="token operator">:</span> <span class="token string">"./path/to/fallback/layout.svelte"</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<h3 id="remarkplugins--rehypeplugins"><a aria-hidden="true" href="#remarkplugins--rehypeplugins"><span class="icon icon-link"></span></a><code>remarkPlugins</code> / <code>rehypePlugins</code></h3>
<pre class="language-ts">
<code class="language-ts">remarkPlugins<span class="token operator">:</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span>plugin<span class="token operator">></span> <span class="token operator">|</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span><span class="token punctuation">[</span>plugin<span class="token punctuation">,</span> plugin_options<span class="token punctuation">]</span><span class="token operator">></span><span class="token punctuation">;</span>
rehypePlugins<span class="token operator">:</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span>plugin<span class="token operator">></span> <span class="token operator">|</span> <span class="token builtin">Array</span><span class="token operator">&lt;</span><span class="token punctuation">[</span>plugin<span class="token punctuation">,</span> plugin_options<span class="token punctuation">]</span><span class="token operator">></span><span class="token punctuation">;</span></code>
</pre>
<p>mdsvex has a simple pipeline. Your source file is first parsed into a Markdown AST (MDAST), this is where remark plugins would run. Then it is converted into an HTML AST (HAST), this is where rehype plugins would be run. After this it is converted (stringified) into a valid Svelte component ready to be compiled.</p>
<p><a href="https://github.com/remarkjs" rel="nofollow">remark</a> and <a href="https://github.com/rehypejs/rehype" rel="nofollow">rehype</a> have a vibrant plugin ecosystem and mdsvex allows you to pass any <a
  href="https://github.com/remarkjs/remark/blob/main/doc/plugins.md#list-of-plugins"
  rel="nofollow"
>remark plugins</a> or <a
  href="https://github.com/rehypejs/rehype/blob/main/doc/plugins.md#list-of-plugins"
  rel="nofollow"
>rehype plugins</a> as options, which will run on the remark and rehype ASTs at the correct point in the pipeline.</p>
<p>These options take an array. If you do not wish to pass any options to a plugin then you can simply pass an array of plugins like so:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> containers <span class="token keyword">from</span> <span class="token string">"remark-containers"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> github <span class="token keyword">from</span> <span class="token string">"remark-github"</span><span class="token punctuation">;</span>

<span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	remarkPlugins<span class="token operator">:</span> <span class="token punctuation">[</span>containers<span class="token punctuation">,</span> github<span class="token punctuation">]</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>If you <em>do</em> wish to pass options to your plugins then those array items should be an array of <code>[plugin, options]</code>, like so:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> containers <span class="token keyword">from</span> <span class="token string">"remark-containers"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> github <span class="token keyword">from</span> <span class="token string">"remark-github"</span><span class="token punctuation">;</span>

<span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	remarkPlugins<span class="token operator">:</span> <span class="token punctuation">[</span>
		<span class="token punctuation">[</span>containers<span class="token punctuation">,</span> container_opts<span class="token punctuation">]</span><span class="token punctuation">,</span>
		<span class="token punctuation">[</span>github<span class="token punctuation">,</span> github_opts<span class="token punctuation">]</span>
	<span class="token punctuation">]</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>You can mix and match as needed, only providing an array when options are needed:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> containers <span class="token keyword">from</span> <span class="token string">"remark-containers"</span><span class="token punctuation">;</span>
<span class="token keyword">import</span> github <span class="token keyword">from</span> <span class="token string">"remark-github"</span><span class="token punctuation">;</span>

<span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	remarkPlugins<span class="token operator">:</span> <span class="token punctuation">[</span>
		<span class="token punctuation">[</span>containers<span class="token punctuation">,</span> container_opts<span class="token punctuation">]</span><span class="token punctuation">,</span>
		github<span class="token punctuation">,</span>
		another_plugin<span class="token punctuation">,</span>
		<span class="token punctuation">[</span>yet_another_plugin<span class="token punctuation">,</span> more_options<span class="token punctuation">]</span>
	<span class="token punctuation">]</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>While these examples use <code>remarkPlugins</code>, the <code>rehypePlugins</code> option works in exactly the same way. You are free to use one or both of these options as you wish.</p>
<p>Remark plugins work on the Markdown AST (MDAST) produced by remark, rehype plugins work on the HTML AST (HAST) produced by rehype and it is possible to write your own custom plugins if the existing ones do not satisfy your needs!</p>
<h3 id="highlight"><a aria-hidden="true" href="#highlight"><span class="icon icon-link"></span></a><code>highlight</code></h3>
<pre class="language-ts">
<code class="language-ts">highlight<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
	<span class="token function-variable function">highlighter</span><span class="token operator">:</span> <span class="token punctuation">(</span>code<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">,</span> lang<span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">)</span> <span class="token operator">=></span> <span class="token builtin">string</span> <span class="token operator">|</span> <span class="token builtin">Promise</span><span class="token operator">&lt;</span><span class="token builtin">string</span><span class="token operator">></span>
	alias<span class="token operator">:</span> <span class="token punctuation">&#123;</span> <span class="token punctuation">[</span>lang <span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">]</span><span class="token operator">:</span> <span class="token builtin">string</span> <span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">;</span></code>
</pre>
<p>Without any configuration, mdsvex will automatically highlight the syntax of over 100 languages using <a
  href="https://prismjs.com/"
  rel="nofollow"
>PrismJS</a>, you simply need to add the language name to the fenced code block and import the CSS file for a Prism theme of your choosing. See <a
  href="https://github.com/PrismJS/prism-themes"
  rel="nofollow"
>here for available options</a>. Languages are loaded on-demand and cached for later use, this feature does not unnecessarily load all languages for highlighting purposes.</p>
<p>Custom aliases for language names can be defined via the <code>alias</code> property of the highlight option. This property takes an object of key-value pairs: the key should be the alias you wish to define, the value should be the language you wish to assign it to.</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	highlight<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		alias<span class="token operator">:</span> <span class="token punctuation">&#123;</span> yavascript<span class="token operator">:</span> <span class="token string">"javascript"</span> <span class="token punctuation">&#125;</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span></code>
</pre>
<p>If you wish to handle syntax-highlighting yourself, you can provide a custom highlight function via the <code>highlighter</code> property.  The function will receive two arguments, the <code>code</code> to be highlighted and the <code>lang</code> defined in the fenced code-block, both are strings. You can use this information to highlight as you wish. The function should return a string of highlighted code.</p>
<p>You can disable syntax highlighting by passing a function that does nothing:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">function</span> <span class="token function">highlighter</span><span class="token punctuation">(</span><span class="token parameter">code<span class="token punctuation">,</span> lang</span><span class="token punctuation">)</span> <span class="token punctuation">&#123;</span>
	<span class="token keyword">return</span> <span class="token template-string"><span class="token template-punctuation string">\`</span><span class="token string">&lt;pre>&lt;code></span><span class="token interpolation"><span class="token interpolation-punctuation punctuation">$&#123;</span>code<span class="token interpolation-punctuation punctuation">&#125;</span></span><span class="token string">&lt;/code>&lt;/pre></span><span class="token template-punctuation string">\`</span></span><span class="token punctuation">;</span>
<span class="token punctuation">&#125;</span>

<span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	highlight<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		highlighter
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span></code>
</pre>
<h3 id="frontmatter"><a aria-hidden="true" href="#frontmatter"><span class="icon icon-link"></span></a><code>frontmatter</code></h3>
<pre class="language-ts">
<code class="language-ts">frontmatter<span class="token operator">:</span> <span class="token punctuation">&#123;</span> parse<span class="token operator">:</span> <span class="token builtin">Function</span><span class="token punctuation">,</span> marker<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token punctuation">&#125;</span><span class="token punctuation">;</span></code>
</pre>
<p>By default mdsvex supports yaml frontmatter, this is defined by enclosing the YAML in three hyphens (<code>---</code>). If you want to use a custom language or marker for frontmatter then you can use the <code>frontmatter</code> option.</p>
<p><code>frontmatter</code> should be an object that can contain a <code>marker</code> and a <code>parse</code> property.</p>
<pre class="language-sig">
<code class="language-sig">marker<span class="token operator">:</span> <span class="token builtin">string</span> <span class="token operator">=</span> <span class="token string">'-'</span><span class="token punctuation">;</span></code>
</pre>
<p>The marker option defines the fence for your frontmatter. This defaults to <code>-</code> which corresponds to the standard triple-hyphen syntax (<code>---</code>) that you would normally use to define frontmatter. You can pass in a custom string to change this behaviour:</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	frontmatter<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		marker<span class="token operator">:</span> <span class="token string">"+"</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>Now you can use <code>+++</code> to mark frontmatter. Setting <em>only</em> the marker will keep the default frontmatter parser which only supports YAML.</p>
<pre class="language-sig">
<code class="language-sig"><span class="token function-variable function">parse</span><span class="token operator">:</span> <span class="token punctuation">(</span>frontmatter<span class="token punctuation">,</span> message<span class="token punctuation">)</span> <span class="token operator">=></span> Object <span class="token operator">|</span> <span class="token keyword">undefined</span></code>
</pre>
<p>The <code>parse</code> property accepts a function which allows you to provide a custom parser for frontmatter. This is useful if you want to use a different language in your frontmatter.</p>
<p>The parse function gets the raw frontmatter as the first argument and a <code>messages</code> array as the second.</p>
<p>If parsing is successful, the function should return the parsed frontmatter (as an object of key-value pairs), if there is a problem the function should return <code>undefined</code> or <code>false</code> . Any parsing errors or warnings should be pushed into the <code>messages</code> array which will be printed to the console when mdsvex has finished parsing. If you would prefer to throw an error, you are free to do so but it will interrupt the parsing process.</p>
<p>In the following example, we will modify the frontmatter handling so we can write our frontmatter in TOML with a triple-<code>+</code> fence.</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	marker<span class="token operator">:</span> <span class="token string">"+"</span><span class="token punctuation">,</span>
	<span class="token function">parse</span><span class="token punctuation">(</span><span class="token parameter">frontmatter<span class="token punctuation">,</span> messages</span><span class="token punctuation">)</span> <span class="token punctuation">&#123;</span>
		<span class="token keyword">try</span> <span class="token punctuation">&#123;</span>
			<span class="token keyword">return</span> toml<span class="token punctuation">.</span><span class="token function">parse</span><span class="token punctuation">(</span>frontmatter<span class="token punctuation">)</span><span class="token punctuation">;</span>
		<span class="token punctuation">&#125;</span> <span class="token keyword">catch</span> <span class="token punctuation">(</span>e<span class="token punctuation">)</span> <span class="token punctuation">&#123;</span>
			messages<span class="token punctuation">.</span><span class="token function">push</span><span class="token punctuation">(</span>
				<span class="token string">"Parsing error on line "</span> <span class="token operator">+</span>
					e<span class="token punctuation">.</span>line <span class="token operator">+</span>
					<span class="token string">", column "</span> <span class="token operator">+</span>
					e<span class="token punctuation">.</span>column <span class="token operator">+</span>
					<span class="token string">": "</span> <span class="token operator">+</span>
					e<span class="token punctuation">.</span>message
			<span class="token punctuation">)</span><span class="token punctuation">;</span>
		<span class="token punctuation">&#125;</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>Now we will be able to write TOML frontmatter:</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token frontmatter-toml"><span class="token punctuation">+++
</span><span class="token language-toml"><span class="token key property">title</span> <span class="token punctuation">=</span> <span class="token string">"TOML Example"</span>

<span class="token punctuation">[</span><span class="token table class-name">owner</span><span class="token punctuation">]</span>
<span class="token key property">name</span> <span class="token punctuation">=</span> <span class="token string">"some name"</span>
<span class="token key property">dob</span> <span class="token punctuation">=</span> <span class="token date number">1879-05-27T07:32:00-08:00</span>
</span><span class="token punctuation">+++</span></span></code>
</pre>
<h2 id="layouts"><a aria-hidden="true" href="#layouts"><span class="icon icon-link"></span></a>Layouts</h2>
<p>Layouts are one of the more powerful features available in mdsvex and allow for a great deal of flexibility. At their simplest a layout is just a component that wraps an mdsvex document. Providing a string as the layout option will enable this behaviour:</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	layout<span class="token operator">:</span> <span class="token string">"./path/to/layout.svelte"</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>Layouts receive all values defined in frontmatter as props:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Layout</span> <span class="token language-javascript"><span class="token punctuation">&#123;</span><span class="token operator">...</span>props<span class="token punctuation">&#125;</span></span> <span class="token punctuation">></span></span>
  <span class="token comment">&lt;!-- mdsvex content here --></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Layout</span><span class="token punctuation">></span></span></code>
</pre>
<p>You can then use these values in your layout however you wish, a typical use might be to define some fancy formatting for headings, authors, and dates. Although you could do all kinds of wonderful things. You just need to make sure you provide a default <code>slot</code> so the mdsvex content can be passed into your layout and rendered.</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">export</span> <span class="token keyword">let</span> title<span class="token punctuation">;</span>
  <span class="token keyword">export</span> <span class="token keyword">let</span> author<span class="token punctuation">;</span>
  <span class="token keyword">export</span> <span class="token keyword">let</span> date<span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span>

<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>h1</span><span class="token punctuation">></span></span><span class="token language-javascript"><span class="token punctuation">&#123;</span> title <span class="token punctuation">&#125;</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>h1</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>p</span> <span class="token attr-name">class</span><span class="token attr-value"><span class="token punctuation">=</span><span class="token punctuation">"</span>date<span class="token punctuation">"</span></span><span class="token punctuation">></span></span>on: <span class="token language-javascript"><span class="token punctuation">&#123;</span> date <span class="token punctuation">&#125;</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>p</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>p</span> <span class="token attr-name">class</span><span class="token attr-value"><span class="token punctuation">=</span><span class="token punctuation">"</span>date<span class="token punctuation">"</span></span><span class="token punctuation">></span></span>by: <span class="token language-javascript"><span class="token punctuation">&#123;</span> author <span class="token punctuation">&#125;</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>p</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>slot</span><span class="token punctuation">></span></span>
  <span class="token comment">&lt;!-- the mdsvex content will be slotted in here --></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>slot</span><span class="token punctuation">></span></span></code>
</pre>
<h3 id="named-layouts"><a aria-hidden="true" href="#named-layouts"><span class="icon icon-link"></span></a>Named Layouts</h3>
<p>In some cases you may want different layouts for different types of document. To address this you can pass an object of named layouts instead. Each key should be a name for your layout, the value should be the path to that layout file. A fallback layout, or default, can be passed using <code>_</code> (underscore) as a key name.</p>
<pre class="language-js">
<code class="language-js"><span class="token function">mdsvex</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
	layout<span class="token operator">:</span> <span class="token punctuation">&#123;</span>
		blog<span class="token operator">:</span> <span class="token string">"./path/to/blog/layout.svelte"</span><span class="token punctuation">,</span>
		article<span class="token operator">:</span> <span class="token string">"./path/to/article/layout.svelte"</span><span class="token punctuation">,</span>
		_<span class="token operator">:</span> <span class="token string">"./path/to/fallback/layout.svelte"</span>
	<span class="token punctuation">&#125;</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span><span class="token punctuation">;</span></code>
</pre>
<p>If you pass an object of named layouts, you can decide which layout to use on a file-by-file basis by declaring it in the frontmatter. For example, if you wanted to force a document to be wrapped with the <code>blog</code> layout you would do the following:</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">layout</span><span class="token punctuation">:</span> blog
</span><span class="token punctuation">---</span></span></code>
</pre>
<p>If you are using named layouts and do not have a layout field in the frontmatter then mdsvex will try to pick the correct one based on the folder a file is stored in. Take the following folder structure:</p>
<pre class="language-null">
<code class="language-">.
├── blog
│   └── my-blog-post.svx
└── article
    └── my-article.svx</code>
</pre>
<p>If there is a layout named <code>blog</code> and <code>article</code> then documents in the <code>blog</code> folder will use the <code>blog</code> layout, articles in the <code>articles</code> folder will use the <code>article</code> layout. mdsvex will try to check both singular and pluralised names, as you may have named a folder <code>events</code> but the matching layout could be named <code>event</code>, however, having the same folder and layout name will make this process more reliable. The current working directory is removed from the path when checking for matches but nested folders can still cause problems if there are conflicts. Shallow folder structures and unique folder and layout names will prevent these kinds of collisions.</p>
<p>If there is no matching layout then the fallback layout (<code>_</code>) will be applied, if there is no fallback then no layout will be applied.</p>
<h3 id="disabling-layouts"><a aria-hidden="true" href="#disabling-layouts"><span class="icon icon-link"></span></a>disabling layouts</h3>
<p>If you are using layouts but wish to disable them for a specific component, then you can set the <code>layout</code> field to <code>false</code> to prevent the application of a layout.</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">layout</span><span class="token punctuation">:</span> <span class="token boolean important">false</span>
</span><span class="token punctuation">---</span></span></code>
</pre>
<h3 id="custom-components"><a aria-hidden="true" href="#custom-components"><span class="icon icon-link"></span></a>Custom Components</h3>
<p>Layouts also allow you to provide custom components to any mdsvex file they are applied to. Custom components replace the elements that markdown would normally generate.</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token title important"><span class="token punctuation">#</span> Title</span>

Some text

<span class="token list punctuation">-</span> a
<span class="token list punctuation">-</span> short
<span class="token list punctuation">-</span> list</code>
</pre>
<p>Would normally compile to:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>h1</span><span class="token punctuation">></span></span>Title<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>h1</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>p</span><span class="token punctuation">></span></span>Some text<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>p</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>ul</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>li</span><span class="token punctuation">></span></span>a<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>li</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>li</span><span class="token punctuation">></span></span>short<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>li</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>li</span><span class="token punctuation">></span></span>list<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>li</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>ul</span><span class="token punctuation">></span></span></code>
</pre>
<p>Custom components allow you to replace these elements with components. You can define components by exporting named exports from the <code>context="module"</code> script of your Layout file:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span> <span class="token attr-name">context</span><span class="token attr-value"><span class="token punctuation">=</span><span class="token punctuation">"</span>module<span class="token punctuation">"</span></span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">import</span> <span class="token punctuation">&#123;</span> h1<span class="token punctuation">,</span> p<span class="token punctuation">,</span> li <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">'./components.js'</span><span class="token punctuation">;</span>
  <span class="token keyword">export</span> <span class="token punctuation">&#123;</span> h1<span class="token punctuation">,</span> p<span class="token punctuation">,</span> li <span class="token punctuation">&#125;</span><span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span></code>
</pre>
<p>The named exports must be named after the actual element you want to replace (<code>p</code>, <code>blockquote</code>, etc.), the value must be the component you wish to replace them with. This makes certain named exports ‘protected’ API, make sure you don’t use html names as export names for other values. Named exports whose names do not correspond to an HTML element will be ignored, so feel free to continue using them for other purposes as well. As these are named exports it is possible for the bundler to treeshake unused custom components, even if they are exported.</p>
<p>The above custom components would generate:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">import</span> <span class="token operator">*</span> <span class="token keyword">as</span> Components <span class="token keyword">from</span> <span class="token string">'./Layout.svelte'</span><span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span>

<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Components.h1</span><span class="token punctuation">></span></span>Title<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Components.h1</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Components.p</span><span class="token punctuation">></span></span>Some text<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Components.p</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>ul</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Components.li</span><span class="token punctuation">></span></span>a<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Components.li</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Components.li</span><span class="token punctuation">></span></span>short<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Components.li</span><span class="token punctuation">></span></span>
  <span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>Components.li</span><span class="token punctuation">></span></span>list<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>Components.li</span><span class="token punctuation">></span></span>
<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>ul</span><span class="token punctuation">></span></span></code>
</pre>
<p>Notice that the <code>ul</code> is left intact: elements are replaced <em>after</em> the markdown is parsed to HTML. This allows greater flexibility, for example, when using custom components to customise lists, tables or other markdown that compiles to a combination of different HTML elements.</p>
<p>You may also receive attributes of the normal HTML component. For example, to render a custom <code>&lt;img&gt;</code> tag you could do:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">export</span> <span class="token keyword">let</span> src<span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span>

<span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>img</span> <span class="token attr-name">src=</span><span class="token language-javascript"><span class="token punctuation">&#123;</span>src<span class="token punctuation">&#125;</span></span> <span class="token punctuation">/></span></span></code>
</pre>
<h2 id="frontmatter-1"><a aria-hidden="true" href="#frontmatter-1"><span class="icon icon-link"></span></a>Frontmatter</h2>
<p>YAML frontmatter is a common convention in blog posts and mdsvex supports it out of the box. If you want to use a custom language or marker for frontmatter than you can use the <a
  href="docs#frontmatter"
><code>frontmatter</code></a> option to modify the default behaviour.</p>
<p>Mdsvex integrates well with frontmatter providing additional flexibility when authoring documents.</p>
<p>All variables defined in frontmatter are available directly in the component, exactly as you wrote them:</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">title</span><span class="token punctuation">:</span> My lovely article
<span class="token key atrule">author</span><span class="token punctuation">:</span> Dr. Fabuloso the Fabulous
</span><span class="token punctuation">---</span></span>

<span class="token title important"><span class="token punctuation">#</span> <span class="token language-javascript"><span class="token punctuation">&#123;</span>title<span class="token punctuation">&#125;</span></span> by <span class="token language-javascript"><span class="token punctuation">&#123;</span>author<span class="token punctuation">&#125;</span></span></span>

Some amazing content.</code>
</pre>
<p>Additionally, all of these variables are exported as a single object named <code>metadata</code> from the <code>context="module"</code> script, so they can easily be imported in javascript:</p>
<pre class="language-svelte">
<code class="language-svelte"><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;</span>script</span> <span class="token attr-name">context</span><span class="token attr-value"><span class="token punctuation">=</span><span class="token punctuation">"</span>module<span class="token punctuation">"</span></span><span class="token punctuation">></span></span><span class="token script"><span class="token language-javascript">
  <span class="token keyword">export</span> <span class="token keyword">let</span> metadata <span class="token operator">=</span> <span class="token punctuation">&#123;</span>
    title<span class="token operator">:</span> <span class="token string">"My lovely article"</span><span class="token punctuation">,</span>
    author<span class="token operator">:</span> <span class="token string">"Dr. Fabuloso the Fabulous"</span>
  <span class="token punctuation">&#125;</span><span class="token punctuation">;</span>
</span></span><span class="token tag"><span class="token tag"><span class="token punctuation">&lt;/</span>script</span><span class="token punctuation">></span></span></code>
</pre>
<p>Due to how <code>context="module"</code> scripts work, this metadata can be imported like this:</p>
<pre class="language-js">
<code class="language-js"><span class="token keyword">import</span> <span class="token punctuation">&#123;</span> metadata <span class="token punctuation">&#125;</span> <span class="token keyword">from</span> <span class="token string">"./some-mdsvex-file.svx"</span><span class="token punctuation">;</span></code>
</pre>
<p>Frontmatter also interacts with layouts, you can find more details in the <a
  href="docs#layouts"
>Layout section</a>.</p>
<h2 id="integrations"><a aria-hidden="true" href="#integrations"><span class="icon icon-link"></span></a>Integrations</h2>
<h3 id="with-sapper"><a aria-hidden="true" href="#with-sapper"><span class="icon icon-link"></span></a>With Sapper</h3>
<p>To use mdsvex with sapper you need to add the mdsvex configuration to both the client and server sections of the rollup or webpack configuration. You will also need to add the CLI argument <code>--ext '.svelte .svx'</code> to all of the sapper scripts (<code>dev</code>, <code>build</code>, and <code>export</code>) in order to tell sapper that it should also allow <code>.svx</code> files to be page routes.</p>
<p>Or you can use the templates:</p>
<ul>
<li>
<p><a href="https://github.com/pngwn/sapper-mdsvex-template" rel="nofollow">Rollup</a></p>
<pre class="language-bash">
<code class="language-bash">npx degit <span class="token string">"pngwn/sapper-mdsvex-template"</span> my-app</code>
</pre>
</li>
<li>
<p><a
  href="https://github.com/shiryel/sapper-mdsvex-template-webpack"
  rel="nofollow"
>Webpack</a></p>
<pre class="language-bash">
<code class="language-bash">npx degit <span class="token string">"shiryel/sapper-mdsvex-template-webpack"</span> my-app</code>
</pre>
</li>
</ul>
<h2 id="limitations"><a aria-hidden="true" href="#limitations"><span class="icon icon-link"></span></a>Limitations</h2>
<h3 id="indentation"><a aria-hidden="true" href="#indentation"><span class="icon icon-link"></span></a>Indentation</h3>
<p>In markdown you can begin a code block by indenting 4 spaces. This doesn’t work in mdsvex as indentation is common with XML-based languages. Indenting 4 spaces will do nothing.</p>
<p>In general you have a lot more flexibility when it comes to indenting code in mdsvex than you do in markdown because of the above change, however, you need to be very careful when indenting fenced code blocks. By which I mean, don’t do it.</p>
<p>The following code block will break in a way that is both very bad and quite unexpected:</p>
<pre class="language-mdsvex">
<code class="language-mdsvex">		\`\`\`js
					console.log('Hello, World!')
		\`\`\`</code>
</pre>
<p>The solution is to not do this. When working with fenced code blocks, do not indent them. This isn’t an issue that can really be worked around, even if the parser did make assumptions about what you meant. Because code blocks are designed to respect whitespace, any fix would simply result in a different but equally frustrating failure. Don’t indent code blocks.</p>`;

var cheatsheet = `<div class="container">
  <div class="box install">
    <h2><a href="docs#install-it">Install</a></h2>
<p>Quick installation instructions.</p>
<pre class="language-bash">
<code class="language-bash"><span class="token function">npm</span> i -D mdsvex</code>
</pre>
<pre class="language-bash">
<code class="language-bash"><span class="token function">yarn</span> <span class="token function">add</span> --dev mdsvex</code>
</pre>
  </div>
  <div class="box use">
    <h2><a href="docs#use-it">Use</a></h2>
<p>Add mdsvex to your project</p>
<pre class="language-js">
<code class="language-js"><span class="token function">svelte</span><span class="token punctuation">(</span><span class="token punctuation">&#123;</span>
  extensions<span class="token operator">:</span> <span class="token punctuation">[</span>
    <span class="token string">'.svelte'</span><span class="token punctuation">,</span>
    <span class="token string">'.svx'</span>
  <span class="token punctuation">]</span><span class="token punctuation">,</span>
  preprocess<span class="token operator">:</span> <span class="token function">mdsvex</span><span class="token punctuation">(</span>config<span class="token punctuation">)</span>
<span class="token punctuation">&#125;</span><span class="token punctuation">)</span></code>
</pre>
  </div>
  <div class="box config">
    <h2><a href="/docs#options">Configure</a></h2>
    <dl>
      <dt>
        <a href="docs#extensions"><span>extensions</span></a>
      </dt>
      <dd>use custom extensions</dd>
      <dt>
        <a href="docs#smartypants"><span>smartypants</a></span>
      </dt>
      <dd>fancy typography</dd>
      <dt>
        <a href="docs#layout"><span>layout</span></a>
      </dt>
      <dd>custom layouts</dd>
      <dt>
        <a href="docs#remarkplugins--rehypeplugins"><span>remarkPlugins</span></a>
      </dt>
      <dd>use remark plugins</dd>
      <dt>
        <a href="docs#remarkplugins--rehypeplugins"><span>rehypePlugins</span></a>
      </dt>
      <dd>use rehype plugins</dd>
      <dt>
        <a href="docs#highlight"><span>highlight</span></a>
      </dt>
      <dd>syntax highlighting</dd>
      <dt>
        <a href="docs#frontmatter"><span>frontmatter</span></a>
      </dt>
      <dd>change frontmatter language</dd>
    </dl>
  </div>
  <div class="box layouts">
    <h2><a href="docs#layouts">Layouts</a></h2>
<p>Custom layouts for mdsvex documents.</p>
<h3><a href="docs#named-layouts">named layouts</a></h3>
<p>Reference layouts by name.</p>
<pre class="language-svx">
<code class="language-svx"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">layout</span><span class="token punctuation">:</span> blog
</span><span class="token punctuation">---</span></span></code>
</pre>
<h3><a href="docs#disabling-layouts">disabling layouts</a></h3>
<p>Disable named layouts when needed.</p>
<pre class="language-svx">
<code class="language-svx"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">layout</span><span class="token punctuation">:</span> <span class="token boolean important">false</span>
</span><span class="token punctuation">---</span></span></code>
</pre>
<h3><a href="docs#custom-components">custom components</a></h3>
<p class="keep">Replace HTML elements with custom components.</p>
  </div>
  <div class="box frontmatter">
    <h2><a href="docs#frontmatter-1">Frontmatter</a></h2>
<p>Use frontmatter values directly in markdown.</p>
<pre class="language-mdsvex">
<code class="language-mdsvex"><span class="token frontmatter"><span class="token punctuation">---
</span><span class="token language-yaml"><span class="token key atrule">title</span><span class="token punctuation">:</span> Fabuloso
</span><span class="token punctuation">---</span></span>

<span class="token title important"><span class="token punctuation">#</span> <span class="token language-javascript"><span class="token punctuation">&#123;</span>title<span class="token punctuation">&#125;</span></span></span></code>
</pre>
  </div>
  <div class="box integrations">
    <h2><a href="docs#integrations">Integrations</a></h2>
    <p class="keep">Using mdsvex with other things</p>
  </div>
</div>`;

/* src/components/Cheatsheet.svx generated by Svelte v4.0.0 */
const file$1 = "src/components/Cheatsheet.svx";

function create_fragment$1(ctx) {
	let div;

	const block = {
		c: function create() {
			div = element("div");
			this.h();
		},
		l: function claim(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			div_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(div, "class", "cheatsheet svelte-177ikrt");
			add_location(div, file$1, 247, 0, 4683);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, div, anchor);
			div.innerHTML = cheatsheet;
		},
		p: noop,
		i: noop,
		o: noop,
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(div);
			}
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment$1.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance$1($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('Cheatsheet', slots, []);
	const writable_props = [];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Cheatsheet> was created with unknown prop '${key}'`);
	});

	$$self.$capture_state = () => ({ cheatsheet });
	return [];
}

class Cheatsheet extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Cheatsheet",
			options,
			id: create_fragment$1.name
		});
	}
}

/* src/routes/docs.svelte generated by Svelte v4.0.0 */

const { console: console_1, document: document_1, window: window_1 } = globals;
const file = "src/routes/docs.svelte";

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[20] = list[i][0];
	child_ctx[21] = list[i][1];
	child_ctx[22] = list[i][2];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[25] = list[i][0];
	child_ctx[26] = list[i][1];
	child_ctx[27] = list[i][2];
	return child_ctx;
}

// (438:0) {#if width < 1100}
function create_if_block_3(ctx) {
	let span1;
	let span0;
	let mounted;
	let dispose;

	function select_block_type(ctx, dirty) {
		if (!/*menu_show*/ ctx[5]) return create_if_block_4;
		return create_else_block_1;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type(ctx);

	const block = {
		c: function create() {
			span1 = element("span");
			span0 = element("span");
			if_block.c();
			this.h();
		},
		l: function claim(nodes) {
			span1 = claim_element(nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			span0 = claim_element(span1_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			if_block.l(span0_nodes);
			span0_nodes.forEach(detach_dev);
			span1_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(span0, "class", "icon svelte-t254dh");
			add_location(span0, file, 439, 2, 7883);
			attr_dev(span1, "class", "menu svelte-t254dh");
			add_location(span1, file, 438, 1, 7819);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, span1, anchor);
			append_hydration_dev(span1, span0);
			if_block.m(span0, null);

			if (!mounted) {
				dispose = listen_dev(span1, "click", /*click_handler*/ ctx[12], false, false, false, false);
				mounted = true;
			}
		},
		p: function update(ctx, dirty) {
			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(span0, null);
				}
			}
		},
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(span1);
			}

			if_block.d();
			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_3.name,
		type: "if",
		source: "(438:0) {#if width < 1100}",
		ctx
	});

	return block;
}

// (461:3) {:else}
function create_else_block_1(ctx) {
	let svg;
	let path;

	const block = {
		c: function create() {
			svg = svg_element("svg");
			path = svg_element("path");
			this.h();
		},
		l: function claim(nodes) {
			svg = claim_svg_element(nodes, "svg", {
				"aria-hidden": true,
				focusable: true,
				"data-prefix": true,
				"data-icon": true,
				class: true,
				role: true,
				xmlns: true,
				viewBox: true
			});

			var svg_nodes = children(svg);
			path = claim_svg_element(svg_nodes, "path", { fill: true, d: true });
			children(path).forEach(detach_dev);
			svg_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(path, "fill", "currentColor");
			attr_dev(path, "d", "M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19\n\t\t\t\t\t\t0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28\n\t\t\t\t\t\t75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28\n\t\t\t\t\t\t12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28\n\t\t\t\t\t\t32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176\n\t\t\t\t\t\t322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48\n\t\t\t\t\t\t0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z");
			add_location(path, file, 470, 5, 8838);
			attr_dev(svg, "aria-hidden", "true");
			attr_dev(svg, "focusable", "false");
			attr_dev(svg, "data-prefix", "fas");
			attr_dev(svg, "data-icon", "times");
			attr_dev(svg, "class", "svg-inline--fa fa-times fa-w-11 svelte-t254dh");
			attr_dev(svg, "role", "img");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "viewBox", "0 0 352 512");
			add_location(svg, file, 461, 4, 8606);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, svg, anchor);
			append_hydration_dev(svg, path);
		},
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(svg);
			}
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_else_block_1.name,
		type: "else",
		source: "(461:3) {:else}",
		ctx
	});

	return block;
}

// (441:3) {#if !menu_show}
function create_if_block_4(ctx) {
	let svg;
	let path;

	const block = {
		c: function create() {
			svg = svg_element("svg");
			path = svg_element("path");
			this.h();
		},
		l: function claim(nodes) {
			svg = claim_svg_element(nodes, "svg", {
				"aria-hidden": true,
				focusable: true,
				"data-prefix": true,
				"data-icon": true,
				class: true,
				role: true,
				xmlns: true,
				viewBox: true
			});

			var svg_nodes = children(svg);
			path = claim_svg_element(svg_nodes, "path", { fill: true, d: true });
			children(path).forEach(detach_dev);
			svg_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(path, "fill", "currentColor");
			attr_dev(path, "d", "M16 132h416c8.837 0 16-7.163\n\t\t\t\t\t\t16-16V76c0-8.837-7.163-16-16-16H16C7.163 60 0 67.163 0 76v40c0 8.837\n\t\t\t\t\t\t7.163 16 16 16zm0 160h416c8.837 0 16-7.163\n\t\t\t\t\t\t16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0\n\t\t\t\t\t\t8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163\n\t\t\t\t\t\t16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0\n\t\t\t\t\t\t8.837 7.163 16 16 16z");
			add_location(path, file, 450, 5, 8157);
			attr_dev(svg, "aria-hidden", "true");
			attr_dev(svg, "focusable", "false");
			attr_dev(svg, "data-prefix", "fas");
			attr_dev(svg, "data-icon", "bars");
			attr_dev(svg, "class", "svg-inline--fa fa-bars fa-w-14 svelte-t254dh");
			attr_dev(svg, "role", "img");
			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr_dev(svg, "viewBox", "0 0 448 512");
			add_location(svg, file, 441, 4, 7927);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, svg, anchor);
			append_hydration_dev(svg, path);
		},
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(svg);
			}
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_4.name,
		type: "if",
		source: "(441:3) {#if !menu_show}",
		ctx
	});

	return block;
}

// (490:2) {#if position}
function create_if_block(ctx) {
	let nav_1;
	let ul;
	let t0;
	let li0;
	let a0;
	let textContent = "playground";
	let t2;
	let li1;
	let a1;
	let textContent_1 = "github";
	let each_value = ensure_array_like_dev(/*nav*/ ctx[7]);
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	const block = {
		c: function create() {
			nav_1 = element("nav");
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t0 = space();
			li0 = element("li");
			a0 = element("a");
			a0.textContent = textContent;
			t2 = space();
			li1 = element("li");
			a1 = element("a");
			a1.textContent = textContent_1;
			this.h();
		},
		l: function claim(nodes) {
			nav_1 = claim_element(nodes, "NAV", { style: true, class: true });
			var nav_1_nodes = children(nav_1);
			ul = claim_element(nav_1_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul_nodes);
			}

			t0 = claim_space(ul_nodes);
			li0 = claim_element(ul_nodes, "LI", { class: true });
			var li0_nodes = children(li0);

			a0 = claim_element(li0_nodes, "A", {
				href: true,
				class: true,
				["data-svelte-h"]: true
			});

			if (get_svelte_dataset(a0) !== "svelte-p4pm7v") a0.textContent = textContent;
			li0_nodes.forEach(detach_dev);
			t2 = claim_space(ul_nodes);
			li1 = claim_element(ul_nodes, "LI", { class: true });
			var li1_nodes = children(li1);

			a1 = claim_element(li1_nodes, "A", {
				href: true,
				class: true,
				["data-svelte-h"]: true
			});

			if (get_svelte_dataset(a1) !== "svelte-1i55q3i") a1.textContent = textContent_1;
			li1_nodes.forEach(detach_dev);
			ul_nodes.forEach(detach_dev);
			nav_1_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(a0, "href", "/playground");
			attr_dev(a0, "class", "svelte-t254dh");
			add_location(a0, file, 527, 6, 10457);
			attr_dev(li0, "class", "mini svelte-t254dh");
			add_location(li0, file, 526, 5, 10433);
			attr_dev(a1, "href", "https://www.github.com/pngwn/mdsvex");
			attr_dev(a1, "class", "svelte-t254dh");
			add_location(a1, file, 530, 6, 10534);
			attr_dev(li1, "class", "mini svelte-t254dh");
			add_location(li1, file, 529, 5, 10510);
			attr_dev(ul, "class", "svelte-t254dh");
			add_location(ul, file, 491, 4, 9516);
			set_style(nav_1, "position", /*position*/ ctx[4]);
			attr_dev(nav_1, "class", "svelte-t254dh");
			toggle_class(nav_1, "menu_show", /*menu_show*/ ctx[5]);
			add_location(nav_1, file, 490, 3, 9460);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, nav_1, anchor);
			append_hydration_dev(nav_1, ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul, null);
				}
			}

			append_hydration_dev(ul, t0);
			append_hydration_dev(ul, li0);
			append_hydration_dev(li0, a0);
			append_hydration_dev(ul, t2);
			append_hydration_dev(ul, li1);
			append_hydration_dev(li1, a1);
		},
		p: function update(ctx, dirty) {
			if (dirty & /*nav, current, menu_show*/ 168) {
				each_value = ensure_array_like_dev(/*nav*/ ctx[7]);
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul, t0);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (dirty & /*position*/ 16) {
				set_style(nav_1, "position", /*position*/ ctx[4]);
			}

			if (dirty & /*menu_show*/ 32) {
				toggle_class(nav_1, "menu_show", /*menu_show*/ ctx[5]);
			}
		},
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(nav_1);
			}

			destroy_each(each_blocks, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block.name,
		type: "if",
		source: "(490:2) {#if position}",
		ctx
	});

	return block;
}

// (502:7) {#if children}
function create_if_block_1(ctx) {
	let ul;
	let each_value_1 = ensure_array_like_dev(/*children*/ ctx[22]);
	let each_blocks = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	const block = {
		c: function create() {
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l: function claim(nodes) {
			ul = claim_element(nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(ul, "class", "svelte-t254dh");
			add_location(ul, file, 502, 8, 9801);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, ul, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul, null);
				}
			}
		},
		p: function update(ctx, dirty) {
			if (dirty & /*nav, current, menu_show*/ 168) {
				each_value_1 = ensure_array_like_dev(/*children*/ ctx[22]);
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_1.length;
			}
		},
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(ul);
			}

			destroy_each(each_blocks, detaching);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_1.name,
		type: "if",
		source: "(502:7) {#if children}",
		ctx
	});

	return block;
}

// (513:11) {:else}
function create_else_block(ctx) {
	let a;
	let t_value = /*child_title*/ ctx[25] + "";
	let t;
	let mounted;
	let dispose;

	const block = {
		c: function create() {
			a = element("a");
			t = text(t_value);
			this.h();
		},
		l: function claim(nodes) {
			a = claim_element(nodes, "A", { href: true, class: true });
			var a_nodes = children(a);
			t = claim_text(a_nodes, t_value);
			a_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(a, "href", /*child_link*/ ctx[26]);
			attr_dev(a, "class", "svelte-t254dh");
			toggle_class(a, "active", /*current*/ ctx[3] === /*child_link*/ ctx[26]);
			add_location(a, file, 513, 12, 10146);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, a, anchor);
			append_hydration_dev(a, t);

			if (!mounted) {
				dispose = listen_dev(a, "click", /*click_handler_3*/ ctx[15], false, false, false, false);
				mounted = true;
			}
		},
		p: function update(ctx, dirty) {
			if (dirty & /*current, nav*/ 136) {
				toggle_class(a, "active", /*current*/ ctx[3] === /*child_link*/ ctx[26]);
			}
		},
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(a);
			}

			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_else_block.name,
		type: "else",
		source: "(513:11) {:else}",
		ctx
	});

	return block;
}

// (506:11) {#if is_code}
function create_if_block_2(ctx) {
	let a;
	let code;
	let t_value = /*child_title*/ ctx[25] + "";
	let t;
	let mounted;
	let dispose;

	const block = {
		c: function create() {
			a = element("a");
			code = element("code");
			t = text(t_value);
			this.h();
		},
		l: function claim(nodes) {
			a = claim_element(nodes, "A", { href: true, class: true });
			var a_nodes = children(a);
			code = claim_element(a_nodes, "CODE", { class: true });
			var code_nodes = children(code);
			t = claim_text(code_nodes, t_value);
			code_nodes.forEach(detach_dev);
			a_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(code, "class", "svelte-t254dh");
			add_location(code, file, 510, 13, 10071);
			attr_dev(a, "href", /*child_link*/ ctx[26]);
			attr_dev(a, "class", "svelte-t254dh");
			toggle_class(a, "active", /*current*/ ctx[3] === /*child_link*/ ctx[26]);
			add_location(a, file, 506, 12, 9922);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, a, anchor);
			append_hydration_dev(a, code);
			append_hydration_dev(code, t);

			if (!mounted) {
				dispose = listen_dev(a, "click", /*click_handler_2*/ ctx[14], false, false, false, false);
				mounted = true;
			}
		},
		p: function update(ctx, dirty) {
			if (dirty & /*current, nav*/ 136) {
				toggle_class(a, "active", /*current*/ ctx[3] === /*child_link*/ ctx[26]);
			}
		},
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(a);
			}

			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_if_block_2.name,
		type: "if",
		source: "(506:11) {#if is_code}",
		ctx
	});

	return block;
}

// (504:9) {#each children as [child_title, child_link, is_code]}
function create_each_block_1(ctx) {
	let li;

	function select_block_type_1(ctx, dirty) {
		if (/*is_code*/ ctx[27]) return create_if_block_2;
		return create_else_block;
	}

	let current_block_type = select_block_type_1(ctx);
	let if_block = current_block_type(ctx);

	const block = {
		c: function create() {
			li = element("li");
			if_block.c();
			this.h();
		},
		l: function claim(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			if_block.l(li_nodes);
			li_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(li, "class", "svelte-t254dh");
			add_location(li, file, 504, 10, 9880);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, li, anchor);
			if_block.m(li, null);
		},
		p: function update(ctx, dirty) {
			if_block.p(ctx, dirty);
		},
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(li);
			}

			if_block.d();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block_1.name,
		type: "each",
		source: "(504:9) {#each children as [child_title, child_link, is_code]}",
		ctx
	});

	return block;
}

// (494:5) {#each nav as [title, href, children]}
function create_each_block(ctx) {
	let li;
	let a;
	let t0_value = /*title*/ ctx[20] + "";
	let t0;
	let t1;
	let mounted;
	let dispose;

	function click_handler_1() {
		return /*click_handler_1*/ ctx[13](/*href*/ ctx[21]);
	}

	let if_block = /*children*/ ctx[22] && create_if_block_1(ctx);

	const block = {
		c: function create() {
			li = element("li");
			a = element("a");
			t0 = text(t0_value);
			t1 = space();
			if (if_block) if_block.c();
			this.h();
		},
		l: function claim(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			a = claim_element(li_nodes, "A", { href: true, class: true });
			var a_nodes = children(a);
			t0 = claim_text(a_nodes, t0_value);
			a_nodes.forEach(detach_dev);
			t1 = claim_space(li_nodes);
			if (if_block) if_block.l(li_nodes);
			li_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			attr_dev(a, "href", /*href*/ ctx[21]);
			attr_dev(a, "class", "svelte-t254dh");
			toggle_class(a, "active", /*current*/ ctx[3] === /*href*/ ctx[21]);
			add_location(a, file, 495, 7, 9619);
			attr_dev(li, "class", "" + (null_to_empty(/*children*/ ctx[22] ? 'solo' : 'solo') + " svelte-t254dh"));
			add_location(li, file, 494, 6, 9572);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, li, anchor);
			append_hydration_dev(li, a);
			append_hydration_dev(a, t0);
			append_hydration_dev(li, t1);
			if (if_block) if_block.m(li, null);

			if (!mounted) {
				dispose = listen_dev(a, "click", click_handler_1, false, false, false, false);
				mounted = true;
			}
		},
		p: function update(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*current, nav*/ 136) {
				toggle_class(a, "active", /*current*/ ctx[3] === /*href*/ ctx[21]);
			}

			if (/*children*/ ctx[22]) if_block.p(ctx, dirty);
		},
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(li);
			}

			if (if_block) if_block.d();
			mounted = false;
			dispose();
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_each_block.name,
		type: "each",
		source: "(494:5) {#each nav as [title, href, children]}",
		ctx
	});

	return block;
}

function create_fragment(ctx) {
	let scrolling = false;

	let clear_scrolling = () => {
		scrolling = false;
	};

	let scrolling_timeout;
	let t0;
	let t1;
	let main;
	let cheatsheet;
	let t2;
	let div1;
	let t3;
	let div0;
	let article;
	let t4;
	let html_tag;
	let current;
	let mounted;
	let dispose;
	add_render_callback(/*onwindowscroll*/ ctx[10]);
	add_render_callback(/*onwindowresize*/ ctx[11]);
	let if_block0 = /*width*/ ctx[2] < 1100 && create_if_block_3(ctx);
	cheatsheet = new Cheatsheet({ $$inline: true });
	let if_block1 = /*position*/ ctx[4] && create_if_block(ctx);
	const default_slot_template = /*#slots*/ ctx[9].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[8], null);

	const block = {
		c: function create() {
			t0 = space();
			if (if_block0) if_block0.c();
			t1 = space();
			main = element("main");
			create_component(cheatsheet.$$.fragment);
			t2 = space();
			div1 = element("div");
			if (if_block1) if_block1.c();
			t3 = space();
			div0 = element("div");
			article = element("article");
			if (default_slot) default_slot.c();
			t4 = space();
			html_tag = new HtmlTagHydration(false);
			this.h();
		},
		l: function claim(nodes) {
			const head_nodes = head_selector('svelte-15c0fwn', document_1.head);
			head_nodes.forEach(detach_dev);
			t0 = claim_space(nodes);
			if (if_block0) if_block0.l(nodes);
			t1 = claim_space(nodes);
			main = claim_element(nodes, "MAIN", {});
			var main_nodes = children(main);
			claim_component(cheatsheet.$$.fragment, main_nodes);
			t2 = claim_space(main_nodes);
			div1 = claim_element(main_nodes, "DIV", { style: true });
			var div1_nodes = children(div1);
			if (if_block1) if_block1.l(div1_nodes);
			t3 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			article = claim_element(div0_nodes, "ARTICLE", { class: true });
			var article_nodes = children(article);
			if (default_slot) default_slot.l(article_nodes);
			t4 = claim_space(article_nodes);
			html_tag = claim_html_tag(article_nodes, false);
			article_nodes.forEach(detach_dev);
			div0_nodes.forEach(detach_dev);
			div1_nodes.forEach(detach_dev);
			main_nodes.forEach(detach_dev);
			this.h();
		},
		h: function hydrate() {
			document_1.title = "mdsvex docs!";
			html_tag.a = null;
			attr_dev(article, "class", "svelte-t254dh");
			add_location(article, file, 537, 3, 10660);
			attr_dev(div0, "class", "container svelte-t254dh");
			add_location(div0, file, 536, 2, 10633);
			set_style(div1, "position", "relative");
			add_location(div1, file, 487, 1, 9405);
			add_location(main, file, 485, 0, 9381);
		},
		m: function mount(target, anchor) {
			insert_hydration_dev(target, t0, anchor);
			if (if_block0) if_block0.m(target, anchor);
			insert_hydration_dev(target, t1, anchor);
			insert_hydration_dev(target, main, anchor);
			mount_component(cheatsheet, main, null);
			append_hydration_dev(main, t2);
			append_hydration_dev(main, div1);
			if (if_block1) if_block1.m(div1, null);
			append_hydration_dev(div1, t3);
			append_hydration_dev(div1, div0);
			append_hydration_dev(div0, article);

			if (default_slot) {
				default_slot.m(article, null);
			}

			append_hydration_dev(article, t4);
			html_tag.m(docs, article);
			/*article_binding*/ ctx[16](article);
			current = true;

			if (!mounted) {
				dispose = [
					listen_dev(window_1, "scroll", () => {
						scrolling = true;
						clearTimeout(scrolling_timeout);
						scrolling_timeout = setTimeout(clear_scrolling, 100);
						/*onwindowscroll*/ ctx[10]();
					}),
					listen_dev(window_1, "resize", /*onwindowresize*/ ctx[11])
				];

				mounted = true;
			}
		},
		p: function update(ctx, [dirty]) {
			if (dirty & /*scrollY*/ 2 && !scrolling) {
				scrolling = true;
				clearTimeout(scrolling_timeout);
				scrollTo(window_1.pageXOffset, /*scrollY*/ ctx[1]);
				scrolling_timeout = setTimeout(clear_scrolling, 100);
			}

			if (/*width*/ ctx[2] < 1100) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_3(ctx);
					if_block0.c();
					if_block0.m(t1.parentNode, t1);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*position*/ ctx[4]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block(ctx);
					if_block1.c();
					if_block1.m(div1, t3);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 256)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[8],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[8])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[8], dirty, null),
						null
					);
				}
			}
		},
		i: function intro(local) {
			if (current) return;
			transition_in(cheatsheet.$$.fragment, local);
			transition_in(default_slot, local);
			current = true;
		},
		o: function outro(local) {
			transition_out(cheatsheet.$$.fragment, local);
			transition_out(default_slot, local);
			current = false;
		},
		d: function destroy(detaching) {
			if (detaching) {
				detach_dev(t0);
				detach_dev(t1);
				detach_dev(main);
			}

			if (if_block0) if_block0.d(detaching);
			destroy_component(cheatsheet);
			if (if_block1) if_block1.d();
			if (default_slot) default_slot.d(detaching);
			/*article_binding*/ ctx[16](null);
			mounted = false;
			run_all(dispose);
		}
	};

	dispatch_dev("SvelteRegisterBlock", {
		block,
		id: create_fragment.name,
		type: "component",
		source: "",
		ctx
	});

	return block;
}

function instance($$self, $$props, $$invalidate) {
	let $page;
	let { $$slots: slots = {}, $$scope } = $$props;
	validate_slots('Docs', slots, ['default']);
	let root;
	let scrollY = 0;
	let width = 1100;
	let current;
	let position = '';
	const { page } = stores$1();
	validate_store(page, 'page');
	component_subscribe($$self, page, value => $$invalidate(17, $page = value));

	const nav = [
		['Install', 'docs#install-it'],
		[
			'Use',
			'docs#use-it',
			[['mdsvex', 'docs#mdsvex-1', true], ['compile', 'docs#compile', true]]
		],
		[
			'Options',
			'docs#options',
			[
				['extensions', 'docs#extensions', true],
				['smartypants', 'docs#smartypants', true],
				['layout', 'docs#layout', true],
				['remarkPlugins', 'docs#remarkplugins--rehypeplugins', true],
				['rehypePlugins', 'docs#remarkplugins--rehypeplugins', true],
				['highlight', 'docs#highlight', true],
				['frontmatter', 'docs#frontmatter', true]
			]
		],
		[
			'Layouts',
			'docs#layouts',
			[
				['named layouts', 'docs#named-layouts', false],
				['disabling layouts', 'docs#disabling-layouts', false],
				['custom components', 'docs#custom-components', false]
			]
		],
		['Frontmatter', 'docs#frontmatter-1'],
		['Integrations', 'docs#integrations', [['sapper', 'docs#with-sapper', false]]],
		['Limitations', 'docs#limitations']
	];

	function remove_origin(href) {
		const re = new RegExp(`http(s*)://${$page.host}/`);
		return href.replace(re, '');
	}

	function calculate_positions() {
		if (root.getBoundingClientRect().top >= 0 && window.innerWidth > 1100) {
			$$invalidate(4, position = 'absolute');
		} else {
			$$invalidate(4, position = 'fixed');
		}

		const nodes = Array.from(root.children).filter(v => v.tagName === 'H2' || v.tagName === 'H3');
		const last = nodes.length - 1;

		if (~~root.getBoundingClientRect().bottom === window.innerHeight) {
			console.log('boo');
			$$invalidate(3, current = 'docs' + remove_origin(nodes[last].children[0].href));
			return;
		}

		for (let node of nodes) {
			const { top } = node.getBoundingClientRect();

			if (top > 5) {
				break;
			}

			$$invalidate(3, current = 'docs' + remove_origin(node.children[0].href));
		}
	}

	// somebody save me
	onMount(() => {
		if (window !== undefined && window.location.hash) {
			const el = document.getElementById(window.location.hash.replace('#', ''));
			el && el.scrollIntoView();
		}

		calculate_positions();
	});

	let menu_show = false;
	const writable_props = [];

	Object.keys($$props).forEach(key => {
		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<Docs> was created with unknown prop '${key}'`);
	});

	function onwindowscroll() {
		$$invalidate(1, scrollY = window_1.pageYOffset);
	}

	function onwindowresize() {
		$$invalidate(2, width = window_1.innerWidth);
	}

	const click_handler = () => $$invalidate(5, menu_show = !menu_show);
	const click_handler_1 = href => $$invalidate(5, menu_show = false) && $$invalidate(3, current = href);
	const click_handler_2 = () => $$invalidate(5, menu_show = false);
	const click_handler_3 = () => $$invalidate(5, menu_show = false);

	function article_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			root = $$value;
			$$invalidate(0, root);
		});
	}

	$$self.$$set = $$props => {
		if ('$$scope' in $$props) $$invalidate(8, $$scope = $$props.$$scope);
	};

	$$self.$capture_state = () => ({
		stores: stores$1,
		onMount,
		fade,
		docs,
		Cheatsheet,
		root,
		scrollY,
		width,
		current,
		position,
		page,
		nav,
		remove_origin,
		calculate_positions,
		menu_show,
		$page
	});

	$$self.$inject_state = $$props => {
		if ('root' in $$props) $$invalidate(0, root = $$props.root);
		if ('scrollY' in $$props) $$invalidate(1, scrollY = $$props.scrollY);
		if ('width' in $$props) $$invalidate(2, width = $$props.width);
		if ('current' in $$props) $$invalidate(3, current = $$props.current);
		if ('position' in $$props) $$invalidate(4, position = $$props.position);
		if ('menu_show' in $$props) $$invalidate(5, menu_show = $$props.menu_show);
	};

	if ($$props && "$$inject" in $$props) {
		$$self.$inject_state($$props.$$inject);
	}

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*root, scrollY, width*/ 7) {
			root && typeof scrollY === 'number' && width && calculate_positions();
		}
	};

	return [
		root,
		scrollY,
		width,
		current,
		position,
		menu_show,
		page,
		nav,
		$$scope,
		slots,
		onwindowscroll,
		onwindowresize,
		click_handler,
		click_handler_1,
		click_handler_2,
		click_handler_3,
		article_binding
	];
}

class Docs extends SvelteComponentDev {
	constructor(options) {
		super(options);
		init(this, options, instance, create_fragment, safe_not_equal, {});

		dispatch_dev("SvelteRegisterComponent", {
			component: this,
			tagName: "Docs",
			options,
			id: create_fragment.name
		});
	}
}

export { Docs as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9jcy5hNDU5MWQ2MS5qcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2NvbXBvbmVudHMvQ2hlYXRzaGVldC5zdngiLCIuLi8uLi8uLi9zcmMvcm91dGVzL2RvY3Muc3ZlbHRlIl0sInNvdXJjZXNDb250ZW50IjpbIjxzdHlsZT5cbiAgOmdsb2JhbChib2R5KSB7XG4gICAgYmFja2dyb3VuZDogI2Y4ZjhmODtcblxuICAgIC8qIGhlaWdodDogMTAwdmg7ICovXG4gICAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbiAgfVxuXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoZGwpIHtcbiAgICBsaXN0LXN0eWxlOiBub25lO1xuICAgIHBhZGRpbmc6IDA7XG4gICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgaGVpZ2h0OiA5MCU7XG4gICAgbWFyZ2luOiAwO1xuICAgIGZvbnQtc2l6ZTogMS45cmVtO1xuXG4gIH1cblxuICAuY2hlYXRzaGVldCA6Z2xvYmFsKGRkKSB7XG4gICAgbWFyZ2luOiA1cHggMCAxNXB4IDA7XG4gICAgZm9udC1zdHlsZTogaXRhbGljO1xuICB9XG5cbiAgLmNoZWF0c2hlZXQgOmdsb2JhbChkdCBzcGFuKSB7XG4gICAgZm9udC1mYW1pbHk6IG1vbm9zcGFjZTtcbiAgICBmb250LXNpemU6IDE2cHg7XG4gICAgcGFkZGluZzogM3B4IDZweDtcbiAgICBiYWNrZ3JvdW5kOiAjZWVlO1xuICAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbiAgICBtYXJnaW46IDEwcHggMCAwIDA7XG4gICAgYm9yZGVyLXJhZGl1czogM3B4O1xuICB9XG5cbiAgLmNoZWF0c2hlZXQgOmdsb2JhbChsaTpmaXJzdC1jaGlsZCA+IHNwYW4pIHtcbiAgICBtYXJnaW4tdG9wOiAxNHB4O1xuICB9XG5cbiAgLmNoZWF0c2hlZXQgOmdsb2JhbChsaTpsYXN0LWNoaWxkID4gc3Bhbikge1xuICAgIG1hcmdpbi1ib3R0b206IDIwcHg7XG4gIH1cbiAgLmNoZWF0c2hlZXQgOmdsb2JhbChoMikge1xuICAgIGNvbG9yOiAjNTU1O1xuICB9XG5cbiAgLmNoZWF0c2hlZXQgOmdsb2JhbCguY29udGFpbmVyKSB7XG4gICAgaGVpZ2h0OiA4NTBweDtcbiAgICBkaXNwbGF5OiBncmlkO1xuICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogcmVwZWF0KDEyLCAxZnIpO1xuICAgIGdyaWQtdGVtcGxhdGUtcm93czogcmVwZWF0KDEyLCAxZnIpO1xuICAgIGdyaWQtZ2FwOiAzMHB4O1xuICAgIG1pbi1oZWlnaHQ6IDg1MHB4O1xuICAgIG1heC1oZWlnaHQ6IDg1MHB4O1xuICAgIG1hcmdpbjogNjVweDtcbiAgfVxuXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoLmJveCkge1xuICAgIGJhY2tncm91bmQ6ICNmZmY7XG4gICAgcGFkZGluZzogMCAyMHB4O1xuICAgIG1pbi13aWR0aDogMDtcbiAgICBtaW4taGVpZ2h0OiAwO1xuICAgIGJveC1zaGFkb3c6ICAwIDFweCA1cHggcmdiYSgwLCAwLCAwLCAwLjE1KTtcbiAgfVxuXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoLmluc3RhbGwpIHtcbiAgICBncmlkLWNvbHVtbjogMSAvIHNwYW4gNDtcbiAgICBncmlkLXJvdzogMSAvIHNwYW4gNDtcbiAgfVxuXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoLnVzZSkge1xuICAgIGdyaWQtY29sdW1uOiA1IC8gc3BhbiA0O1xuICAgIGdyaWQtcm93OiAxIC8gc3BhbiA1O1xuICB9XG5cbiAgLmNoZWF0c2hlZXQgOmdsb2JhbCguY29uZmlnKSB7XG4gICAgZ3JpZC1jb2x1bW46IDkgLyBzcGFuIDQ7XG4gICAgZ3JpZC1yb3c6IDEgLyBzcGFuIDEyO1xuICAgIGRpc3BsYXk6IGdyaWQ7XG4gICAgZ3JpZC10ZW1wbGF0ZS1yb3dzOiByZXBlYXQoMTIsIDFmcik7XG4gIH1cblxuICAuY2hlYXRzaGVldCA6Z2xvYmFsKC5jb25maWcgPiBkaXYpIHtcbiAgICBncmlkLXJvdzogMSAvIHNwYW4gMTtcbiAgfVxuXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoLmNvbmZpZyA+IGRsKSB7XG4gICAgZ3JpZC1yb3c6IDIgLyBzcGFuIDExO1xuICAgIGhlaWdodDogNzd2aDtcbiAgfVxuXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoLmxheW91dHMpIHtcbiAgICBncmlkLWNvbHVtbjogMSAvIHNwYW4gNDtcbiAgICBncmlkLXJvdzogNSAvIHNwYW4gODtcbiAgfVxuXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoLmZyb250bWF0dGVyKSB7XG4gICAgZ3JpZC1jb2x1bW46IDUgLyBzcGFuIDQ7XG4gICAgZ3JpZC1yb3c6IDYgLyBzcGFuIDQ7XG4gIH1cblxuICAuY2hlYXRzaGVldCA6Z2xvYmFsKC5pbnRlZ3JhdGlvbnMpIHtcbiAgICBncmlkLWNvbHVtbjogNSAvIHNwYW4gNDtcbiAgICBncmlkLXJvdzogMTAgLyBzcGFuIDM7XG4gIH1cblxuICAuY2hlYXRzaGVldCA6Z2xvYmFsKHByZSksXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoaDIpIHtcbiAgICBtYXJnaW4tdG9wOiAycmVtO1xuICB9XG5cbiAgLmNoZWF0c2hlZXQgOmdsb2JhbChwcmUpIHtcbiAgICBib3JkZXItcmFkaXVzOiAzcHg7XG4gICAgcGFkZGluZzogMXJlbSAxcmVtIDEuNHJlbSAycmVtO1xuICAgIGxpbmUtaGVpZ2h0OiAxLjM7XG4gIH1cblxuICAuY2hlYXRzaGVldCA6Z2xvYmFsKGNvZGUpIHtcbiAgICBib3JkZXItcmFkaXVzOiAzcHg7XG4gICAgZm9udC1zaXplOiAxNHB4O1xuICAgIG92ZXJmbG93OiBzY3JvbGw7XG4gIH1cblxuICAuY2hlYXRzaGVldCA6Z2xvYmFsKC5ib3gpIHtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgZGlzcGxheTogaW5saW5lLWJsb2NrO1xuICB9XG5cblxuICAuY2hlYXRzaGVldCA6Z2xvYmFsKGgyKSB7XG4gICAgZm9udC13ZWlnaHQ6IG5vcm1hbDtcbiAgICB0ZXh0LXRyYW5zZm9ybTogbG93ZXJjYXNlO1xuICAgIGZvbnQtZmFtaWx5OiBcImZpcmEtZnVsbFwiO1xuICAgIGZvbnQtc2l6ZTogMnJlbTtcbiAgICBtYXJnaW4tYm90dG9tOiAycmVtO1xuICB9XG5cbiAgLmNoZWF0c2hlZXQgOmdsb2JhbChoMiBhKSwgLmNoZWF0c2hlZXQgOmdsb2JhbChoMyBhKSB7XG4gICAgYm9yZGVyOiBub25lO1xuICB9XG5cbiAgLmNoZWF0c2hlZXQgOmdsb2JhbChoMiBhOjpiZWZvcmUpLCAuY2hlYXRzaGVldCA6Z2xvYmFsKGgzIGE6OmJlZm9yZSkge1xuICAgIGNvbnRlbnQ6ICcjJztcbiAgICBjb2xvcjogI2JiYjtcbiAgICBmb250LXNpemU6IDJyZW07XG4gIH1cblxuICAgLmNoZWF0c2hlZXQgOmdsb2JhbChoMyBhOjpiZWZvcmUpIHtcbiAgICBmb250LXNpemU6IDEuN3JlbTtcbiAgfVxuXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoaDMpIHtcbiAgICBmb250LXNpemU6IDEuN3JlbTtcbiAgICBtYXJnaW4tYm90dG9tOiAwO1xuICAgIG1hcmdpbi10b3A6IDJyZW07XG4gICAgZm9udC1mYW1pbHk6ICdmaXJhLWZ1bGwnO1xuICB9XG5cbiAgLmNoZWF0c2hlZXQgOmdsb2JhbChoMyArIHByZSkge1xuICAgIG1hcmdpbi10b3A6IDAuNXJlbTtcbiAgfVxuXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoLmJveCA+IHApIHtcbiAgICBkaXNwbGF5OiBub25lO1xuICAgIG1hcmdpbi10b3A6IDEwcHg7XG4gIH1cblxuICAuY2hlYXRzaGVldCA6Z2xvYmFsKC5ib3ggPiAua2VlcCkge1xuICAgIGRpc3BsYXk6IGJsb2NrO1xuICB9XG5cbiAgQG1lZGlhIChtYXgtd2lkdGg6IDExMDBweCkge1xuICAgIC5jaGVhdHNoZWV0IDpnbG9iYWwoLmNvbnRhaW5lcikge1xuICAgICAgZGlzcGxheTogZ3JpZDtcbiAgICAgIGZsZXgtd3JhcDogd3JhcDtcbiAgICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogcmVwZWF0KDIsIDFmcik7XG4gICAgICBncmlkLXRlbXBsYXRlLXJvd3M6IHJlcGVhdCgyNiwgMWZyKTtcbiAgICAgIGdyaWQtZ2FwOiAzMHB4O1xuICAgICAgbWF4LWhlaWdodDogMTQ1MHB4O1xuICAgICAgaGVpZ2h0OiAxNDUwcHg7XG4gICAgfVxuXG4gICAgLmNoZWF0c2hlZXQgOmdsb2JhbCguaW5zdGFsbCkge1xuICAgICAgZ3JpZC1jb2x1bW46IDEgLyBzcGFuIDE7XG4gICAgICBncmlkLXJvdzogMSAvIHNwYW4gNTtcbiAgICB9XG5cbiAgICAuY2hlYXRzaGVldCA6Z2xvYmFsKC51c2UpIHtcbiAgICAgIGdyaWQtY29sdW1uOiAyIC8gc3BhbiAxO1xuICAgICAgZ3JpZC1yb3c6IDEgLyBzcGFuIDY7XG4gICAgfVxuXG4gICAgLmNoZWF0c2hlZXQgOmdsb2JhbCguY29uZmlnKSB7XG4gICAgICBncmlkLWNvbHVtbjogMSAvIHNwYW4gMTtcbiAgICAgIGdyaWQtcm93OiA2IC8gc3BhbiAxNDtcbiAgICB9XG5cbiAgICAuY2hlYXRzaGVldCA6Z2xvYmFsKC5jb25maWcgPiBkbCkge1xuICAgICAgZm9udC1zaXplOiAxLjhyZW07XG4gICAgfVxuXG4gICAgLmNoZWF0c2hlZXQgOmdsb2JhbCgubGF5b3V0cykge1xuICAgICAgZ3JpZC1jb2x1bW46IDIgLyBzcGFuIDE7XG4gICAgICBncmlkLXJvdzogNyAvIHNwYW4gMTA7XG4gICAgfVxuXG4gICAgLmNoZWF0c2hlZXQgOmdsb2JhbCguZnJvbnRtYXR0ZXIpIHtcbiAgICAgIGdyaWQtY29sdW1uOiAxIC8gc3BhbiAxO1xuICAgICAgZ3JpZC1yb3c6IDIwIC8gc3BhbiA1O1xuICAgIH1cblxuICAgIC5jaGVhdHNoZWV0IDpnbG9iYWwoLmludGVncmF0aW9ucykge1xuICAgICAgZ3JpZC1jb2x1bW46IDIgLyBzcGFuIDE7XG4gICAgICBncmlkLXJvdzogMTcgLyBzcGFuIDM7XG4gICAgfVxuICB9XG5cbiAgQG1lZGlhIChtYXgtd2lkdGg6IDc1MHB4KSB7XG4gICAgLmNoZWF0c2hlZXQgOmdsb2JhbCguY29udGFpbmVyKSB7XG4gICAgICBkaXNwbGF5OiBibG9jaztcbiAgICAgIGhlaWdodDogYXV0bztcbiAgICAgIG1heC1oZWlnaHQ6IGluaGVyaXQ7XG4gICAgICBtYXJnaW46IDY1cHggNjBweDtcbiAgICB9XG5cbiAgICAuY2hlYXRzaGVldCA6Z2xvYmFsKC5ib3gpe1xuICAgICAgZGlzcGxheTogYmxvY2s7XG4gICAgICBwYWRkaW5nOiAycmVtO1xuICAgICAgbWFyZ2luOiAzcmVtIDA7XG4gICAgICBib3JkZXItcmFkaXVzOiAwO1xuICAgIH1cbiAgfVxuXG4gIEBtZWRpYSAobWF4LXdpZHRoOiA1NTBweCkge1xuICAgIC5jaGVhdHNoZWV0IDpnbG9iYWwoLmNvbnRhaW5lcikge1xuICAgICAgbWFyZ2luOiA2NXB4IDAgMCAwO1xuICAgIH1cbiAgfVxuXG4gIC5jaGVhdHNoZWV0IDpnbG9iYWwoLmNvbmZpZyA+IGRsKSB7XG4gICAgaGVpZ2h0OiBmaXQtY29udGVudDtcbiAgfVxuXG5cbjwvc3R5bGU+XG5cbjxzY3JpcHQ+XG4gIGltcG9ydCBjaGVhdHNoZWV0IGZyb20gJy4vX2NoZWF0c2hlZXQuc3Z0ZXh0Jztcbjwvc2NyaXB0PlxuXG48ZGl2IGNsYXNzPVwiY2hlYXRzaGVldFwiPlxuICB7QGh0bWwgY2hlYXRzaGVldH1cbjwvZGl2PlxuIiwiPHNjcmlwdD5cblx0aW1wb3J0IHsgc3RvcmVzIH0gZnJvbSAnQHNhcHBlci9hcHAnO1xuXHRpbXBvcnQgeyBvbk1vdW50IH0gZnJvbSAnc3ZlbHRlJztcblx0aW1wb3J0IHsgZmFkZSB9IGZyb20gJ3N2ZWx0ZS90cmFuc2l0aW9uJztcblx0aW1wb3J0IGRvY3MgZnJvbSAnLi9fZG9jcy5zdnRleHQnO1xuXHRpbXBvcnQgQ2hlYXRzaGVldCBmcm9tICcuLi9jb21wb25lbnRzL0NoZWF0c2hlZXQuc3Z4JztcblxuXHRsZXQgcm9vdDtcblx0bGV0IHNjcm9sbFkgPSAwO1xuXHRsZXQgd2lkdGggPSAxMTAwO1xuXHRsZXQgY3VycmVudDtcblx0bGV0IHBvc2l0aW9uID0gJyc7XG5cblx0Y29uc3QgeyBwYWdlIH0gPSBzdG9yZXMoKTtcblxuXHRjb25zdCBuYXYgPSBbXG5cdFx0WydJbnN0YWxsJywgJ2RvY3MjaW5zdGFsbC1pdCddLFxuXHRcdFtcblx0XHRcdCdVc2UnLFxuXHRcdFx0J2RvY3MjdXNlLWl0Jyxcblx0XHRcdFtcblx0XHRcdFx0WydtZHN2ZXgnLCAnZG9jcyNtZHN2ZXgtMScsIHRydWVdLFxuXHRcdFx0XHRbJ2NvbXBpbGUnLCAnZG9jcyNjb21waWxlJywgdHJ1ZV0sXG5cdFx0XHRdLFxuXHRcdF0sXG5cdFx0W1xuXHRcdFx0J09wdGlvbnMnLFxuXHRcdFx0J2RvY3Mjb3B0aW9ucycsXG5cdFx0XHRbXG5cdFx0XHRcdFsnZXh0ZW5zaW9ucycsICdkb2NzI2V4dGVuc2lvbnMnLCB0cnVlXSxcblx0XHRcdFx0WydzbWFydHlwYW50cycsICdkb2NzI3NtYXJ0eXBhbnRzJywgdHJ1ZV0sXG5cdFx0XHRcdFsnbGF5b3V0JywgJ2RvY3MjbGF5b3V0JywgdHJ1ZV0sXG5cdFx0XHRcdFsncmVtYXJrUGx1Z2lucycsICdkb2NzI3JlbWFya3BsdWdpbnMtLXJlaHlwZXBsdWdpbnMnLCB0cnVlXSxcblx0XHRcdFx0WydyZWh5cGVQbHVnaW5zJywgJ2RvY3MjcmVtYXJrcGx1Z2lucy0tcmVoeXBlcGx1Z2lucycsIHRydWVdLFxuXHRcdFx0XHRbJ2hpZ2hsaWdodCcsICdkb2NzI2hpZ2hsaWdodCcsIHRydWVdLFxuXHRcdFx0XHRbJ2Zyb250bWF0dGVyJywgJ2RvY3MjZnJvbnRtYXR0ZXInLCB0cnVlXSxcblx0XHRcdF0sXG5cdFx0XSxcblx0XHRbXG5cdFx0XHQnTGF5b3V0cycsXG5cdFx0XHQnZG9jcyNsYXlvdXRzJyxcblx0XHRcdFtcblx0XHRcdFx0WyduYW1lZCBsYXlvdXRzJywgJ2RvY3MjbmFtZWQtbGF5b3V0cycsIGZhbHNlXSxcblx0XHRcdFx0WydkaXNhYmxpbmcgbGF5b3V0cycsICdkb2NzI2Rpc2FibGluZy1sYXlvdXRzJywgZmFsc2VdLFxuXHRcdFx0XHRbJ2N1c3RvbSBjb21wb25lbnRzJywgJ2RvY3MjY3VzdG9tLWNvbXBvbmVudHMnLCBmYWxzZV0sXG5cdFx0XHRdLFxuXHRcdF0sXG5cdFx0WydGcm9udG1hdHRlcicsICdkb2NzI2Zyb250bWF0dGVyLTEnXSxcblx0XHRbXG5cdFx0XHQnSW50ZWdyYXRpb25zJyxcblx0XHRcdCdkb2NzI2ludGVncmF0aW9ucycsXG5cdFx0XHRbWydzYXBwZXInLCAnZG9jcyN3aXRoLXNhcHBlcicsIGZhbHNlXV0sXG5cdFx0XSxcblx0XHRbJ0xpbWl0YXRpb25zJywgJ2RvY3MjbGltaXRhdGlvbnMnXSxcblx0XTtcblxuXHQkOiByb290ICYmIHR5cGVvZiBzY3JvbGxZID09PSAnbnVtYmVyJyAmJiB3aWR0aCAmJiBjYWxjdWxhdGVfcG9zaXRpb25zKCk7XG5cblx0ZnVuY3Rpb24gcmVtb3ZlX29yaWdpbihocmVmKSB7XG5cdFx0Y29uc3QgcmUgPSBuZXcgUmVnRXhwKGBodHRwKHMqKTovLyR7JHBhZ2UuaG9zdH0vYCk7XG5cdFx0cmV0dXJuIGhyZWYucmVwbGFjZShyZSwgJycpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY2FsY3VsYXRlX3Bvc2l0aW9ucygpIHtcblx0XHRpZiAocm9vdC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3AgPj0gMCAmJiB3aW5kb3cuaW5uZXJXaWR0aCA+IDExMDApIHtcblx0XHRcdHBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cG9zaXRpb24gPSAnZml4ZWQnO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGVzID0gQXJyYXkuZnJvbShyb290LmNoaWxkcmVuKS5maWx0ZXIoXG5cdFx0XHR2ID0+IHYudGFnTmFtZSA9PT0gJ0gyJyB8fCB2LnRhZ05hbWUgPT09ICdIMydcblx0XHQpO1xuXG5cdFx0Y29uc3QgbGFzdCA9IG5vZGVzLmxlbmd0aCAtIDE7XG5cdFx0aWYgKH5+cm9vdC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5ib3R0b20gPT09IHdpbmRvdy5pbm5lckhlaWdodCkge1xuXHRcdFx0Y29uc29sZS5sb2coJ2JvbycpO1xuXHRcdFx0Y3VycmVudCA9ICdkb2NzJyArIHJlbW92ZV9vcmlnaW4obm9kZXNbbGFzdF0uY2hpbGRyZW5bMF0uaHJlZik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgbm9kZSBvZiBub2Rlcykge1xuXHRcdFx0Y29uc3QgeyB0b3AgfSA9IG5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRpZiAodG9wID4gNSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGN1cnJlbnQgPSAnZG9jcycgKyByZW1vdmVfb3JpZ2luKG5vZGUuY2hpbGRyZW5bMF0uaHJlZik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gc29tZWJvZHkgc2F2ZSBtZVxuXG5cdG9uTW91bnQoKCkgPT4ge1xuXHRcdGlmICh3aW5kb3cgIT09IHVuZGVmaW5lZCAmJiB3aW5kb3cubG9jYXRpb24uaGFzaCkge1xuXHRcdFx0Y29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCh3aW5kb3cubG9jYXRpb24uaGFzaC5yZXBsYWNlKCcjJywgJycpKTtcblx0XHRcdGVsICYmIGVsLnNjcm9sbEludG9WaWV3KCk7XG5cdFx0fVxuXG5cdFx0Y2FsY3VsYXRlX3Bvc2l0aW9ucygpO1xuXHR9KTtcblxuXHRsZXQgbWVudV9zaG93ID0gZmFsc2U7XG48L3NjcmlwdD5cblxuPHN0eWxlPlxuXHRuYXYge1xuXHRcdHBhZGRpbmc6IDJyZW0gM3JlbTtcblx0XHR3aWR0aDogMzByZW07XG5cdFx0dG9wOiAwO1xuXHRcdGhlaWdodDogY2FsYygxMDAlIC0gN3JlbSk7XG5cdFx0b3ZlcmZsb3cteTogc2Nyb2xsO1xuXHRcdG1hcmdpbi10b3A6IDRyZW07XG5cdFx0YmFja2dyb3VuZDogI2ZhZmFmYTtcblx0fVxuXG5cdHVsIHtcblx0XHRsaXN0LXN0eWxlLXR5cGU6IG5vbmU7XG5cdH1cblxuXHRsaSB7XG5cdFx0bWFyZ2luOiAzcmVtIDBweDtcblx0XHRwb3NpdGlvbjogcmVsYXRpdmU7XG5cdFx0dGV4dC10cmFuc2Zvcm06IHVwcGVyY2FzZTtcblx0XHRmb250LXdlaWdodDogYm9sZDtcblx0XHRmb250LWZhbWlseTogJ2xhdG8tYm9sZC1zdWInO1xuXHR9XG5cblx0dWwgPiBsaSA+IHVsID4gbGkge1xuXHRcdG1hcmdpbjogMXJlbSAwcHg7XG5cdFx0dGV4dC10cmFuc2Zvcm06IG5vbmU7XG5cdFx0Zm9udC13ZWlnaHQ6IDQwMDtcblx0XHRmb250LWZhbWlseTogJ2xhdG8tc3ViJztcblx0fVxuXG5cdGEge1xuXHRcdHRleHQtZGVjb3JhdGlvbjogbm9uZTtcblx0XHRib3JkZXI6IG5vbmU7XG5cdFx0Y29sb3I6ICM3Nzc7XG5cdFx0bWFyZ2luLWxlZnQ6IDI1cHg7XG5cdH1cblxuXHRhIGNvZGUge1xuXHRcdHBvc2l0aW9uOiByZWxhdGl2ZTtcblx0XHRib3JkZXItcmFkaXVzOiAwLjNyZW07XG5cdFx0d2hpdGUtc3BhY2U6IG5vd3JhcDtcblx0XHRjb2xvcjogIzc3Nztcblx0XHQtd2Via2l0LWZvbnQtc21vb3RoaW5nOiBpbml0aWFsO1xuXHRcdGJhY2tncm91bmQ6ICNlZWU7XG5cdFx0cGFkZGluZzogMC4zcmVtIDAuNnJlbSAwIDAuNnJlbSAhaW1wb3J0YW50O1xuXHRcdHRyYW5zaXRpb246IDAuM3M7XG5cdFx0Zm9udC1mYW1pbHk6ICdmaXJhLWZ1bGwnO1xuXHRcdGZvbnQtc2l6ZTogMS40cmVtO1xuXHR9XG5cblx0YTpob3Zlcixcblx0YTpob3ZlciBjb2RlLFxuXHRhLmFjdGl2ZSB7XG5cdFx0Y29sb3I6ICMwMDA7XG5cdH1cblxuXHRhOmhvdmVyIGNvZGUge1xuXHRcdGJhY2tncm91bmQ6ICNjY2M7XG5cdH1cblxuXHRhLmFjdGl2ZSB7XG5cdFx0Zm9udC13ZWlnaHQ6IGJvbGQ7XG5cdH1cblxuXHRhLmFjdGl2ZSBjb2RlIHtcblx0XHRiYWNrZ3JvdW5kOiAjMzMzO1xuXHRcdGNvbG9yOiAjZWVlO1xuXHR9XG5cblx0YXJ0aWNsZSA6Z2xvYmFsKGgxKSB7XG5cdFx0bWFyZ2luLWJvdHRvbTogNC42cmVtO1xuXHRcdGZvbnQtZmFtaWx5OiAncm9ib3RvLXN1Yic7XG5cdFx0Zm9udC13ZWlnaHQ6IDEwMDtcblx0XHRmb250LXNpemU6IDZyZW07XG5cdH1cblxuXHRhcnRpY2xlIDpnbG9iYWwoaDIpIHtcblx0XHRtYXJnaW46IDVyZW0gMCAzcmVtIDA7XG5cdFx0Ym9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICNjY2M7XG5cdFx0Zm9udC1mYW1pbHk6ICdyb2JvdG8tYm9sZC1mdWxsJztcblx0fVxuXG5cdGFydGljbGUgOmdsb2JhbChoMykge1xuXHRcdG1hcmdpbi1ib3R0b206IDJyZW07XG5cdFx0bWFyZ2luLXRvcDogM3JlbTtcblx0XHRmb250LWZhbWlseTogJ3JvYm90by1ib2xkLWZ1bGwnO1xuXHR9XG5cblx0YXJ0aWNsZSA6Z2xvYmFsKGg0KSB7XG5cdFx0bWFyZ2luLXRvcDogMnJlbTtcblx0XHRtYXJnaW4tYm90dG9tOiAycmVtO1xuXHRcdGZvbnQtZmFtaWx5OiAncm9ib3RvLWJvbGQtZnVsbCc7XG5cdH1cblxuXHRhcnRpY2xlIDpnbG9iYWwocCkge1xuXHRcdGZvbnQtZmFtaWx5OiAncm9ib3RvLWZ1bGwnO1xuXHR9XG5cblx0YXJ0aWNsZSA+IDpnbG9iYWwodWwpIHtcblx0XHRtYXJnaW4tbGVmdDogNXJlbSAhaW1wb3J0YW50O1xuXHR9XG5cblx0YXJ0aWNsZSA6Z2xvYmFsKGNvZGUpIHtcblx0XHRmb250LWZhbWlseTogJ2ZpcmEtZnVsbCc7XG5cdFx0cG9zaXRpb246IHJlbGF0aXZlO1xuXHRcdGJvcmRlci1yYWRpdXM6IDAuM3JlbTtcblx0XHRjb2xvcjogIzMzMztcblx0XHQtd2Via2l0LWZvbnQtc21vb3RoaW5nOiBpbml0aWFsO1xuXHRcdGJhY2tncm91bmQ6ICNlZWU7XG5cdFx0cGFkZGluZzogMC4ycmVtIDAuNHJlbSAwcmVtIDAuNHJlbTtcblx0XHR3aGl0ZS1zcGFjZTogcHJlO1xuXHRcdHdvcmQtc3BhY2luZzogbm9ybWFsO1xuXHRcdHdvcmQtYnJlYWs6IG5vcm1hbDtcblx0XHR3b3JkLXdyYXA6IG5vcm1hbDtcblx0XHRmb250LXNpemU6IDEuNHJlbTtcblx0fVxuXG5cdGFydGljbGUgOmdsb2JhbChwcmUgY29kZSkge1xuXHRcdHdoaXRlLXNwYWNlOiBwcmU7XG5cdFx0YmFja2dyb3VuZDogbm9uZTtcblx0XHRjb2xvcjogI2NiY2NjNjtcblx0XHRwYWRkaW5nOiAwO1xuXHRcdHdoaXRlLXNwYWNlOiBwcmU7XG5cdFx0d29yZC1zcGFjaW5nOiBub3JtYWw7XG5cdFx0d29yZC1icmVhazogbm9ybWFsO1xuXHRcdHdvcmQtd3JhcDogbm9ybWFsO1xuXHRcdHRhYi1zaXplOiAycmVtO1xuXHR9XG5cblx0YXJ0aWNsZSA6Z2xvYmFsKHByZSkge1xuXHRcdGJhY2tncm91bmQ6ICMxZjI0MzA7XG5cdFx0Y29sb3I6ICNjYmNjYzY7XG5cdFx0Ym9yZGVyLXJhZGl1czogM3B4O1xuXHRcdHBhZGRpbmc6IDFyZW0gMnJlbTtcblx0XHRtYXJnaW46IDByZW0gMCA0cmVtIDA7XG5cdFx0Zm9udC1zaXplOiAxLjRyZW07XG5cdFx0d2hpdGUtc3BhY2U6IHByZTtcblx0XHR3b3JkLXNwYWNpbmc6IG5vcm1hbDtcblx0XHR3b3JkLWJyZWFrOiBub3JtYWw7XG5cdFx0d29yZC13cmFwOiBub3JtYWw7XG5cdFx0bGluZS1oZWlnaHQ6IDIuNXJlbTtcblx0fVxuXG5cdGFydGljbGUgOmdsb2JhbChibG9ja3F1b3RlKSB7XG5cdFx0Ym9yZGVyOiAxcHggc29saWQgI2JlYmViZTtcblx0fVxuXG5cdGFydGljbGUgOmdsb2JhbChibG9ja3F1b3RlIHApIHtcblx0XHRjb2xvcjogIzIyMjtcblx0XHRmb250LXNpemU6IDEuOHJlbTtcblx0fVxuXG5cdGFydGljbGUgOmdsb2JhbChoMyBjb2RlKSB7XG5cdFx0Zm9udC1zaXplOiAyLjJyZW07XG5cdFx0LyogYmFja2dyb3VuZDogbm9uZTsgKi9cblx0fVxuXG5cdGFydGljbGUgOmdsb2JhbChoNCBjb2RlKSB7XG5cdFx0Zm9udC1zaXplOiAxLjhyZW07XG5cdFx0bWFyZ2luLWJvdHRvbTogMnJlbTtcblx0fVxuXG5cdGFydGljbGUgOmdsb2JhbChwcmUubGFuZ3VhZ2Utc2lnKSB7XG5cdFx0ZGlzcGxheTogaW5saW5lLWJsb2NrO1xuXHRcdHBhZGRpbmc6IDAuMnJlbSAwLjdyZW0gMC4ycmVtO1xuXHRcdG1hcmdpbjogMnJlbSAwIDAgMDtcblx0fVxuXG5cdGFydGljbGUgOmdsb2JhbChhKSB7XG5cdFx0Y29sb3I6ICM3Nzc7XG5cdFx0Ym9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICM5OTk7XG5cdH1cblxuXHRhcnRpY2xlIDpnbG9iYWwoYTpob3Zlcikge1xuXHRcdGNvbG9yOiAjMzMzO1xuXHRcdGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAjMzMzO1xuXHR9XG5cblx0YXJ0aWNsZSA6Z2xvYmFsKGgxIGEpLFxuXHRhcnRpY2xlIDpnbG9iYWwoaDIgYSksXG5cdGFydGljbGUgOmdsb2JhbChoMyBhKSxcblx0YXJ0aWNsZSA6Z2xvYmFsKGg0IGEpIHtcblx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRoZWlnaHQ6IDEwMCU7XG5cdFx0d2lkdGg6IDA7XG5cdFx0cGFkZGluZy10b3A6IDEuMjNyZW07XG5cdH1cblxuXHQubWluaSB7XG5cdFx0dGV4dC10cmFuc2Zvcm06IGxvd2VyY2FzZTtcblx0XHRtYXJnaW46IDA7XG5cdFx0Zm9udC1mYW1pbHk6ICdmaXJhLWZ1bGwnO1xuXHRcdGZvbnQtd2VpZ2h0OiBub3JtYWw7XG5cdFx0Zm9udC1zaXplOiAxLjZyZW07XG5cdH1cblxuXHQuY29udGFpbmVyIHtcblx0XHRkaXNwbGF5OiBncmlkO1xuXHRcdGdyaWQtdGVtcGxhdGUtY29sdW1uczogcmVwZWF0KDEyLCAxZnIpO1xuXHRcdGdyaWQtdGVtcGxhdGUtcm93czogMWZyO1xuXHRcdGdyaWQtZ2FwOiAzcmVtO1xuXHRcdG1hcmdpbi10b3A6IDNyZW07XG5cdH1cblxuXHQuY29udGFpbmVyIDpnbG9iYWwoaDEpIHtcblx0XHRmb250LXNpemU6IDRyZW07XG5cdFx0dGV4dC1hbGlnbjogbGVmdDtcblx0fVxuXG5cdGFydGljbGUge1xuXHRcdGdyaWQtY29sdW1uOiA1IC8gc3BhbiA4O1xuXHRcdG1heC13aWR0aDogMTAwJTtcblx0XHRtaW4td2lkdGg6IDA7XG5cdFx0Y2xlYXI6IGJvdGg7XG5cdH1cblxuXHRAbWVkaWEgKG1heC13aWR0aDogOTMwcHgpIHtcblx0XHRhcnRpY2xlIHtcblx0XHRcdHdpZHRoOiAxMDAlO1xuXHRcdFx0bWF4LXdpZHRoOiAxMDAlO1xuXHRcdFx0bWFyZ2luLWxlZnQ6IDA7XG5cdFx0XHRtYXJnaW4tdG9wOiAycmVtO1xuXHRcdH1cblxuXHRcdGFydGljbGUgOmdsb2JhbChoMSkge1xuXHRcdFx0dGV4dC1hbGlnbjogY2VudGVyO1xuXHRcdH1cblx0fVxuXG5cdEBtZWRpYSAobWF4LXdpZHRoOiAxMTAwcHgpIHtcblx0XHRuYXYge1xuXHRcdFx0cmlnaHQ6IDA7XG5cdFx0XHR0cmFuc2l0aW9uOiAwLjJzO1xuXHRcdFx0bWFyZ2luLXRvcDogMDtcblx0XHRcdGhlaWdodDogMTAwJTtcblx0XHRcdHotaW5kZXg6IDk5O1xuXHRcdFx0Ym94LXNoYWRvdzogMCAxcHggNHB4IDJweCByZ2JhKDEsIDEsIDEsIDAuMSk7XG5cdFx0XHRwYWRkaW5nLWxlZnQ6IDVyZW07XG5cdFx0XHR0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoMTAwJSk7XG5cdFx0fVxuXG5cdFx0YXJ0aWNsZSB7XG5cdFx0XHRncmlkLWNvbHVtbjogMSAvIHNwYW4gMTI7XG5cdFx0XHRwYWRkaW5nOiAwIDZyZW07XG5cdFx0fVxuXG5cdFx0Lm1lbnUge1xuXHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRwb3NpdGlvbjogZml4ZWQ7XG5cdFx0XHR0b3A6IDEuOHJlbTtcblx0XHRcdHJpZ2h0OiAxLjhyZW07XG5cdFx0XHR6LWluZGV4OiA5OTk7XG5cdFx0XHRoZWlnaHQ6IDMuMnJlbTtcblx0XHRcdHBhZGRpbmc6IDZweCA3cHggNnB4IDdweDtcblx0XHRcdGJhY2tncm91bmQ6ICNmZmY7XG5cdFx0XHRib3gtc2l6aW5nOiBib3JkZXItYm94O1xuXHRcdFx0Ym9yZGVyLXJhZGl1czogM3B4O1xuXHRcdFx0LyogYm9yZGVyOiAxcHggc29saWQgZ3JleTsgKi9cblx0XHRcdGJveC1zaGFkb3c6IDAgMXB4IDVweCByZ2JhKDAsIDAsIDAsIDAuMTUpO1xuXHRcdFx0Y3Vyc29yOiBwb2ludGVyO1xuXHRcdH1cblxuXHRcdC5pY29uIHtcblx0XHRcdHdpZHRoOiAycmVtO1xuXHRcdFx0aGVpZ2h0OiAycmVtO1xuXHRcdFx0ZGlzcGxheTogaW5saW5lLWJsb2NrO1xuXHRcdFx0ZGlzcGxheTogZmxleDtcblx0XHRcdGp1c3RpZnktY29udGVudDogY2VudGVyO1xuXHRcdFx0YWxpZ24taXRlbXM6IGNlbnRlcjtcblx0XHR9XG5cblx0XHQuaWNvbiBzdmcge1xuXHRcdFx0d2lkdGg6IDEwMCU7XG5cdFx0XHRoZWlnaHQ6IDEwMCU7XG5cdFx0fVxuXG5cdFx0bGkuc29sbzpmaXJzdC1jaGlsZCB7XG5cdFx0XHRtYXJnaW4tdG9wOiAwO1xuXHRcdH1cblx0fVxuXG5cdC5tZW51X3Nob3cge1xuXHRcdHRyYW5zZm9ybTogdHJhbnNsYXRlWCgwKTtcblx0fVxuXG5cdEBtZWRpYSAobWF4LXdpZHRoOiA1NTBweCkge1xuXHRcdG5hdiB7XG5cdFx0XHR3aWR0aDogMTAwJTtcblx0XHR9XG5cblx0XHRhcnRpY2xlIHtcblx0XHRcdHBhZGRpbmc6IDBweDtcblx0XHRcdC8qIGRpc3BsYXk6IGJsb2NrO8O3ICovXG5cdFx0fVxuXG5cdFx0LmNvbnRhaW5lciB7XG5cdFx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRcdG92ZXJmbG93OiBoaWRkZW47XG5cdFx0fVxuXG5cdFx0YXJ0aWNsZSA+IDpnbG9iYWwoKikge1xuXHRcdFx0bWFyZ2luLWxlZnQ6IDMwcHggIWltcG9ydGFudDtcblx0XHRcdG1hcmdpbi1yaWdodDogMzBweCAhaW1wb3J0YW50O1xuXHRcdH1cblxuXHRcdGFydGljbGUgPiA6Z2xvYmFsKHByZTpub3QoLmxhbmd1YWdlLXNpZykpIHtcblx0XHRcdG1hcmdpbi1sZWZ0OiAwICFpbXBvcnRhbnQ7XG5cdFx0XHRtYXJnaW4tcmlnaHQ6IDAgIWltcG9ydGFudDtcblx0XHRcdGJvcmRlci1yYWRpdXM6IDAgIWltcG9ydGFudDtcblx0XHR9XG5cblx0XHRhcnRpY2xlID4gOmdsb2JhbCgubGFuZ3VhZ2Utc2lnKSB7XG5cdFx0XHR3aWR0aDogY2FsYygxMDAlIC0gNnJlbSk7XG5cdFx0fVxuXG5cdFx0YXJ0aWNsZSA6Z2xvYmFsKHByZSkge1xuXHRcdFx0cGFkZGluZzogMXJlbSAzcmVtO1xuXHRcdH1cblx0fVxuXG5cdEBtZWRpYSAobWF4LXdpZHRoOiAzMzBweCkge1xuXHRcdC5tZW51IHtcblx0XHRcdHRvcDogNy44cmVtO1xuXHRcdH1cblx0fVxuPC9zdHlsZT5cblxuPHN2ZWx0ZTp3aW5kb3cgYmluZDpzY3JvbGxZIGJpbmQ6aW5uZXJXaWR0aD17d2lkdGh9IC8+XG5cbjxzdmVsdGU6aGVhZD5cblx0PHRpdGxlPm1kc3ZleCBkb2NzITwvdGl0bGU+XG48L3N2ZWx0ZTpoZWFkPlxuXG57I2lmIHdpZHRoIDwgMTEwMH1cblx0PHNwYW4gY2xhc3M9XCJtZW51XCIgb246Y2xpY2s9eygpID0+IChtZW51X3Nob3cgPSAhbWVudV9zaG93KX0+XG5cdFx0PHNwYW4gY2xhc3M9XCJpY29uXCI+XG5cdFx0XHR7I2lmICFtZW51X3Nob3d9XG5cdFx0XHRcdDxzdmdcblx0XHRcdFx0XHRhcmlhLWhpZGRlbj1cInRydWVcIlxuXHRcdFx0XHRcdGZvY3VzYWJsZT1cImZhbHNlXCJcblx0XHRcdFx0XHRkYXRhLXByZWZpeD1cImZhc1wiXG5cdFx0XHRcdFx0ZGF0YS1pY29uPVwiYmFyc1wiXG5cdFx0XHRcdFx0Y2xhc3M9XCJzdmctaW5saW5lLS1mYSBmYS1iYXJzIGZhLXctMTRcIlxuXHRcdFx0XHRcdHJvbGU9XCJpbWdcIlxuXHRcdFx0XHRcdHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIlxuXHRcdFx0XHRcdHZpZXdCb3g9XCIwIDAgNDQ4IDUxMlwiPlxuXHRcdFx0XHRcdDxwYXRoXG5cdFx0XHRcdFx0XHRmaWxsPVwiY3VycmVudENvbG9yXCJcblx0XHRcdFx0XHRcdGQ9XCJNMTYgMTMyaDQxNmM4LjgzNyAwIDE2LTcuMTYzXG5cdFx0XHRcdFx0XHQxNi0xNlY3NmMwLTguODM3LTcuMTYzLTE2LTE2LTE2SDE2QzcuMTYzIDYwIDAgNjcuMTYzIDAgNzZ2NDBjMCA4LjgzN1xuXHRcdFx0XHRcdFx0Ny4xNjMgMTYgMTYgMTZ6bTAgMTYwaDQxNmM4LjgzNyAwIDE2LTcuMTYzXG5cdFx0XHRcdFx0XHQxNi0xNnYtNDBjMC04LjgzNy03LjE2My0xNi0xNi0xNkgxNmMtOC44MzcgMC0xNiA3LjE2My0xNiAxNnY0MGMwXG5cdFx0XHRcdFx0XHQ4LjgzNyA3LjE2MyAxNiAxNiAxNnptMCAxNjBoNDE2YzguODM3IDAgMTYtNy4xNjNcblx0XHRcdFx0XHRcdDE2LTE2di00MGMwLTguODM3LTcuMTYzLTE2LTE2LTE2SDE2Yy04LjgzNyAwLTE2IDcuMTYzLTE2IDE2djQwYzBcblx0XHRcdFx0XHRcdDguODM3IDcuMTYzIDE2IDE2IDE2elwiIC8+XG5cdFx0XHRcdDwvc3ZnPlxuXHRcdFx0ezplbHNlfVxuXHRcdFx0XHQ8c3ZnXG5cdFx0XHRcdFx0YXJpYS1oaWRkZW49XCJ0cnVlXCJcblx0XHRcdFx0XHRmb2N1c2FibGU9XCJmYWxzZVwiXG5cdFx0XHRcdFx0ZGF0YS1wcmVmaXg9XCJmYXNcIlxuXHRcdFx0XHRcdGRhdGEtaWNvbj1cInRpbWVzXCJcblx0XHRcdFx0XHRjbGFzcz1cInN2Zy1pbmxpbmUtLWZhIGZhLXRpbWVzIGZhLXctMTFcIlxuXHRcdFx0XHRcdHJvbGU9XCJpbWdcIlxuXHRcdFx0XHRcdHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIlxuXHRcdFx0XHRcdHZpZXdCb3g9XCIwIDAgMzUyIDUxMlwiPlxuXHRcdFx0XHRcdDxwYXRoXG5cdFx0XHRcdFx0XHRmaWxsPVwiY3VycmVudENvbG9yXCJcblx0XHRcdFx0XHRcdGQ9XCJNMjQyLjcyIDI1NmwxMDAuMDctMTAwLjA3YzEyLjI4LTEyLjI4IDEyLjI4LTMyLjE5XG5cdFx0XHRcdFx0XHQwLTQ0LjQ4bC0yMi4yNC0yMi4yNGMtMTIuMjgtMTIuMjgtMzIuMTktMTIuMjgtNDQuNDggMEwxNzYgMTg5LjI4XG5cdFx0XHRcdFx0XHQ3NS45MyA4OS4yMWMtMTIuMjgtMTIuMjgtMzIuMTktMTIuMjgtNDQuNDggMEw5LjIxIDExMS40NWMtMTIuMjhcblx0XHRcdFx0XHRcdDEyLjI4LTEyLjI4IDMyLjE5IDAgNDQuNDhMMTA5LjI4IDI1NiA5LjIxIDM1Ni4wN2MtMTIuMjggMTIuMjgtMTIuMjhcblx0XHRcdFx0XHRcdDMyLjE5IDAgNDQuNDhsMjIuMjQgMjIuMjRjMTIuMjggMTIuMjggMzIuMiAxMi4yOCA0NC40OCAwTDE3NlxuXHRcdFx0XHRcdFx0MzIyLjcybDEwMC4wNyAxMDAuMDdjMTIuMjggMTIuMjggMzIuMiAxMi4yOCA0NC40OFxuXHRcdFx0XHRcdFx0MGwyMi4yNC0yMi4yNGMxMi4yOC0xMi4yOCAxMi4yOC0zMi4xOSAwLTQ0LjQ4TDI0Mi43MiAyNTZ6XCIgLz5cblx0XHRcdFx0PC9zdmc+XG5cdFx0XHR7L2lmfVxuXHRcdDwvc3Bhbj5cblx0PC9zcGFuPlxuey9pZn1cblxuPG1haW4+XG5cdDxDaGVhdHNoZWV0IC8+XG5cdDxkaXYgc3R5bGU9XCJwb3NpdGlvbjogcmVsYXRpdmU7XCI+XG5cblx0XHR7I2lmIHBvc2l0aW9ufVxuXHRcdFx0PG5hdiBzdHlsZT1cInBvc2l0aW9uOiB7cG9zaXRpb259O1wiIGNsYXNzOm1lbnVfc2hvdz5cblx0XHRcdFx0PHVsPlxuXG5cdFx0XHRcdFx0eyNlYWNoIG5hdiBhcyBbdGl0bGUsIGhyZWYsIGNoaWxkcmVuXX1cblx0XHRcdFx0XHRcdDxsaSBjbGFzcz17Y2hpbGRyZW4gPyAnc29sbycgOiAnc29sbyd9PlxuXHRcdFx0XHRcdFx0XHQ8YVxuXHRcdFx0XHRcdFx0XHRcdGNsYXNzOmFjdGl2ZT17Y3VycmVudCA9PT0gaHJlZn1cblx0XHRcdFx0XHRcdFx0XHR7aHJlZn1cblx0XHRcdFx0XHRcdFx0XHRvbjpjbGljaz17KCkgPT4gKG1lbnVfc2hvdyA9IGZhbHNlKSAmJiAoY3VycmVudCA9IGhyZWYpfT5cblx0XHRcdFx0XHRcdFx0XHR7dGl0bGV9XG5cdFx0XHRcdFx0XHRcdDwvYT5cblx0XHRcdFx0XHRcdFx0eyNpZiBjaGlsZHJlbn1cblx0XHRcdFx0XHRcdFx0XHQ8dWw+XG5cdFx0XHRcdFx0XHRcdFx0XHR7I2VhY2ggY2hpbGRyZW4gYXMgW2NoaWxkX3RpdGxlLCBjaGlsZF9saW5rLCBpc19jb2RlXX1cblx0XHRcdFx0XHRcdFx0XHRcdFx0PGxpPlxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHsjaWYgaXNfY29kZX1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdDxhXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNsYXNzOmFjdGl2ZT17Y3VycmVudCA9PT0gY2hpbGRfbGlua31cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0b246Y2xpY2s9eygpID0+IChtZW51X3Nob3cgPSBmYWxzZSl9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGhyZWY9e2NoaWxkX2xpbmt9PlxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQ8Y29kZT57Y2hpbGRfdGl0bGV9PC9jb2RlPlxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0PC9hPlxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHs6ZWxzZX1cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdDxhXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGNsYXNzOmFjdGl2ZT17Y3VycmVudCA9PT0gY2hpbGRfbGlua31cblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0b246Y2xpY2s9eygpID0+IChtZW51X3Nob3cgPSBmYWxzZSl9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGhyZWY9e2NoaWxkX2xpbmt9PlxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7Y2hpbGRfdGl0bGV9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQ8L2E+XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ey9pZn1cblx0XHRcdFx0XHRcdFx0XHRcdFx0PC9saT5cblx0XHRcdFx0XHRcdFx0XHRcdHsvZWFjaH1cblx0XHRcdFx0XHRcdFx0XHQ8L3VsPlxuXHRcdFx0XHRcdFx0XHR7L2lmfVxuXHRcdFx0XHRcdFx0PC9saT5cblx0XHRcdFx0XHR7L2VhY2h9XG5cdFx0XHRcdFx0PGxpIGNsYXNzPVwibWluaVwiPlxuXHRcdFx0XHRcdFx0PGEgaHJlZj1cIi9wbGF5Z3JvdW5kXCI+cGxheWdyb3VuZDwvYT5cblx0XHRcdFx0XHQ8L2xpPlxuXHRcdFx0XHRcdDxsaSBjbGFzcz1cIm1pbmlcIj5cblx0XHRcdFx0XHRcdDxhIGhyZWY9XCJodHRwczovL3d3dy5naXRodWIuY29tL3BuZ3duL21kc3ZleFwiPmdpdGh1YjwvYT5cblx0XHRcdFx0XHQ8L2xpPlxuXHRcdFx0XHQ8L3VsPlxuXHRcdFx0PC9uYXY+XG5cdFx0ey9pZn1cblxuXHRcdDxkaXYgY2xhc3M9XCJjb250YWluZXJcIj5cblx0XHRcdDxhcnRpY2xlIGJpbmQ6dGhpcz17cm9vdH0+XG5cdFx0XHRcdDxzbG90IC8+XG5cdFx0XHRcdHtAaHRtbCBkb2NzfVxuXHRcdFx0PC9hcnRpY2xlPlxuXHRcdDwvZGl2PlxuXHQ8L2Rpdj5cbjwvbWFpbj5cbiJdLCJuYW1lcyI6WyJzdG9yZXMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXVQQSxvQkFFTTttQkFERyxVQUFVOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O3FCQ2dNVixHQUFTOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBRmpCLG9CQTRDTztHQTNDTixvQkEwQ087Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FwQkwsb0JBa0JNO0dBVEwsb0JBUThEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBckMvRCxvQkFrQk07R0FUTCxvQkFRMEI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O2dEQW1DbkIsR0FBRzs7O2dDQUFSLE1BQUk7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzZDQUhlLEdBQVE7Ozs7OztHQUEvQixvQkEyQ007R0ExQ0wsb0JBeUNLOzs7Ozs7Ozs7R0FOSixvQkFFSztHQURKLG9CQUFvQzs7R0FFckMsb0JBRUs7R0FESixvQkFBd0Q7Ozs7K0NBckNsRCxHQUFHOzs7K0JBQVIsTUFBSTs7Ozs7Ozs7Ozs7Ozs7OztvQ0FBSixNQUFJOzs7OzhDQUhlLEdBQVE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozt1REFhbEIsR0FBUTs7O2tDQUFiLE1BQUk7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQURQLG9CQW9CSzs7Ozs7Ozs7OztzREFuQkcsR0FBUTs7O2lDQUFiLE1BQUk7Ozs7Ozs7Ozs7Ozs7Ozs7c0NBQUosTUFBSTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7K0JBY0QsR0FBVzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztzQ0FETixHQUFVOzt5Q0FGRixHQUFPLHVCQUFLLEdBQVU7Ozs7R0FEckMsb0JBS0k7Ozs7Ozs7Ozs7MENBSlcsR0FBTyx1QkFBSyxHQUFVOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OytCQUo3QixHQUFXOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O3NDQURaLEdBQVU7O3lDQUZGLEdBQU8sdUJBQUssR0FBVTs7OztHQURyQyxvQkFLSTtHQURILG9CQUEwQjs7Ozs7Ozs7OzswQ0FIWixHQUFPLHVCQUFLLEdBQVU7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O2tCQUZqQyxHQUFPOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBRGIsb0JBZ0JLOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7MEJBckJOLEdBQUs7Ozs7Ozs7Ozs7NkJBRUYsR0FBUTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7eUNBTEUsR0FBTyxpQkFBSyxHQUFJOzswREFGckIsR0FBUSxPQUFHLE1BQU0sR0FBRyxNQUFNOzs7O0dBQXJDLG9CQThCSztHQTdCSixvQkFLSTs7Ozs7Ozs7Ozs7Ozs7MENBSlcsR0FBTyxpQkFBSyxHQUFJOzs7b0JBSzFCLEdBQVE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsyQkFoRWYsR0FBSyxNQUFHLElBQUk7OzhCQW9EVixHQUFROzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBSmYsb0JBMERPOzs7R0F4RE4sb0JBdURNOzs7R0FOTCxvQkFLTTtHQUpMLG9CQUdVOzs7Ozs7O2NBREYsSUFBSTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7aUJBdEdWLEdBQUssTUFBRyxJQUFJOzs7Ozs7Ozs7Ozs7O29CQW9EVixHQUFROzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztLQWxlVixJQUFJO0tBQ0osT0FBTyxHQUFHLENBQUM7S0FDWCxLQUFLLEdBQUcsSUFBSTtLQUNaLE9BQU87S0FDUCxRQUFRLEdBQUcsRUFBRTtTQUVULElBQUksS0FBS0EsUUFBTTs7OztPQUVqQixHQUFHO0dBQ1AsU0FBUyxFQUFFLGlCQUFpQjs7R0FFNUIsS0FBSztHQUNMLGFBQWE7S0FFWCxRQUFRLEVBQUUsZUFBZSxFQUFFLElBQUksSUFDL0IsU0FBUyxFQUFFLGNBQWMsRUFBRSxJQUFJOzs7R0FJakMsU0FBUztHQUNULGNBQWM7O0tBRVosWUFBWSxFQUFFLGlCQUFpQixFQUFFLElBQUk7S0FDckMsYUFBYSxFQUFFLGtCQUFrQixFQUFFLElBQUk7S0FDdkMsUUFBUSxFQUFFLGFBQWEsRUFBRSxJQUFJO0tBQzdCLGVBQWUsRUFBRSxtQ0FBbUMsRUFBRSxJQUFJO0tBQzFELGVBQWUsRUFBRSxtQ0FBbUMsRUFBRSxJQUFJO0tBQzFELFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJO0tBQ25DLGFBQWEsRUFBRSxrQkFBa0IsRUFBRSxJQUFJOzs7O0dBSXpDLFNBQVM7R0FDVCxjQUFjOztLQUVaLGVBQWUsRUFBRSxvQkFBb0IsRUFBRSxLQUFLO0tBQzVDLG1CQUFtQixFQUFFLHdCQUF3QixFQUFFLEtBQUs7S0FDcEQsbUJBQW1CLEVBQUUsd0JBQXdCLEVBQUUsS0FBSzs7O0dBR3RELGFBQWEsRUFBRSxvQkFBb0I7R0FFbkMsY0FBYyxFQUNkLG1CQUFtQixJQUNqQixRQUFRLEVBQUUsa0JBQWtCLEVBQUUsS0FBSztHQUVyQyxhQUFhLEVBQUUsa0JBQWtCOzs7VUFLMUIsYUFBYSxDQUFDLElBQUk7UUFDcEIsRUFBRSxPQUFPLE1BQU0sZUFBZSxLQUFLLENBQUMsSUFBSTtTQUN2QyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxFQUFFOzs7VUFHbEIsbUJBQW1CO01BQ3ZCLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxVQUFVLEdBQUcsSUFBSTttQkFDcEUsUUFBUSxHQUFHLFVBQVU7O21CQUVyQixRQUFRLEdBQUcsT0FBTzs7O1FBR2IsS0FBSyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQzdDLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxLQUFLLElBQUksSUFBSSxDQUFDLENBQUMsT0FBTyxLQUFLLElBQUk7UUFHeEMsSUFBSSxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQzs7UUFDdkIsSUFBSSxDQUFDLHFCQUFxQixHQUFHLE1BQU0sS0FBSyxNQUFNLENBQUMsV0FBVztHQUMvRCxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUs7bUJBQ2pCLE9BQU8sR0FBRyxNQUFNLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUMsRUFBRSxJQUFJOzs7O1dBSXJELElBQUksSUFBSSxLQUFLO1dBQ2IsR0FBRyxLQUFLLElBQUksQ0FBQyxxQkFBcUI7O09BQ3RDLEdBQUcsR0FBRyxDQUFDOzs7O21CQUdYLE9BQU8sR0FBRyxNQUFNLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLElBQUk7Ozs7O0NBTXhELE9BQU87TUFDRixNQUFNLEtBQUssU0FBUyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSTtTQUN6QyxFQUFFLEdBQUcsUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUU7R0FDdkUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxjQUFjOzs7RUFHeEIsbUJBQW1COzs7S0FHaEIsU0FBUyxHQUFHLEtBQUs7Ozs7Ozs7Ozs7Ozs7Ozs2Q0FpVmUsU0FBUyxJQUFJLFNBQVM7aURBNERsQyxTQUFTLEdBQUcsS0FBSyxxQkFBTSxPQUFPLEdBQUcsSUFBSTsrQ0FVaEMsU0FBUyxHQUFHLEtBQUs7K0NBT2pCLFNBQVMsR0FBRyxLQUFLOzs7O0dBc0J4QixJQUFJOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBamV2QixJQUFJLFdBQVcsT0FBTyxLQUFLLFFBQVEsSUFBSSxLQUFLLElBQUksbUJBQW1COzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsifQ==
