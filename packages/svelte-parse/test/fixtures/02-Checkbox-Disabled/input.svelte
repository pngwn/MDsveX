<script>
  import Button from '@sveltekit/ui/Button';
  import Checkbox from '@sveltekit/ui/Checkbox';

  let isChecked = true;
  let isDisabled = true;
      
  let Label;
  $: {
    Label = isChecked ? 'Checked' : 'Unchecked';
    Label += `-${isDisabled ? 'Disabled' : 'Enabled'}`;
  }
</script>

<style>
  .disabled {
    color: rgba(0, 0, 0, .25);
  }

  label {
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  span {
    padding-left: 8px;
  }
</style>

<label class="{isDisabled ? 'disabled' : ''}">
  <Checkbox bind:isChecked {isDisabled} />
  <span>{Label}</span>
</label>

<p>
  <Button on:click="{() => isChecked = !isChecked }">
    {isChecked ? 'Uncheck' : 'Check'}
  </Button>

  <Button on:click="{() => isDisabled = !isDisabled }">
    {isDisabled ? 'Enable' : 'Disable'}
  </Button>
</p>
