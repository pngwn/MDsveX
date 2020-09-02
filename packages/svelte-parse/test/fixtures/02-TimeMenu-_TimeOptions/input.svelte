<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '@sveltekit/ui/Button';

  export let selectedItem;
  export let options = []; 

  const dispatch = createEventDispatcher();

  function onOptionClick(option) {
    dispatch('select', option);
  }
</script>

<style>
  .timeOptions {
    display: flex;
    flex-wrap: wrap;
    padding: 5px;
    max-width: 330px;
  }
  
  .option {
    width: 70px;
    margin: 5px;
  }
</style>

<div class="timeOptions">
  { #each options as option }
  <div class="option">
    <Button 
      type="link" 
      size="compact" 
      isBlock 
      isActive="{ option === selectedItem }"
      isSelected="{ option === selectedItem }"
      on:click="{ () => onOptionClick(option) }"
    >
      { option }
    </Button>
  </div>
  { /each }
</div>
