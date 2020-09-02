<script>
  import { beforeUpdate, onDestroy, onMount } from 'svelte';
  import { classnames } from '../../helpers/classnames';
  import isFinite from 'lodash/isFinite';

  import ArrowUpIcon from '../Icons/ArrowUp.svelte';
  import ArrowDownIcon from '../Icons/ArrowDown.svelte';

  const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || Math.pow(2, 53) - 1;
  const MIN_SAFE_INTEGER = Number.MIN_SAFE_INTEGER || -MAX_SAFE_INTEGER;
  const KEYDOWN_DELAY_MS = 500;
  
  let input = undefined;
  let lastValidValue = undefined;
  let keydownInterval = undefined;
  
  export let isDisabled = false;
  export let value = 0;
  export let placeholder = '';
  export let step = 1;
  export let min = MIN_SAFE_INTEGER;
  export let max = MAX_SAFE_INTEGER;
  export let precision = 0;

  function isValidValue(value) {
    return isFinite(value) || /^-?[0-9.]+$/.test(value);
  }

  function isInRange(value, min, max) {
    return value >= min && value <= max;
  }

  function makeNumber(value) {
    return isValidValue(value) ? parseFloat(value) : value;
  }

  export let ClassNames;
  $: {
    ClassNames = classnames(
      {
        isDisabled
      }
    );
  }

  
  function formatValue() {
    value = parseFloat(value).toFixed(precision);
  }

  function onKeydown(event) {
    clearInterval(keydownInterval);

    const UP = 38;
    const DOWN = 40;

    if (event.keyCode === UP) {
      event.preventDefault();
      keydownInterval = setInterval(updateValue(step), KEYDOWN_DELAY_MS);
    }

    if (event.keyCode === DOWN) {
      event.preventDefault();
      keydownInterval = setInterval(updateValue(-step), KEYDOWN_DELAY_MS);
    }
  }

  function updateValue(updateBy) {
    const newValue = makeNumber(value) + updateBy;

    value = isInRange(newValue, min, max) ? newValue : value;

    const inputLength = input.value.length;
    input.setSelectionRange(inputLength, inputLength);
  }

  function onDownClick() {
    updateValue(-step);
  }

  function onUpClick() {
    updateValue(step);
  }

  function setToLastValid() {
    value = parseFloat(lastValidValue);
  }

  onMount(() => {
    lastValidValue = parseFloat(value);
    keydownInterval = 0;
    value = lastValidValue;
  });

  let value_prev = undefined;
  let precision_prev = undefined;
  let step_prev = undefined;
  let min_prev = undefined;
  let max_prev = undefined;

  beforeUpdate(() => {

    if (value !== value_prev) {
      lastValidValue = isValidValue(value) && isInRange(value, min, max) ? value : lastValidValue;
      formatValue();
    }

    if ((precision !== precision_prev) || (step !== step_prev)) {
      formatValue();
    }

    if (min !== min_prev) {
      const currentValue = parseFloat(value);

      if (currentValue < min) {
        lastValidValue = min;

        value = lastValidValue;

        formatValue();
      }

      if (max < min) {
        max = min;
      }
    }

    if (max !== max_prev) {
      const currentValue = parseFloat(value);

      if (currentValue > max) {
        lastValidValue = max;

        value = lastValidValue;

        formatValue();
      }

      if (max < min) {
        min = max;
      }
    }

    value_prev = value;
    precision_prev = precision;
    step_prev = step;
    min_prev = min;
    max_prev = max;
  });

  onDestroy(() => {
    clearInterval(keydownInterval);
  });
</script>


<style>
  .numberInput {
    position: relative;
  }

  input {
    border: 1px solid var(--neutral_1);
    border-radius: 4px;
    color: var(--neutral_7);
    font-size: 14px;
    display: block;
    padding: 16px 40px 16px 16px;
    outline: none;
    width: 100%;
  }

  input:hover {
    border-color: var(--neutral_3);
  }

  input:disabled {
    background-color: var(--neutral_0);
    border-color: var(--neutral_0);
    color: #b2b8bf;
  }

  input:focus {
    border-color: var(--blue_5);
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

  .down,
  .up {
    background: rgba(235, 237, 239, 0.5);
    cursor: pointer;
    position: absolute;
    right: 2px;
    width: 32px;
    height: 23px;
    text-align: center;
    user-select: none;
  }

  .down:hover,
  .up:hover {
    background: rgba(235, 237, 239, 1);
  }

  .down {
    bottom: 2px;
    border-radius: 0 0 3px 0;
  }

  .up {
    top: 2px;
    border-radius: 0 3px 0 0;
  }

  .isDisabled .down,
  .isDisabled .up {
    opacity: 0.5;
    pointer-events: none;
  }

  .icon {
    display: block;
    margin: 0 auto;
    width: 26px;
    height: 26px;
    position: relative;
    overflow: hidden;
  }

  .up .icon {
    bottom: -3px;
  }

  .down .icon {
    top: -3px;
  }
</style>


<div class="numberInput { ClassNames }">
  <input type="text" bind:this={input} bind:value placeholder="{ placeholder }" disabled="{ isDisabled }"
    on:keydown="{onKeydown}" autocomplete="off" />

  <div class="up" on:click="{onUpClick}">
    <span class="icon">
      <ArrowUpIcon />
    </span>
  </div>

  <div class="down" on:click="{onDownClick}">
    <span class="icon">
      <ArrowDownIcon />
    </span>
  </div>
</div>
