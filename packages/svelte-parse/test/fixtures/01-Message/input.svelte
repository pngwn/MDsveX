<script>
  import { createEventDispatcher } from 'svelte'
  import { fade } from 'svelte/transition'
  import Icon from './Icon.svelte'

  export let type = ''
  export let active = true
  export let title = ''
  export let showClose = true
  export let autoClose = false
  export let duration = 5000
  export let size = ''
  export let iconSize = ''
  export let ariaCloseLabel = 'delete'

  let icon

  const dispatch = createEventDispatcher()

  if (autoClose) {
    setTimeout(() => {
      close = true
    }, duration)
  }

  $: newIconSize = iconSize || size || 'is-large'

  $: {
    switch (type) {
      case 'is-info':
        icon = 'info-circle'
        break
      case 'is-success':
        icon = 'check-circle'
        break
      case 'is-warning':
        icon = 'exclamation-triangle'
        break
      case 'is-danger':
        icon = 'exclamation-circle'
        break
      default:
        icon = null
    }
  }

  function close() {
    active = false
    dispatch('close', active)
  }
</script>

<style>
  .message-header {
    justify-content: space-between;
  }

  .message .media {
    padding-top: 0;
    border: 0;
  }
</style>

{#if active}
  <article class="message {type} {size}" transition:fade|local>
    {#if title || showClose}
      <div class="message-header">
        {#if title}
          <p>{title}</p>
        {/if}
        {#if showClose}
          <button class="delete" aria-label="ariaCloseLabel" on:click={close} />
        {/if}
      </div>
    {/if}
    <section class="message-body">
      <div class="media">
        {#if icon}
          <div class="media-left">
            <Icon {icon} size={newIconSize} />
          </div>
        {/if}
        <div class="media-content">
          <slot />
        </div>
      </div>
    </section>
  </article>
{/if}
