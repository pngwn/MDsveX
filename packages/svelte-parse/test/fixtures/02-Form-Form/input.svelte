<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import _validate from 'validate.js';

  const dispatch = createEventDispatcher();

  export let constraints = null;
  export let errors = null;
  export let isInvalid = true;

  let form = undefined;
  let inputs = [];

  function onSubmit(event) {
    event.preventDefault();
    validate();
    dispatch('submit', event);
  }

  function validate() {
    errors = _validate(form, constraints);
    isInvalid = !!errors
  }

  function getInputs() {
    if (!constraints || !form) return;

    const formInputs = form.querySelectorAll('input, select, textarea');
    let i = 0;

    for (i; i < formInputs.length; i += 1) {
      const input = formInputs[i];
      if (constraints[input.name]) {
        inputs.push(input);
        input.addEventListener('input', validate);
      }
    }
  }

  onMount(() => {
    getInputs();
    validate();
  });

  onDestroy(() => {
    inputs.forEach((input) => {
      input.removeEventListener('input', validate);
    });
  });
</script>

<style>
  form {
    margin: 0;
    padding: 0;
  }
</style>

<form on:submit="{onSubmit}" novalidate bind:this={form}>
  <slot></slot>
</form>
