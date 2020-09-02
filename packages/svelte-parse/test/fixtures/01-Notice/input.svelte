<script context="module">
  const allowedProps = ['active', 'position', 'duration'];

  export function filterProps(props) {
    const newProps = {}

    Object.keys(props).forEach(key => {
      if (allowedProps.includes(key)) newProps[key] = props[key]
    })

    return newProps
  }
</script>

<script>
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import Notices, { notices } from './Notices.svelte'

  const dispatch = createEventDispatcher()

  export let active = true
  export let position = 'is-top'
  export let duration = 2000
  export let transitionOut = true

  let el
  let parent
  let timer

  $: transitionY = ~position.indexOf('is-top') ? -200 : 200

  export function close() {
    active = false
  }

  function remove() {
    clearTimeout(timer)

    // Just making sure
    active = false

    dispatch('destroyed')
  }

  async function setupContainers() {
    await tick

    if (!notices.top) {
      notices.top = new Notices({
        target: document.body,
        props: {
          position: 'top'
        },
      });
    }

    if (!notices.bottom) {
      notices.bottom = new Notices({
        target: document.body,
        props: {
          position: 'bottom',
        },
      });
    }
  }

  function chooseParent() {
    parent = notices.top
    if (position && position.indexOf('is-bottom') === 0) parent = notices.bottom

    parent.insert(el)
  }

  onMount(async () => {
    await setupContainers()
    chooseParent()

    timer = setTimeout(() => {
      close()
    }, duration)
  })
</script>

<style lang="scss">
  .notice {
    display: inline-flex;
    pointer-events: auto;

    &.is-top,
    &.is-bottom {
      align-self: center;
    }

    &.is-top-left,
    &.is-bottom-left {
      align-self: flex-start;
    }

    &.is-top-right,
    &.is-bottom-right {
      align-self: flex-end;
    }
  }
</style>

{#if active}
  <div
    class="notice {position}"
    aria-hidden={!active}
    in:fly={{ y: transitionY }}
    out:fade={{ duration: transitionOut ? 400 : 0 }}
    on:outroend={remove}
    bind:this={el}>

    <slot />
  </div>
{/if}
