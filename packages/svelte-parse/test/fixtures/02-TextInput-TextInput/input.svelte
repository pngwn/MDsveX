<script>
  import { beforeUpdate, createEventDispatcher, onMount } from 'svelte';
  import { classnames } from '../../helpers/classnames';
  import LockIcon from '../Icons/Lock.svelte';

  import options from './options';

  const dispatch = createEventDispatcher();

  export let appearance = options.appearance.DEFAULT;
  export let isDisabled = false;
  export let hasPrependSlot = false;
  export let showLock = false;
  export let value = '';
  export let name = '';
  export let placeholder = '';
  export let htmlAutocomplete = 'on';
  export let htmlType = options.htmlType.TEXT;
  export let isRequired = false;
  export let autoFocus = false;
  export let errors = [];
  export let maxLength = undefined;
  export let pattern = undefined;
  export let isDirty = false;

  let input = undefined;

  export let ClassNames;
  $: {
    ClassNames = classnames(`appearance-${appearance}`, {
      disabled: isDisabled
    });
  }

  export let InputClassNames;
  $: {
    InputClassNames = classnames({
      hasPrependSlot,
      hasAppend: showLock
      // hasError: isDirty && errors.length > 0,
      // hasSuccess: isDirty && errors.length === 0
    });
  }

  export let Value;
  $: {
    Value = value === undefined ? '' : value;
  }

  function onError(event) {
    errors = event.detail.errors || [];
  }

  function onInput(event) {
    dispatch('input', event);
    isDirty = true;
    value = input.value;
  }

  function onChange(event) {
    dispatch('change', event);
    isDirty = true;
    value = input.value;
  }

  let value_prev = undefined;

  beforeUpdate(() => {
    if (
      value &&
      ((value.length > 0 && pattern && !pattern.test(value)) ||
        value.length > maxLength)
    ) {
      value = value_prev;
    }

    value_prev = value;
  });

  onMount(() => {
    hasPrependSlot = !!arguments[0].$$.ctx.$$slots.prepend;

    if (autoFocus) {
      setTimeout(() => {
        input.focus();
      });
    }
  });
</script>

<style>
  .textInput {
    position: relative;
  }

  input {
    border: 1px solid var(--neutral_1);
    border-radius: 4px;
    color: var(--neutral_7);
    font-size: 14px;
    line-height: 16px;
    display: block;
    padding: 13px 16px;
    outline: none;
    width: 100%;
  }

  .appearance-standout input {
    background: rgba(44, 62, 80, 0.08);
    border-color: transparent;
  }

  .appearance-standoutInverted input {
    background: rgba(44, 62, 80, 0.26);
    border-color: transparent;
    color: #fff;
  }

  input:hover {
    border-color: var(--neutral_3);
  }

  .appearance-standout input:hover,
  .appearance-standoutInverted input:hover {
    border-color: rgba(44, 62, 80, 0.12);
  }

  input:disabled {
    background-color: rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.07);
    color: #b2b8bf;
  }

  input:focus {
    border-color: var(--blue_5);
  }

  .appearance-standout input:focus,
  .appearance-standoutInverted input:focus {
    border-color: rgba(44, 62, 80, 0.22);
  }

  input.hasPrependSlot {
    padding-left: 45px;
  }

  input.hasAppend {
    padding-right: 45px;
  }

  input.hasError {
    border-color: var(--pink_4) !important;
  }

  input.hasSuccess {
    border-color: var(--green_4, #51ce6c) !important;
  }

  input::-webkit-input-placeholder {
    color: var(--neutral_3);
  }

  input:-ms-input-placeholder {
    color: var(--neutral_3);
  }

  input::-moz-placeholder {
    color: var(--neutral_3);
  }

  input:-moz-placeholder {
    color: var(--neutral_3);
  }

  input:disabled::-webkit-input-placeholder {
    color: var(--neutral_1);
  }

  input:disabled:-ms-input-placeholder {
    color: var(--neutral_1);
  }

  input:disabled::-moz-placeholder {
    color: var(--neutral_1);
  }

  input:disabled:-moz-placeholder {
    color: var(--neutral_1);
  }

  .prepend {
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 48px;
  }

  .append {
    color: #78848f;
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;
    top: 13px;
    right: 13px;
    bottom: 0;
    width: 20px;
    height: 20px;
  }

  .disabled .prepend,
  .disabled .append {
    opacity: 0.3;
  }
</style>

<div class="textInput {ClassNames}">
  {#if hasPrependSlot}
    <div class="prepend">
      <slot name="prepend" />
    </div>
  {/if}

  <input
    bind:this={input}
    value={Value}
    {name}
    {placeholder}
    autocomplete={htmlAutocomplete}
    type={htmlType}
    class={InputClassNames}
    required={isRequired}
    disabled={isDisabled}
    on:$error={onError}
    on:blur={event => dispatch('blur', event)}
    on:input={onInput}
    on:change={onChange} />

  {#if showLock}
    <div class="append">
      <LockIcon />
    </div>
  {/if}
</div>
