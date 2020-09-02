<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { classnames } from '../../helpers/classnames';
  import whichAnimationEvent from '../../helpers/whichAnimationEvent';

  import Button from '../Button/Button.svelte';
  import Spinner from '../Spinner/Spinner.svelte';

  import buttonOptions from '../Button/options';
  import AlertIcon from '../Icons/Alert.svelte';
  import CheckIcon from '../Icons/Check.svelte';
  import CloseIcon from '../Icons/Close.svelte';


  const dispatch = createEventDispatcher();

  export let title = '';
  export let text = '';
  export let removeDelay = 3000;
  export let Icon = undefined;
  export let isClosable = false;
  export let isLoading = false;
  export let isDark = false;
  export let placement = 'bottomLeft';
  export let maxWidth = undefined;
  export let actions = undefined;
  export let isTimedAction = false;
  export let targetElem = undefined;
  export let key = undefined;
  export let promise = undefined;

  const animationEvent = whichAnimationEvent();

  let notification = undefined;
  let isExiting = false;
  let removeTimeout = undefined;
  let hover = undefined;
  let timerEnded = undefined;
  let resolve = undefined;
  let reject = undefined;

  export let ClassNames;

  $: {
    ClassNames = classnames({
      [`placement-${placement}`]: placement,
      isDark,
      isExiting,
      isLoading
    });
  }

  function onExitComplete() {
    dispatch('exit');
  }

  export function complete(value) {
    resolve(value);
    remove({ force: true });
  }

  export function cancel(value) {
    promise.catch(err => {});

    reject(value);
    remove({ force: true });
  }

  export function remove(args = {}) {
    if (!args.force) {
      if (hover) {
        return (timerEnded = true);
      }
    }

    clearTimeout(removeTimeout);
    dispatch('remove');
    isExiting = true;
  }

  function onActionClick(method) {
    method();
  }

  function onCancelClick() {
    cancel('cancelled');
  }

  function handleMouseleave() {
    hover = false;
    if (timerEnded) remove();
  }

  function onAnimationEnd(event) {
    if (event.animationName.endsWith('notificationExit')) {
      onExitComplete();
    }
  }

  onMount(() => {
    promise = new Promise((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });

    if (animationEvent) {
      notification.addEventListener(animationEvent, onAnimationEnd);
    }

    if (!isLoading && (!actions || isTimedAction)) {
      removeTimeout = setTimeout(remove, removeDelay);
    }
  });

  onDestroy(() => {
    if (resolve !== undefined) {
      resolve(null);
    }

    if (notification && animationEvent) {
      notification.removeEventListener(animationEvent, onAnimationEnd);
    }
  });
</script>

<style>
  .notification {
    background: var(--white);
    box-shadow: 1px 5px 6px 0 rgba(44, 62, 80, 0.24);
    border-radius: 3px;
    color: var(--neutral_7);
    position: fixed;
    bottom: 30px;
    left: 30px;
    min-width: 223px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    animation: notificationEnter 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)
      both;
    z-index: 99999;
  }

  .placement-bottomRight {
    left: auto;
    right: 30px;
  }

  .placement-topLeft {
    top: 30px;
    bottom: auto;
    left: 30px;
  }

  .placement-topRight {
    top: 30px;
    bottom: auto;
    left: auto;
    right: 30px;
  }

  .isExiting {
    animation: notificationExit 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) both;
  }

  .isDark {
    background: var(--neutral_7);
    color: var(--neutral_1);
  }

  .content {
    padding: 14px 58px;
    position: relative;
  }

  .content.withActions {
    padding-bottom: 0;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.49px;
    line-height: 28px;
  }

  .text {
    font-size: 14px;
    letter-spacing: -0.15px;
    line-height: 19px;
    min-height: 28px;
  }

  .title + .text {
    margin-bottom: 8px;
  }

  .actionIcon,
  .notifyIcon {
    position: absolute;
    top: 18px;
    left: 18px;
    width: 20px;
    height: 20px;
  }

  .notifyIcon {
    background: var(--green_4, #51ce6c);
    border-radius: 50%;
    color: var(--white);
  }

  .actionIcon {
    color: #e80031;
  }

  .isDark .actionIcon {
    color: var(--orange_4);
  }

  .spinner {
    color: var(--green_4, #51ce6c);
    position: absolute;
    top: 18px;
    left: 18px;
    width: 20px;
    height: 20px;
  }

  .actions {
    display: flex;
    padding: 0 14px 14px 40px;
  }

  .closer {
    position: absolute;
    top: 15px;
    right: 15px;
  }

  @keyframes notificationEnter {
    0% {
      opacity: 0;
      transform: translateY(70px);
    }

    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes notificationExit {
    0% {
      opacity: 1;
      transform: translateY(0);
    }

    100% {
      opacity: 0;
      transform: translateY(70px);
    }
  }
</style>

<svelte:options accessors />

<div
  class="notification {ClassNames}"
  bind:this={notification}
  on:mouseover={() => (hover = true)}
  on:mouseleave={handleMouseleave}
  style={maxWidth ? 'max-width: ' + maxWidth + 'px' : ''}
>

  <div class="content {actions ? 'withActions' : ''}">
    {#if isLoading}
      <span class="spinner">
        <Spinner />
      </span>
    {:else if (actions && Icon === undefined)}
      <span class="actionIcon">
        <AlertIcon />
      </span>
    {:else}
      <span class="notifyIcon">
        <CheckIcon />
      </span>
    {/if}

    {#if isClosable}
      <div class="closer">
        <Button
          on:click={cancel}
          type={buttonOptions.type.LINK}
          Icon="{ CloseIcon }" />
      </div>
    {/if}

    {#if title}
      <div class="title">{title}</div>
    {/if}

    {#if text}
      <div class="text">{text}</div>
    {/if}
  </div>

  {#if actions}
    <div class="actions">
      {#each Object.entries(actions) as [actionText, actionMethod]}
        <Button
          on:click={() => onActionClick(actionMethod)}
          size={buttonOptions.size.COMPACT}>
          {actionText}
        </Button>
      {/each}
    </div>
  {/if}
</div>
