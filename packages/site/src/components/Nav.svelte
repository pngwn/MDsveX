<script>
  import { stores } from "@sapper/app";
  import GithubIcon from "./GithubIcon.svelte";

  const { page } = stores();

  let w;
  const links = [
    ["/", "mdsvex"],
    ["/docs", "docs"],
    ["/playground", "try"],
    ["https://www.github.com/pngwn/mdsvex", "github"]
  ];

  // $: filtered_links = is_small
  //   ? links.filter(([href]) => href === $page.path)
  //   : links;

  // $: is_small = process.browser && w && w < 930;

  // $: console.log(is_small, w);
</script>

<style>
  nav {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  ul {
    list-style: none;
    display: flex;
    justify-content: center;
    padding: 10px;
    margin: 10px;
  }

  li {
    margin: 0 10px;
  }

  a {
    border: none;
    font-weight: 300;
    color: #333;
    font-family: "roboto-full";
    display: flex;
    align-items: center;
  }

  a:hover {
    text-decoration: underline;
    border: none;
    color: #000;
  }

  a :global(svg) {
    margin: 3px 5px 0 0;
    width: 20px;
    height: 20px;
    opacity: 0.8;
  }

  a:hover :global(svg) {
    opacity: 1;
  }

  /* @media (max-width: 930px) {
    nav {
      left: 0px;
      width: 100%;
    }
  } */
</style>

<svelte:window bind:innerWidth={w} />

<nav>
  <ul>
    {#each links as [href, title]}
      <!-- {#if title === 'github'}
        <li>
          <a
            title="link to github repository"
            href="https://www.github.com/pngwn/mdsvex">
            <GithubIcon />
          </a>
        </li>
      {:else} -->
      <li>
        <a {href}>{title}</a>
      </li>
      <!-- {/if} -->
    {/each}
  </ul>
</nav>

<!-- <li>

    </li> -->
