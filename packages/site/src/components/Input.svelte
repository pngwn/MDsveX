<script>
  import { typewriter } from "./typewriter.js";

  export let input = [];

  const colors = {
    yellow: "#fdfd96",
    teal: "teal",
    blue: "cyan",
    green: "#98fb98",
    grey: "#fafafa",
    red: "#fa8072",
    orange: "darkorange"
  };

  const dots = ["#fe5f56", "#ffbd2f", "#28c93f"];
</script>

<style>
  .container {
    width: 100%;
    max-width: 50rem;
    height: 25rem;
    margin: auto;
    background: #222;
    font-family: "fira-sub";
    padding: 6rem 1.5rem 1.5rem 1.5rem;
    font-size: 1.8rem;
    line-height: 5rem;
    border-radius: 3px;
    box-shadow: 0 0 10px 3px rgba(0, 0, 0, 0.2);
    position: relative;
  }

  .dots {
    position: absolute;
    left: 10px;
    top: 5px;
    width: 80px;
    height: 30px;
    display: flex;
    justify-content: flex-start;
    align-items: center;
  }

  .dots > span {
    width: 12px;
    height: 12px;
    background: #eee;
    margin: 0 5px;
    border-radius: 50%;
  }

  @media (max-width: 500px) {
    .container {
      margin: 0 5%;
      width: 90%;
    }
  }
</style>

<div class="container">
  <div class="dots">
    {#each dots as color}
      <span style="background:{color}" />
    {/each}
  </div>
  {#if input.length}
    {#each input as line, i}
      <div class="line" style="font-weight:{i === 0 ? 'bold' : 100};">
        {#each line as { text, color, l } (text)}
          <span
            in:typewriter={{ delay: l * 100, speed: 100 }}
            style="color: {colors[color]};">
            {text}
          </span>
        {/each}
      </div>
    {/each}
  {/if}
</div>
