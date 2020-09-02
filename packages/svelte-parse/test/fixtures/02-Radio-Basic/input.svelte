<script>
  import Radio from '@sveltekit/ui/Radio';

  let selected = null;
</script>

<style>
  .radio {
    display: flex;
    align-items: center;
  }

  .radio span {
    margin: 0 0 0 5px;
  }
</style>

<div class="row">
  <label class="radio">
    <Radio name="radioGroup" bind:selected value="Hello" />
    <span>Radio 1</span>
  </label>

  <label class="radio">
    <Radio name="radioGroup" bind:selected value="Kevin" />
    <span>Radio 2</span>
  </label>
</div>


<p>selected: {selected}</p>
