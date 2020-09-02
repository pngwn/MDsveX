<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import Notice, { filterProps } from '../Notice.svelte'

  /** Text or html message for snackbar
   * @svelte-prop {String} message
   * */
  export let message

  /** Duration snackbar will remain on screen
   * @svelte-prop {Number} [duration=3500]
   * */
  export let duration = 3500

  /** Where the snackbar will show on the screen
   * @svelte-prop {String} [position=is-bottom-right]
   * @values <code>is-top</code>, <code>is-bottom</code>, <code>is-top-left</code>, <code>is-top-right</code>, <code>is-bottom-left</code>, <code>is-bottom-right</code>
   * */
  export let position = 'is-bottom-right'

  /** Type (color)
   * @svelte-prop {String} [type=is-dark]
   * @values $$colors$$
   * */
  export let type = 'is-primary'

  /** Background type (any of the Bulma <code>has-background-</code> classes will work)
   * @svelte-prop {String} [background]
   * @values <code>has-background-*</code>
   * */
  export let background = ''

  export let actionText = 'OK'

  export let onAction = () => {}

  let notice

  function action() {
    Promise.resolve(onAction())
      .then(() => notice.close())
  }

  onMount(() => {
    if (typeof onAction !== 'function') throw new Error(`onAction ${onAction} is not a function`)
  })

  // $: newBackground = background
  $: newType = type && type.replace(/^is-(.*)/, 'has-text-$1')
  $: props = { ...filterProps($$props), position, duration }
</script>

<style lang="scss">
  .snackbar {
    display: inline-flex;
    align-items: center;
    justify-content: space-around;
    border-radius: 4px;
    margin: 0.5em 0;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12), 0 0 6px rgba(0, 0, 0, 0.04); /* super subtle... */
    pointer-events: auto;
    min-height: 3em;

    .text {
      margin: .5em 1em;
    }

    .action {
      margin-left: auto;
      padding: 0.5em;
      padding-left: 0;

      .button {
        font-weight: 600;
        text-transform: uppercase;
        background: transparent;
        border: transparent;
        position: relative;

        &:hover::after {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(0, 0, 0, 0.1);
        }
      }
    }
  }
</style>

<Notice {...props} bind:this={notice} transitionOut={true}>
  <div class="snackbar {background}" class:has-background-dark={!background} role="alert">
    <div class="text"> <!-- NOTE: this extra div is for dynamic text styling with background-clip -->
      {@html message}
    </div>

    {#if actionText}
      <div class="action" on:click={action}>
        <button class="button {newType}">{ actionText }</button>
      </div>
    {/if}
  </div>
</Notice>
