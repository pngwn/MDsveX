<script>
  import { stores } from "@sapper/app";
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import docs from "./_docs.svtext";
  import Cheatsheet from "../components/Cheatsheet.svx";

  let root;
  let scrollY = 0;
  let width = 1100;
  let current;
  let position = "";

  const { page } = stores();

  const nav = [
    ["Install", "docs#install-it"],
    ["Use", "docs#use-it"],
    [
      "Options",
      "docs#options",
      [
        ["extension", "docs#extension", true],
        ["smartypants", "docs#smartypants", true],
        ["layout", "docs#layout", true],
        ["remarkPlugins", "docs#remarkplugins--rehypeplugins", true],
        ["rehypePlugins", "docs#remarkplugins--rehypeplugins", true],
        ["highlight", "docs#highlight", true],
        ["frontmatter", "docs#frontmatter", true],
      ],
    ],
    [
      "Layouts",
      "docs#layouts",
      [
        ["named layouts", "docs#named-layouts", false],
        ["disabling layouts", "docs#disabling-layouts", false],
        ["custom components", "docs#custom-components", false],
      ],
    ],
    ["Frontmatter", "docs#frontmatter-1"],
    // ["Integrations", "docs#integrations"],
    ["Limitations", "docs#limitations"],
  ];

  $: root && typeof scrollY === "number" && width && calculate_positions();

  function remove_origin(href) {
    const re = new RegExp(`http(s*)://${$page.host}/`);
    return href.replace(re, "");
  }

  function calculate_positions() {
    if (root.getBoundingClientRect().top >= 0 && window.innerWidth > 1100) {
      position = "absolute";
    } else {
      position = "fixed";
    }

    const nodes = Array.from(root.children).filter(
      (v) =>
        (v.tagName === "H2" || v.tagName === "H3") &&
        v.innerText !== "Integrations" // its messing up my shit, will remove when I add the sidebar link for integrations
    );

    const last = nodes.length - 1;
    if (~~root.getBoundingClientRect().bottom === window.innerHeight) {
      console.log("boo");
      current = "docs" + remove_origin(nodes[last].children[0].href);
      return;
    }

    for (let node of nodes) {
      const { top } = node.getBoundingClientRect();
      if (top > 5) {
        break;
      }
      current = "docs" + remove_origin(node.children[0].href);
    }
  }

  // somebody save me

  onMount(() => {
    if (window !== undefined && window.location.hash) {
      const el = document.getElementById(window.location.hash.replace("#", ""));
      el && el.scrollIntoView();
    }

    calculate_positions();
  });

  let menu_show = false;
</script>

