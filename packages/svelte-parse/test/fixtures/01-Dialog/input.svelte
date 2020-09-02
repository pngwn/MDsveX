<script>
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte'
  import Icon from '../Icon.svelte'
  import { chooseAnimation, isEnterKey, isEscKey } from '../../utils'
  
  /** Show a header on the dialog with this text
   * @svelte-prop {String} [message]
   * */
  export let title = ''

  /** Text or html message for this dialog
   * @svelte-prop {String} message
   * */
  export let message

  /** Text to show on the confirmation button
   * @svelte-prop {String} [confirmText=OK]
   * */
  export let confirmText = 'OK'

  /** Text to show on the cancel  button
   * @svelte-prop {String} [cancelText=Cancel]
   * */
  export let cancelText = 'Cancel'

  /** Focus on confirm or cancel button when dialog opens
   * @svelte-prop {String} [focusOn=confirm]
   * @values <code>confirm</code>, <code>cancel</code>
   * */
  export let focusOn = 'confirm'

  /** Show this icon on left-side of dialog. It will use the color from <code>type</code>
   * @svelte-prop {String} [icon]
   * */
  export let icon = ''

  /** Fontawesome icon pack to use. By default the <code>Icon</code> component uses <code>fas</code>
   * @svelte-prop {String} [iconPack]
   * @values <code>fas</code>, <code>fab</code>, etc...
   * */
  export let iconPack = ''

  /** Show an input field
   * @svelte-prop {Boolean} [hasInput=false]
   * */
  export let hasInput = false
  
  export let prompt = null

  /** Show the cancel button. True for <code>confirm()</code>
   * @svelte-prop {Boolean} [showCancel=false]
   * */
  export let showCancel = false

  /** Dialog's size
   * @svelte-prop {String} [size]
   * @values $$sizes$$
   * */
  export let size = ''

  /** Type (color) to use on confirm button and icon
   * @svelte-prop {String} [type=is-primary]
   * @values $$colors$$
   * */
  export let type = 'is-primary'

  export let active = true

  /** Animation to use when showing dialog
   * @svelte-prop {String|Function} [animation=scale]
   * @values Any transition name that ships with Svelte, or a custom function
   * */
  export let animation = 'scale'

  /** Props to pass to animation function
   * @svelte-prop {Object} [animProps={ start: 1.2 }]
   * */
  export let animProps = { start: 1.2 }

  /** Props (attributes) to use to on prompt input element
   * @svelte-prop {Object} [inputProps]
   * */
  export let inputProps = {}

  // export let showClose = true
  let resolve
  export let promise = new Promise((fulfil) => (resolve = fulfil))
  
  // TODO: programmatic subcomponents
  export let subComponent = null
  export let appendToBody = true

  let modal
  let cancelButton
  let confirmButton
  let input
  let validationMessage = ''

  const dispatch = createEventDispatcher()

  $: _animation = chooseAnimation(animation)
  $: {
    if (modal && active && appendToBody) {
      modal.parentNode.removeChild(modal)
      document.body.appendChild(modal)
    }
  }
  $: newInputProps = { required: true, ...inputProps }

  onMount(async () => {
    await tick()

    if (hasInput) {
      input.focus()
    } else if (focusOn === 'cancel' && showCancel) {
      cancelButton.focus()
    } else {
      confirmButton.focus()
    }
  })


  function cancel() {
    resolve(hasInput ? null : false)
    close()
  }

  function close() {
    resolve(hasInput ? null : false)
    active = false
    dispatch('destroyed')
  }

  async function confirm() {
    if (input && !input.checkValidity()) {
      validationMessage = input.validationMessage

      await tick()
      input.select()

      return
    }

    validationMessage = ''

    resolve(hasInput ? prompt: true)
    close()
  }

  function keydown(e) {
    if (active && isEscKey(e)) {
      close()
    }
  }
</script>

<style lang="scss">
@import 'node_modules/bulma/sass/utilities/all';

 .dialog {
   .modal-card {
     max-width: 460px;
     width: auto;
     .modal-card-head {
       font-size: $size-5;
       font-weight: $weight-semibold;
     }
     .modal-card-body {
       .field {
         margin-top: 16px;
       }
       &.is-titleless {
         border-top-left-radius: $radius-large;
         border-top-right-radius: $radius-large;
       }
     }
     .modal-card-foot {
       justify-content: flex-end;
       .button {
         display: inline; // Fix Safari centering
         min-width: 5em;
         font-weight: $weight-semibold;
       }
     }
     @include tablet {
       min-width: 320px;
     }
   }

   &.is-small {
     .modal-card,
     .input,
     .button {
       @include control-small;
     }
   }

   &.is-medium {
     .modal-card,
     .input,
     .button {
       @include control-medium;
     }
   }

   &.is-large {
     .modal-card,
     .input,
     .button {
       @include control-large;
     }
   }
 }
</style>

<svelte:window on:keydown={keydown}></svelte:window>
<svelte:options accessors/>

{#if active}
  <div class="modal dialog {size} is-active" bind:this={modal}>
    <div class="modal-background" on:click={close}></div>
    <div class="modal-card" transition:_animation={animProps}>
      {#if title}
        <header class="modal-card-head">
          <p class="modal-card-title">{title}</p>
          <!-- NOTE: don't think we need this... -->
          <!-- {#if showClose}
            <button class="delete" aria-label="close" on:click={close}></button>
          {/if} -->
        </header>
      {/if}
      <section class="modal-card-body" class:is-titleless={!title} class:is-flex={icon}>
        <div class="media">
          {#if icon}
            <div class="media-left">
              <Icon pack={iconPack} {icon} {type} size="is-large"></Icon>
            </div>
          {/if}
          <div class="media-content">
            <p>{@html message}</p>

            {#if hasInput}
              <div class="field">
                <div class="control">
                  <input
                      bind:value={prompt}
                      class="input"
                      bind:this={input}
                      {...newInputProps}
                      on:keyup={e => isEnterKey(e) && confirm()}>
                  <p class="help is-danger">{validationMessage}</p>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </section>

      <footer class="modal-card-foot">
        {#if showCancel}
          <button
              class="button"
              bind:this={cancelButton}
              on:click={cancel}>
              {cancelText}
          </button>
        {/if}
        <button
            class="button {type}"
            bind:this={confirmButton}
            on:click={confirm}>
            {confirmText}
        </button>
      </footer>
    </div>
  </div>
{/if}