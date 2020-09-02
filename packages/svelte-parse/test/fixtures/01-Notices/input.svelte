<script context="module">
  export const notices = {}
</script>

<script>
  export let position = 'top'

  let container
  let positionClass
  $: positionClass = position === 'top' ? 'is-top' : 'is-bottom'

  export function insert(el) {
    container.insertAdjacentElement('afterbegin', el)
  }
</script>

<style lang="scss">
  .notices {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    padding: 3em;
    z-index: 1000;
    pointer-events: none;
    display: flex;

    &.is-top {
      flex-direction: column;
    }

    &.is-bottom {
      flex-direction: column-reverse;
    }

    :global([class*='has-background-'] .text) {
      color: transparent !important;
      filter: invert(1) brightness(2.5) grayscale(1) contrast(9);
      background: inherit;
      background-clip: text !important;
      -webkit-background-clip: text !important;
    }
  }
</style>

<div class="notices {positionClass}" bind:this={container} />