<style>
  nav {
    padding: 2rem 3rem;
    width: 30rem;
    top: 0;
    height: calc(100% - 7rem);
    overflow-y: scroll;
    margin-top: 4rem;
    background: #fafafa;
  }

  ul {
    list-style-type: none;
  }

  li {
    margin: 3rem 0px;
    position: relative;
    text-transform: uppercase;
    font-weight: bold;
    font-family: "lato-bold-sub";
  }

  ul > li > ul > li {
    margin: 1rem 0px;
    text-transform: none;
    font-weight: 400;
    font-family: "lato-sub";
  }

  a {
    text-decoration: none;
    border: none;
    color: #777;
    margin-left: 25px;
  }

  a code {
    position: relative;
    border-radius: 0.3rem;
    white-space: nowrap;
    color: #777;
    -webkit-font-smoothing: initial;
    background: #eee;
    padding: 0.3rem 0.6rem 0 0.6rem !important;
    transition: 0.3s;
    font-family: "fira-full";
    font-size: 1.4rem;
  }

  a:hover,
  a:hover code,
  a.active {
    color: #000;
  }

  a:hover code {
    background: #ccc;
  }

  a.active {
    font-weight: bold;
  }

  a.active code {
    background: #333;
    color: #eee;
  }

  article :global(h1) {
    margin-bottom: 4.6rem;
    font-family: "roboto-sub";
    font-weight: 100;
    font-size: 6rem;
  }

  article :global(h2) {
    margin: 5rem 0 3rem 0;
    border-bottom: 1px solid #ccc;
    font-family: "roboto-bold-full";
  }

  article :global(h3) {
    margin-bottom: 2rem;
    margin-top: 3rem;
    font-family: "roboto-bold-full";
  }

  article :global(h4) {
    margin-top: 2rem;
    margin-bottom: 2rem;
    font-family: "roboto-bold-full";
  }

  article :global(p) {
    font-family: "roboto-full";
  }

  article > :global(ul) {
    margin-left: 5rem !important;
  }

  article :global(code) {
    font-family: "fira-full";
    position: relative;
    border-radius: 0.3rem;
    color: #333;
    -webkit-font-smoothing: initial;
    background: #eee;
    padding: 0.2rem 0.4rem 0rem 0.4rem;
    white-space: pre;
    word-spacing: normal;
    word-break: normal;
    word-wrap: normal;
    font-size: 1.4rem;
  }

  article :global(pre code) {
    white-space: pre;
    background: none;
    color: #cbccc6;
    padding: 0;
    white-space: pre;
    word-spacing: normal;
    word-break: normal;
    word-wrap: normal;
    tab-size: 2rem;
  }

  article :global(pre) {
    background: #1f2430;
    color: #cbccc6;
    border-radius: 3px;
    padding: 1rem 2rem;
    margin: 0rem 0 4rem 0;
    font-size: 1.4rem;
    white-space: pre;
    word-spacing: normal;
    word-break: normal;
    word-wrap: normal;
    line-height: 2.5rem;
  }

  article :global(blockquote) {
    border: 1px solid #bebebe;
  }

  article :global(blockquote p) {
    color: #222;
    font-size: 1.8rem;
  }

  article :global(h3 code) {
    font-size: 2.2rem;
    /* background: none; */
  }

  article :global(h4 code) {
    font-size: 1.8rem;
    margin-bottom: 2rem;
  }

  article :global(pre.language-sig) {
    display: inline-block;
    padding: 0.2rem 0.7rem 0.2rem;
    margin: 2rem 0 0 0;
  }

  article :global(a) {
    color: #777;
    border-bottom: 1px solid #999;
  }

  article :global(a:hover) {
    color: #333;
    border-bottom: 1px solid #333;
  }

  article :global(h1 a),
  article :global(h2 a),
  article :global(h3 a),
  article :global(h4 a) {
    display: block;
    height: 100%;
    width: 0;
    padding-top: 1.23rem;
  }

  .mini {
    text-transform: lowercase;
    margin: 0;
    font-family: "fira-full";
    font-weight: normal;
    font-size: 1.6rem;
  }

  .container {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: 1fr;
    grid-gap: 3rem;
    margin-top: 3rem;
  }

  .container :global(h1) {
    font-size: 4rem;
    text-align: left;
  }

  article {
    grid-column: 5 / span 8;
    max-width: 100%;
    min-width: 0;
    clear: both;
  }

  @media (max-width: 930px) {
    article {
      width: 100%;
      max-width: 100%;
      margin-left: 0;
      margin-top: 2rem;
    }

    article :global(h1) {
      text-align: center;
    }
  }

  @media (max-width: 1100px) {
    nav {
      right: 0;
      transition: 0.2s;
      margin-top: 0;
      height: 100%;
      z-index: 99;
      box-shadow: 0 1px 4px 2px rgba(1, 1, 1, 0.1);
      padding-left: 5rem;
      transform: translateX(100%);
    }

    article {
      grid-column: 1 / span 12;
      padding: 0 6rem;
    }

    .menu {
      display: block;
      position: fixed;
      top: 1.8rem;
      right: 1.8rem;
      z-index: 999;
      height: 3.2rem;
      padding: 6px 7px 6px 7px;
      background: #fff;
      box-sizing: border-box;
      border-radius: 3px;
      /* border: 1px solid grey; */
      box-shadow: 0 1px 5px rgba(0, 0, 0, 0.15);
      cursor: pointer;
    }

    .icon {
      width: 2rem;
      height: 2rem;
      display: inline-block;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .icon svg {
      width: 100%;
      height: 100%;
    }

    li.solo:first-child {
      margin-top: 0;
    }
  }

  .menu_show {
    transform: translateX(0);
  }

  @media (max-width: 550px) {
    nav {
      width: 100%;
    }

    article {
      padding: 0px;
      /* display: block;÷ */
    }

    .container {
      display: block;
      overflow: hidden;
    }

    article > :global(*) {
      margin-left: 30px !important;
      margin-right: 30px !important;
    }

    article > :global(pre:not(.language-sig)) {
      margin-left: 0 !important;
      margin-right: 0 !important;
      border-radius: 0 !important;
    }

    article > :global(.language-sig) {
      width: calc(100% - 6rem);
    }

    article :global(pre) {
      padding: 1rem 3rem;
    }
  }

  @media (max-width: 330px) {
    .menu {
      top: 7.8rem;
    }
  }
</style>

<svelte:window bind:scrollY bind:innerWidth={width} />

<svelte:head>
  <title>mdsvex docs!</title>
</svelte:head>

{#if width < 1100}
  <span class="menu" on:click={() => (menu_show = !menu_show)}>
    <span class="icon">
      {#if !menu_show}
        <svg
          aria-hidden="true"
          focusable="false"
          data-prefix="fas"
          data-icon="bars"
          class="svg-inline--fa fa-bars fa-w-14"
          role="img"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 448 512">
          <path
            fill="currentColor"
            d="M16 132h416c8.837 0 16-7.163
            16-16V76c0-8.837-7.163-16-16-16H16C7.163 60 0 67.163 0 76v40c0 8.837
            7.163 16 16 16zm0 160h416c8.837 0 16-7.163
            16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0
            8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163
            16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0
            8.837 7.163 16 16 16z" />
        </svg>
      {:else}
        <svg
          aria-hidden="true"
          focusable="false"
          data-prefix="fas"
          data-icon="times"
          class="svg-inline--fa fa-times fa-w-11"
          role="img"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 352 512">
          <path
            fill="currentColor"
            d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19
            0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28
            75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28
            12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28
            32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176
            322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48
            0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z" />
        </svg>
      {/if}
    </span>
  </span>
{/if}

<main>
  <Cheatsheet />
  <div style="position: relative;">

    {#if position}
      <nav style="position: {position};" class:menu_show>
        <ul>

          {#each nav as [title, href, children]}
            <li class={children ? 'solo' : 'solo'}>
              <a
                class:active={current === href}
                {href}
                on:click={() => (menu_show = false) && (current = href)}>
                {title}
              </a>
              {#if children}
                <ul>
                  {#each children as [child_title, child_link, is_code]}
                    <li>
                      {#if is_code}
                        <a
                          class:active={current === child_link}
                          on:click={() => (menu_show = false)}
                          href={child_link}>
                          <code>{child_title}</code>
                        </a>
                      {:else}
                        <a
                          class:active={current === child_link}
                          on:click={() => (menu_show = false)}
                          href={child_link}>
                          {child_title}
                        </a>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
          <li class="mini">
            <a href="/playground">playground</a>
          </li>
          <li class="mini">
            <a href="https://www.github.com/pngwn/mdsvex">github</a>
          </li>
        </ul>
      </nav>
    {/if}

    <div class="container">
      <article bind:this={root}>
        <slot />
        {@html docs}
      </article>
    </div>
  </div>
</main>
