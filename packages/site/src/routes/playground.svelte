<script>
  import { onMount } from "svelte";
  import Repl from "../components/Repl/Repl.svelte";
  import { code_1, code_2, code_3, code_4, code_5 } from "./_source.js";

  let repl;
  let checked = "input";
  let width;

  $: is_mobile = width < 750;

  onMount(() => {
    repl.set({
      components: [
        {
          type: "svx",
          name: "App",
          source: code_1,
        },
        {
          type: "svelte",
          name: "Boinger",
          source: code_2,
        },
        {
          type: "svx",
          name: "Section",
          source: code_3,
        },
        {
          type: "svelte",
          name: "Count",
          source: code_4,
        },
        {
          type: "svelte",
          name: "Seriously",
          source: code_5,
        },
      ],
    });
  });

  function handle_select() {
    checked = checked === "input" ? "output" : "input";
  }
</script>

<style>
  .outer {
    position: absolute;
    top: 80px;
    left: 50px;
    right: 50px;
    bottom: 50px;
    margin: auto;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 0 10px 3px rgba(0, 0, 0, 0.2);
  }

  .inner {
    height: 100%;
    width: 100%;
  }

  .mobile .inner {
    width: 200%;
    height: calc(100% - 42px);
    transition: transform 0.3s;
  }

  .mobile .offset {
    transform: translate(-50%, 0);
  }

  .toggle-wrap {
    display: flex;
    position: absolute;
    user-select: none;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 42px;
    border-top: 1px solid var(--second);
    overflow: hidden;
  }

  .toggle label {
    margin: 0 0.5em 0;
    cursor: pointer;
    user-select: none;
  }

  .toggle input[type="radio"] {
    display: inline-block;
    margin-right: 0px;
    width: 50%;
    height: 0%;
    opacity: 0;
    position: relative;
    z-index: 1;
    cursor: pointer;
    user-select: none;
  }

  .toggle-wrapper {
    display: inline-block;
    vertical-align: middle;
    width: 40px;
    height: 20px;
    border-radius: 3.5em;
    position: relative;
    user-select: none;
  }

  .toggle-switcher {
    display: block;
    position: absolute;
    top: 2px;
    left: 2px;
    right: 100%;
    width: calc(50% - 4px);
    height: calc(100% - 4px);
    border-radius: 50%;
    background-color: #fff;
    transition: all 0.1s ease-out;
    z-index: 2;
    cursor: pointer;
    user-select: none;
  }

  .toggle-background {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    border-radius: 3.5em;
    background-color: cadetblue;
    transition: all 0.1s ease-out;
    cursor: pointer;
    user-select: none;
  }

  #output:checked ~ .toggle-switcher {
    right: 0;
    left: calc(50% + 2px);
  }

  #input:checked ~ .toggle-background {
    background-color: #333;
  }

  /* support Windows High Contrast Mode. Credit: Adrian Roselli https://twitter.com/aardrian/status/1021372139990134785 */

  @media (max-width: 750px) {
    .outer {
      position: absolute;
      top: 80px;
      left: 20px;
      right: 20px;
      bottom: 20px;
      margin: auto;
      border-radius: 5px;
      overflow: hidden;
      box-shadow: 0 0 10px 3px rgba(0, 0, 0, 0.2);
    }
  }
</style>

<svelte:window bind:innerWidth={width} />
<svelte:head>
  <title>mdsvex playground!</title>
</svelte:head>

<div class="outer" class:mobile={is_mobile}>
  <div class="inner" class:offset={checked === 'output'}>
    <Repl workersUrl="/workers" bind:this={repl} fixed={is_mobile} />
  </div>

  {#if is_mobile}
    <div class="toggle-wrap">
      <div class="toggle">
        <label for="input">input</label>
        <span class="toggle-wrapper">
          <input
            type="radio"
            name="theme"
            id="input"
            bind:group={checked}
            value="input" />
          <input
            type="radio"
            name="theme"
            id="output"
            bind:group={checked}
            value="output" />
          <span
            aria-hidden="true"
            class="toggle-background"
            on:click={handle_select} />
          <span
            aria-hidden="true"
            class="toggle-switcher"
            on:click={handle_select} />
        </span>
        <label for="output">output</label>
      </div>
    </div>
  {/if}
</div>
