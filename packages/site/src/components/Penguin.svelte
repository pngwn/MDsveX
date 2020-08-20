<script>
  import { tweened } from "svelte/motion";
  import { onMount } from "svelte";

  export let walk = false;

  let pos = tweened(0);
  let flip;
  let walking = false;
  let innerWidth;

  const make_duration = (a, b, d) => Math.abs(a - b) * d;

  function start_walk() {
    walking = true;
    pos.set(to, { duration: make_duration($pos, from, 10) });
  }

  function stop_walk() {
    walking = false;
    pos.set($pos, { duration: 0 });
  }

  function correct_walk() {
    if (!walking) return;

    const duration = flip
      ? make_duration($pos, from, 10)
      : make_duration($pos, to, 10);

    pos.set(flip ? from : to, { duration });
  }

  $: to = innerWidth > 500 ? 218 : (innerWidth * 0.9) / 2 - 32;
  $: from = innerWidth > 500 ? -218 : ((innerWidth * 0.9) / 2 - 32) * -1;

  $: innerWidth && correct_walk();

  $: walk && !walking && start_walk();
  $: !walk && walking && stop_walk();

  $: $pos >= to &&
    (flip = true) &&
    pos.set(from, { duration: make_duration($pos, from, 10) });

  $: $pos <= from &&
    !(flip = false) &&
    pos.set(to, { duration: make_duration($pos, to, 10) });
</script>

<style>
  .one {
    margin-top: 80px;
    width: 64px;
    height: 70px;
    margin: 88px auto 0 auto;
  }

  @media (max-width: 930px) {
    .one {
      margin-top: 63px;
    }
  }
</style>

<svelte:window bind:innerWidth />

<div
  class="one"
  style="transform: translateX({$pos}px) rotateY({flip ? 180 : 0}deg);">

  <img alt="a penguing walking" src="/penguin{walk ? '' : '_static'}.gif" />
</div>
