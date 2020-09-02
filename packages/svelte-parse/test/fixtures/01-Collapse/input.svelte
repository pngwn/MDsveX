<script>
  import * as transitions from 'svelte/transition'

  /** Whether the Collapse is open or not
   * @svelte-prop {boolean} open=true
   * */
  export let open = true

  /** Animation to use when opening/closing
   * @svelte-prop {String} animation=slide
   * @values Any animation that ships with Svelte
   * */
  export let animation = 'slide'

  let _animation = transitions[animation]
  $: _animation = typeof animation === 'function' ? animation : transitions[animation]

  function toggle() {
    open = !open
  }
</script>

<div class="collapse">
  <div class="collapse-trigger" on:click={toggle}>
    <slot name="trigger" />
  </div>
  {#if open}
    <div class="collapse-content" transition:_animation|local>
      <slot />
    </div>
  {/if}
</div>
