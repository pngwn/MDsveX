<script>
  import { classnames } from '../../helpers/classnames';
  import Spinner from '../Spinner/Spinner.svelte';

  export let isActive = false;
  export let isDisabled = false;
  export let isWaiting = false;

  export let ClassNames;
  $: {
    ClassNames = classnames(
      {
        isActive,
        isDisabled,
        isWaiting
      }
    );
  }

  function onClick() {
    if (!isDisabled && !isWaiting) {
      isActive = !isActive;
    }
  }
</script>

<style>
  .switch {
    background: #b2b8bf;
    color: #b2b8bf;
    border-radius: 12px;
    cursor: pointer;
    height: 22px;
    width: 44px;
    position: relative;
    transition: background 0.2s ease-in;
  }

  .isDisabled {
    background: #d8dbdf;
    color: #d8dbdf;
    cursor: default;
  }

  .isActive {
    background: #007aff;
    color: #007aff;
  }

  .isDisabled.isActive {
    background: #b9daff;
    color: #b9daff;
  }

  .isWaiting {
    cursor: default;
  }

  .handle {
    box-shadow: 1px 1px 1px 0 rgba(44, 62, 80, 0.64);
    background: #fff;
    border-radius: 18px;
    display: block;
    height: 18px;
    width: 18px;
    position: absolute;
    left: 2px;
    top: 2px;
    transition: all 0.15s ease-out;
    z-index: 2;
  }

  .isActive .handle {
    left: 24px;
  }

  .spinner {
    display: block;
    width: 12px;
    height: 12px;
    position: absolute;
    top: 50%;
    left: 50%;
    margin: -6px 0 0 -6px;
    animation: spinnerEnter 1s ease-out;
  }

  @keyframes spinnerEnter {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
  }
</style>


<div class="switch {ClassNames}" on:click="{onClick}">
  <span class="handle">
    { #if isWaiting }
    <span class="spinner">
      <Spinner></Spinner>
    </span>
    { /if }
  </span>
</div>
