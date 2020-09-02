<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import Icon from '../Icon.svelte'
  import Notice, { filterProps } from '../Notice.svelte'
  import { typeToIcon } from '../../utils'

  /** Type (color)
   * @svelte-prop {String} [type]
   * @values $$colors$$
   * */
  export let type = ''

  /** Whether the notification is visible or not
   * @svelte-prop {boolean} active=true
   * */
  export let active = true

  /** Display an X button that closes the notification
   * @svelte-prop {boolean} showClose=true
   * */
  export let showClose = true

  /** Automatically close the notification after <code>duration</code>. Doesn't apply when opening programmatically
   * @svelte-prop {boolean} autoClose=false
   * */
  export let autoClose = false

  /** Duration notification will remain on screen
   * @svelte-prop {Number} [duration=2000]
   * */
  export let duration = 2000

  /** Show icon on left-side of the notification. If set to <code>true</code>, icon will be determined from <code>type</code> property.
   * @svelte-prop {String|Boolean} [icon]
   * */
  export let icon = ''

  /** Fontawesome icon pack to use. By default the <code>Icon</code> component uses <code>fas</code>
   * @svelte-prop {String} [iconPack]
   * @values <code>fas</code>, <code>fab</code>, etc...
   * */
  export let iconPack = ''

  /** Label for the close button, to be read by accessibility screenreaders
   * @svelte-prop {String} [ariaCloseLabel]
   * */
  export let ariaCloseLabel = ''

  /** Text for notification, when used programmatically
   * @svelte-prop {String} message
   * */

  /** Where the notification will show on the screen when used programmatically
   * @svelte-prop {String} [position=is-top-right]
   * @values <code>is-top</code>, <code>is-bottom</code>, <code>is-top-left</code>, <code>is-top-right</code>, <code>is-bottom-left</code>, <code>is-bottom-right</code>
   * */

  const dispatch = createEventDispatcher()

  let newIcon = ''
  let timer

  $: {
    if (icon === true) {
      newIcon = typeToIcon(type)
    } else {
      newIcon = icon
    }
  }

  $: {
    if (active && autoClose) {
      timer = setTimeout(() => {
        if (active) close()
      }, duration)
    }
  }

  function close() {
    active = false
    if (timer) clearTimeout(timer)
    dispatch('close', active)
  }
</script>

<style lang="scss">
  .message .media {
    padding-top: 0;
    border: 0;
  }
</style>

{#if active}
  <article class="notification {type}" transition:fade|local>
    {#if showClose}
      <button class="delete" aria-label={ariaCloseLabel} on:click={close} />
    {/if}
    <div class="media">
      {#if icon}
        <div class="media-left">
          <Icon pack={iconPack} icon={newIcon} size="is-large" />
        </div>
      {/if}
      <div class="media-content">
        <slot />
      </div>
    </div>
  </article>
{/if}
