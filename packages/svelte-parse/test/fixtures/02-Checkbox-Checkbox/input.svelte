<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let name = '';
  export let isDisabled = false;
  export let isChecked = false;
</script>

<style>
  .checkbox-container {
    display: inline-block;
    position: relative;
  }

  input {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 1;
    opacity: 0;
    cursor: pointer;
  }

  input[disabled] {
    cursor: not-allowed;
  }

  .check {
    position: relative;
    top: 0;
    left: 0;
    display: block;
    width: 16px;
    height: 16px;
    background: var(--white);
    border: 1px solid var(--neutral_1);
    border-radius: 2px;
    cursor: pointer;
  }

  .check.checked {
    background: var(--primary_1);
    border-color: transparent;
  }

  .check::after {
    content: "";
    top: 50%;
    left: 21%;
    display: table;
    width: 5.71428571px;
    height: 9.14285714px;
    border: 2px solid #fff;
    border-top: 0;
    border-left: 0;
    transform: rotate(45deg) scale(0) translate(-50%, -50%);
    opacity: 0;
    transition: all 0.1s cubic-bezier(0.71, -0.46, 0.88, 0.6), opacity 0.1s;
  }

  .check.checked::after {
    border: 2px solid #fff;
    border-top: 0;
    border-left: 0;
    transform: rotate(45deg) scale(1) translate(-50%, -50%);
    opacity: 1;
    position: absolute;
  }
</style>

<span class="checkbox-container">
  <input
    {name}
    type="checkbox"
    disabled={isDisabled}
    bind:checked={isChecked}
    on:input={event => dispatch('input', event)}
    on:change={event => dispatch('change', event)} />
  <span class="check {isChecked ? 'checked' : ''}" />
</span>
