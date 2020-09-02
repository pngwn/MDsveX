<script>
  import { createEventDispatcher } from 'svelte';
  import { classnames } from '../../helpers/classnames';
  import inlinestyles from '../../helpers/inlineStyles';

  import Button from '../Button/Button.svelte';
  import buttonOptions from '../Button/options';
  import CloseIcon from '../Icons/Close.svelte';


  const dispatch = createEventDispatcher();

  let modalContainer = undefined;
  
  export let isWaiting = false;
  export let hasOverlay = true;
  export let hasCustomTemplate = false;
  export let width = '630px';
  export let isClosable = true;
  export let title = '';
  export let hasFooter = true;
  export let okType = 'default';
  export let isOkDisabled = false;
  export let okText = 'OK';
  export let hasCancelButton = true;
  export let cancelText = 'Cancel';
  export let isKeyboardClosable = true;
  export let isOverlayClosable = true;
  export let target = undefined;
  export let targetElem = undefined;
  export let height = undefined;
  export let maxWidth = undefined;
  
  export let cancel = () => {};
  export let complete = () => {};


  export let ClassNames;
  $: {
    ClassNames = classnames(
      {
        isWaiting
      }
    );
  }

  export let OverlayClassNames;
  $: {
    OverlayClassNames = classnames(
      {
        hasOverlay
      }
    );
  }

  export let CustomContentClass;
  $: {
    CustomContentClass = classnames(
      {
        hasCustomTemplate
      }
    )
  }

  export let ModalStyles;
  $: {
    ModalStyles = inlinestyles(
      {
        width,
        height,
        'max-width': maxWidth || width
      }
    );
  }


  function onOverlayClick(event) {
    if (modalContainer.contains(event.target)) return;
    if (isOverlayClosable) {
      onCancelClick();
    }
  }

  function onCancelClick() {
    if (cancel) {
      cancel();
    }

    dispatch('cancel');
  }

  function onOkClick() {
    if (complete) {
      complete();
    }

    dispatch('ok');
  }

  function onKeydown(event) {
    if (event.keyCode === 27 && isKeyboardClosable) {
      onCancelClick();
    }
  }
</script>


<style>
  .modalOverlay {
    display: flex;
    align-items: center;
    flex-direction: column;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 999999;
    -webkit-overflow-scrolling: touch;
    transform: translate3d(0, 0, 0);
    animation: overlayEnter 0.2s ease-out;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .hasOverlay {
    background-color: rgba(44, 62, 80, 0.6);
  }

  .modal {
    border-radius: 4px;
    background-color: var(--white);
    box-shadow: 0 0 0 1px rgba(9, 30, 66, 0.08);
    margin: auto 0;
    position: relative;
    width: 100%;
    backface-visibility: hidden;
    animation: modalEnter 0.15s ease-out both;
    animation-delay: 0.1s;
    filter: none;
    transform: translate(0, 0);
    flex-shrink: 0;
  }

  .closer {
    position: absolute;
    top: 10px;
    right: 10px;

    --Button-font-size: 20px;
    --Button-padding: 2px;
  }

  .content {
    color: #3f4f5f;
    font-size: 14px;
    letter-spacing: -0.15px;
    padding: 32px 39px;
  }

  .content.hasCustomTemplate {
    padding: 0;
  }

  .title {
    color: #2c3e50;
    font-size: 21px;
    font-weight: 700;
    letter-spacing: 0.33px;
    margin: 0 0 16px 0;
  }

  .footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 60px;
  }

  .footerAction {
    margin-left: 10px;
  }

  @keyframes overlayEnter {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @keyframes modalEnter {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }
</style>

<svelte:window on:keydown="{onKeydown}" />

<div class="modalOverlay { OverlayClassNames }" on:click="{onOverlayClick}">
  <div class="modal { ClassNames }" style="{ ModalStyles }" bind:this={modalContainer}>
    <div class="{ CustomContentClass } content">
      {#if isClosable}
      <div class="closer">
        <Button
          on:click="{onCancelClick}"
          Icon="{CloseIcon}"
          isDisabled="{isWaiting}">
        </Button>
      </div>
      {/if}

      {#if title}
      <h1 class="title">
        { title }
      </h1>
      {/if}

      <slot></slot>

      {#if hasFooter}
      <div class="footer">
        <div class="footerAction">
          <Button on:click="{onOkClick}" isWaiting="{isWaiting}" type="{okType}" isDisabled="{isOkDisabled}">{okText}</Button>
        </div>

        {#if hasCancelButton}
        <div class="footerAction">
          <Button on:click="{onCancelClick}" isDisabled="{isWaiting}" type="link">{cancelText}</Button>
        </div>
        {/if}
      </div>
      {/if}
    </div>
  </div>
</div>
