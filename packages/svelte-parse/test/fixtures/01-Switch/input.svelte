
<script>
  /** Binding for whether the switch to "on" or not
   * @svelte-prop {Any} [checked=false]
   * */
  export let checked = false

  /** Type (color of control)
   * @svelte-prop {String} [type] - Type (color of control)
   * @values $$colors$$
   * */
  export let type = 'is-primary'

  /** Size of switch
   * @svelte-prop {String} [size]
   * @values $$sizes$$
   * */
  export let size = ''

  /** Whether switch is disabled or not
   * @svelte-prop {Boolean} [disabled=false]
   * */
  export let disabled = false

  let label
  let input

  $: newBackground = type && type.replace(/^is-(.*)/, 'has-background-$1') || ''

  $: {
    if (input) {
      if (disabled) {
        label.setAttribute('disabled', 'disabled')
        input.setAttribute('disabled', 'disabled')
      } else {
        label.removeAttribute('disabled')
        input.removeAttribute('disabled')
      }
    }
  }
</script>

<style lang="scss">
@import 'node_modules/bulma/sass/utilities/all';

.switch {
  position: relative;
  cursor: pointer;
  user-select: none;
  display: inline-flex;

  :global(&[disabled]) {
    opacity: .5;
    cursor: not-allowed;
  }

  input {
    position: absolute;
    opacity: 0;
    left: 0;
    z-index: -1;

    & + .check {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      width: 2.75em;
      height: 1.575em;
      padding: .2em;
      border-radius: 1em;
      transition: background .15s ease-out;

      &::before {
        content: "";
        display: block;
        border-radius: 1em;
        width: 1.175em;
        height: 1.175em;
        background: #f5f5f5;
        box-shadow: 0 3px 1px 0 rgba(0,0,0,.05),0 2px 2px 0 rgba(0,0,0,.1),0 3px 3px 0 rgba(0,0,0,.05);
        transition: transform .15s ease-out,width .15s ease-out;
        will-change: transform;
      }
    }
    
    &:not(:checked) {
      & + .check {
        background-color: $grey-light !important;
      }
    }

    &:checked {
      & + .check {
        background-color: unset;

        &::before {
          transform: translate3d(100%,0,0);
        }
      }
    }
  }

  .control-label {
    padding-left: .5em;
  }

  &.is-small {
    @include control-small;
  }
  &.is-medium{
    @include control-medium;
  }
  &.is-large {
    @include control-large;
  }
}
</style>

<label ref="label" class="switch {size}" bind:this={label}>
  <input type="checkbox" bind:checked bind:this={input} on:input on:click />

  <div class="check {newBackground}"></div>

  <span class="control-label">
    <slot/>
  </span>
</label>