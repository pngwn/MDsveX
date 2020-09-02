<script>
  export let name = '';
  export let value = '';
  export let selected = '';
  export let isDisabled = false;
</script>

<style>
input {
  margin: 0;
}

</style>

<input
  { name }
  { value }
  bind:group="{ selected }"
  type="radio"
  disabled="{ isDisabled }"
  checked="{ selected === value }"
  on:click
  on:input
  on:change
/>
