<script>
  import { onDestroy, onMount } from 'svelte'
  import { chooseAnimation, isEscKey } from '../../utils'

  export let active = true
  export let animation = 'scale'
  export let animProps = { start: 1.2 }
  export let size = ''
  export let showClose = true
  export let subComponent = null
  export let onBody = true

  let modal

  $: _animation = chooseAnimation(animation)
  $: {
    if (modal && active && onBody) {
      modal.parentNode.removeChild(modal)
      document.body.appendChild(modal)
    }
  }

  onMount(() => {
    
  })

  function close() {
    active = false
  }

  function keydown(e) {
    if (active && isEscKey(e)) {
      close()
    }
  }
</script>

<svelte:window on:keydown={keydown}></svelte:window>

{#if active}
  <div class="modal {size} is-active" bind:this={modal}>
    <div class="modal-background" on:click={close}></div>
    <div class="modal-content" transition:_animation|local={animProps}> <!-- transition:_animation|local -->
      <slot />
      <div class="sub-component"></div>
    </div>
    {#if showClose}
      <button class="modal-close is-large" aria-label="close" on:click={close}></button>
    {/if}
  </div>
{/if}