<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { classnames } from '../../helpers/classnames';

  const dispatch = createEventDispatcher();

  export let isClickable = false;
  export let isSelected = false;
  export let isMulti = false;


  export let ClassNames;
  $: {
    ClassNames = classnames({
      isClickable,
      isSelected,
      isMulti
    });
  }

  function onClick(event) {
    if (isClickable) {
      dispatch('click', event);
    }
  }

  onMount(() => {
    isClickable = !!arguments[0].$$.callbacks.click;
  });
</script>

<style>
  .dropdownMenuItem {
    color: var(--neutral_7);
    clear: both;
    display: flex;
    border: 0;
    padding: 14px 16px;
    text-align: left;
  }

  .dropdownMenuItem:first-child {
    border-radius: 4px 4px 0 0;
  }

  .dropdownMenuItem:last-child {
    border-radius: 0 0 4px 4px;
  }

  .dropdownMenuItem.isClickable {
    cursor: pointer;
  }

  .dropdownMenuItem.isClickable:hover {
    background-color: var(--blue_0);
  }
</style>

<div class="dropdownMenuItem { ClassNames }" on:click="{onClick}">
  <slot></slot>
</div>
