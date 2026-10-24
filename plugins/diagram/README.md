# @mdsvex/plugin-diagram

Diagrams for [mdsvex](https://mdsvex.pngwn.io). Each `mermaid` fence is drawn as a diagram, by [pele](https://pele.run) at build time or by [mermaid](https://mermaid.js.org) in the browser.

```bash
pnpm add --save-dev @mdsvex/plugin-diagram@next pele
```

```js
// vite.config.js
import { mdsvex } from 'mdsvex';
import { diagram } from '@mdsvex/plugin-diagram';

export default {
	plugins: [mdsvex({ plugins: [diagram()] })],
};
```

````md
```mermaid title="How a page is built" caption="Each step runs once per file."
graph LR
  accTitle: How a page is built
  A[Markdown] --> B{Parse} --> C[Svelte]
```
````

```html
<figure class="diagram diagram-pele">
	<figcaption class="diagram-title">How a page is built</figcaption>
	<div class="diagram-svg">
		<svg
			class="pele pele-flowchart"
			role="graphics-document document"
			...
		></svg>
	</div>
	<details class="diagram-source">
		<summary>Diagram source</summary>
		<pre>...</pre>
	</details>
	<div class="diagram-caption">Each step runs once per file.</div>
</figure>
```

It needs Svelte 5.20 or later.

## Engines

`pele` and `mermaid` are both optional peer dependencies. Install the one you want.

| `engine`          | draws with                                                   |
| ----------------- | ------------------------------------------------------------ |
| `'auto'`, default | pele when it is installed, mermaid otherwise                 |
| `'pele'`          | pele, at build time, the page ships the SVG and no script    |
| `'mermaid'`       | mermaid, in the browser, loaded on a page that has a diagram |

```js
diagram({ engine: 'mermaid' });
```

**The engine is chosen once, when `diagram()` runs** in your Vite config. It resolves `pele` and `mermaid` from where the plugin is installed, which is where a package manager puts a peer dependency. With neither installed, or with `engine` naming one that is not, `diagram()` throws a `DiagramError` that names the package and the command to install it. The page only ever imports the component of the engine that was chosen, so a package you did not install never reaches your bundler.

### pele

The diagram is drawn when its fence closes, in the parse, with pele's `render`. The page ships the SVG, so it shows with JavaScript off, before hydration and in a feed, and the source sits under it in a closed "Diagram source" disclosure.

- **Fonts.** At build time pele measures labels with a built-in table of widths for `sans-serif`. Pass the font of your site so the boxes fit it: `diagram({ pele: { fontFamily: 'Inter, sans-serif' } })`, and set `--pele-font` to the same family.
- **Size.** The SVG scales down to its container. It is laid out once, at build time, so a wide flowchart does not switch to vertical on a narrow screen.
- **Ids.** Each diagram gets its own `idPrefix` (`diagram`, `diagram-1`, ...) from the document's ids, so the ids inside two diagrams, and the ones that name them for screen readers, never collide.
- **A diagram pele can't draw** is a `diagram_error` warning at the line of its fence, and the page shows "The diagram could not be drawn" with pele's reason and the source. `diagram({ strict: true })` fails the build there instead, with a `DiagramError` whose `code` is `render`.
- **`pele`** passes [render options](https://pele.run/api) to every diagram, such as `fontFamily`, `fontSize`, `padding`, `links`, `images` or `config`. The plugin sets `idPrefix`.
- **Node.** pele is only published as ES modules, and the plugin loads it synchronously with `require`, which needs Node 20.19, 22.12 or later.

pele's client `mount()`, which lays a diagram out again when its container changes width and adds zoom, is not used. It would put pele in every page with a diagram, for what the static SVG mostly gives already. An option for it can come later.

#### Theme

pele draws with CSS variables, so light and dark need no second render. The stylesheet sets dark values for a reader whose system is dark. A site with its own switch sets them on `.diagram`:

```css
:root[data-theme='dark'] .diagram {
	--pele-bg: #1c1c1f;
	--pele-fg: #e8e8ea;
	--pele-line: #d4d4d8;
	--pele-surface: #2a2a2f;
	--pele-border: #6f6f78;
}
```

The variables are `--pele-bg`, `--pele-fg`, `--pele-muted`, `--pele-line`, `--pele-surface`, `--pele-surface-alt`, `--pele-border`, `--pele-accent`, `--pele-critical`, `--pele-font`, `--pele-font-mono`, `--pele-radius` and `--pele-series-1` to `--pele-series-8`, see [pele's theming](https://pele.run/theming). Colours a diagram sets itself with `style`, `classDef` or `linkStyle` stay as they are.

#### Where pele differs from mermaid

pele reads Mermaid syntax and draws every diagram type built into Mermaid 12.1, with its own layout. From [its compatibility notes](https://pele.run/compatibility):

- **Layout differs.** Nodes, spacing and edges are placed by pele's own engine. A flowchart subgraph keeps its own `direction` when it links to nodes outside it.
- **No mermaid themes.** `theme` and `themeVariables` do nothing, colours come from the CSS variables above.
- **No HTML in labels.** Labels are SVG text with line breaks, bold and italics.
- **No JavaScript callbacks.** A `click` that names a function is ignored, one that opens a link works.
- **No ZenUML** and no other external Mermaid plugins.
- **Icons and math need a resolver.** `fa:` icons and `$$...$$` labels show as text unless you pass `icons` or `math` in `pele`. Architecture and tree view diagrams have their own symbols.
- **Limits.** A diagram over 50,000 characters, an SVG over 4,000,000 or a flowchart over 5,000 edges is not drawn. `limit`, `outputLimit` and `maxEdges` raise them.

#### Links, images and icons

The diagrams are part of your pages, written by whoever writes your markdown, and pele treats them so ([its security notes](https://pele.run/security)). The plugin keeps pele's defaults:

- **Text is escaped**, and no label can hold HTML or a script.
- **Links** open only `http`, `https`, `mailto`, `tel` and relative urls, with `rel="noopener"`. `javascript:`, `data:` and `vbscript:` are always refused. `links: false` turns them off, `linkSchemes` and `linkRel` change them.
- **Images** load only from `http` and `https`, and do so when the page shows them. `images: false` turns them off.
- **Icons and math** are not drawn, as there is no resolver. A resolver you pass in `pele` returns markup pele inserts as it is, so give it a fixed set of icons and never markup built from the name.

Render options come from your config only. A diagram's own `%%{init}%%` settings are Mermaid configuration for that diagram, not render options.

### mermaid

The server renders the fence as code. Once the page has mounted, the component imports mermaid and draws the diagram in place of the code, which moves into the "Diagram source" disclosure. Without JavaScript, or when a diagram does not parse, the reader sees the code. Diagrams render with mermaid's `securityLevel: 'strict'`, and the theme follows the reader's colour scheme unless `diagram({ engine: 'mermaid', theme: 'neutral' })` sets one.

## Both engines

- **The fence is wrapped, not replaced.** Each `mermaid` fence is put inside a `diagram` directive, so the code still renders through the highlighter and whatever replaces `pre`, such as `@mdsvex/plugin-code-blocks`, and the plugin works inside a code group of `@mdsvex/plugin-tabs`.
- **The `title` and `caption` of the fence** go above and below the diagram, and the stylesheet hides the copies the highlighter or a code block put around the code.
- **Name a diagram for screen readers** with `accTitle:` and `accDescr:`, which become the title and description of the SVG.
- **The built in highlighter has no grammar for mermaid**, so the code renders plain and the build warns once per file that there is no highlighter for the language.

## Styles

The stylesheet's selectors are inside `:where()`, so any rule of yours wins. The classes are `diagram`, `diagram-pele` or `diagram-mermaid`, `diagram-title`, `diagram-svg`, `diagram-source`, `diagram-error` and `diagram-caption`. `diagram({ css: false })` leaves it out, and it is also exported as `@mdsvex/plugin-diagram/diagram.css`.

## Your own component

Export a `diagram` from a [directives module](https://mdsvex.pngwn.io/docs#declaring-directives) and it replaces the plugin's. It gets `children` (the code as rendered), `title` and `caption`, and with pele `svg` or `error`, with mermaid `code` and `theme`. The plugin's own are `@mdsvex/plugin-diagram/PeleDiagram.svelte` and `@mdsvex/plugin-diagram/MermaidDiagram.svelte`.
