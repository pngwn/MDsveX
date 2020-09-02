<script>
  import { classnames } from '../../helpers/classnames';
  import { createEventDispatcher } from 'svelte';

  import Spinner from '../Spinner/Spinner.svelte';
  import options from './options';

  const dispatch = createEventDispatcher();

  export let iconPosition = options.iconPosition.ONLY;
  export let isActive = false;
  export let isBlock = false;
  export let isOutlined = false;
  export let isRounded = false;
  export let isSelected = false;
  export let isWaiting = false;
  export let isWide = false;
  export let isDisabled = false;
  export let htmlType = options.htmlType.BUTTON;
  export let Icon = null;

  let ClassNames;
  $: {
    ClassNames = classnames({
      [`iconPosition-${iconPosition}`]: Icon,
      isActive,
      isBlock,
      isSelected,
      isOutlined,
      isRounded,
      isWaiting,
      isWide
    });
  }

  let HtmlDisabled;
  $: {
    HtmlDisabled = isDisabled || isWaiting;
  }

  function onClick(event) {
    dispatch('click', event);
  }
</script>

<style>
  .button {
    background: var(--Button-bg, var(--green_4));
    color: var(--Button-color, var(--white));
    border: var(--Button-border, none);
    border-radius: var(--Button-radius, 3px);
    cursor: pointer;
    display: inline-block;
    font-size: var(--Button-font-size, 14px);
    font-weight: var(--Button-font-weight, 600);
    line-height: var(--Button-line-height, 16px);
    padding: var(--Button-padding, 10px 16px);
    text-align: var(--Button-text-align, center);
    vertical-align: middle;
    white-space: nowrap;
    text-decoration: none;
    position: relative;
    transition: var(
      --Button-transition,
      background 0.1s ease-out,
      box-shadow 0.15s cubic-bezier(0.47, 0.03, 0.49, 1.38)
    );
    overflow: hidden;
  }

  .button:disabled {
    pointer-events: none;
    opacity: var(--Button-disabled-opacity, 0.5);
  }

  .button:focus {
    outline: none;
    background: var(--Button-focus-bg, var(--green_5));
  }

  .button.isActive {
    pointer-events: none;
  }

  .button:hover {
    background: var(--Button-hover-bg, var(--green_5));
  }

  .button:active {
    background: var(--Button-active-bg, var(--green_6));
  }

  .button.isOutlined {
    background: var(--Button-outlined-bg, var(--white));
    border: var(--Button-outlined-border, 1px solid var(--green_4));
    color: var(--Button-outlined-color, var(--green_4));
  }

  .button.isSelected {
    background: var(--Button-selected-bg, var(--green_6));
  }

  .button.isOutlined:active {
    box-shadow: 0 0 0 1px var(--green_6) inset;
    border: 1px solid var(--green_6);
  }

  .button.isBlock {
    width: 100%;
  }

  .button.isRounded {
    border-radius: 15px;
  }

  .button.isWide {
    padding-left: 32px;
    padding-right: 32px;
  }

  .inner {
    display: flex;
    align-items: center;
    justify-content: space-around;
    pointer-events: none;
  }

  .isBlock .inner {
    justify-content: center;
  }

  .icon {
    display: block;
    width: var(--Button-icon-width, 16px);
    min-width: var(--Button-icon-min-width, 16px);
    height: var(--Button-icon-height, 16px);
  }

  .icon :global(svg) {
    width: 100%;
    height: 100%;
  }

  .icon :global(path),
  .icon :global(polygon) {
    fill: currentColor;
  }

  .iconPosition-left .icon {
    margin-right: 5px;
    order: -1;
  }

  .iconPosition-right .icon {
    margin-left: 5px;
    order: 1;
  }

  .iconPosition-only .icon {
    width: var(--Button-icon-only-width, 1em); 
    height: var(--Button-icon-only-height, 1em);
  }

  .spinner {
    width: 16px;
    height: 16px;
    position: absolute;
    top: 50%;
    left: 50%;
    margin-top: -8px;
    margin-left: -8px;
    animation: spinnerEnter 0.3s ease-out;
  }

  .isWaiting .inner {
    visibility: hidden;
  }

  @keyframes spinnerEnter {
    from {
      opacity: 0;
    }
  }
</style>

<button
  class="button {ClassNames}"
  disabled={HtmlDisabled}
  on:click={onClick}
  type={htmlType}>
  {#if isWaiting}
    <span class="spinner">
      <Spinner />
    </span>
  {/if}

  <span class="inner">
    {#if Icon}
      <span class="icon">
        <svelte:component this="{ Icon }" />
      </span>
    {/if}

    <span>
      <slot />
    </span>
  </span>
</button>
