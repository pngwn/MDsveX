<script>
  import Button from '@sveltekit/ui/Button';
  import Form from '@sveltekit/ui/Form';
  import TextInput from '@sveltekit/ui/TextInput';

  function onSubmit(event) {
    console.log('event :', event);
  }
</script>

<style>
  .input {
    margin: 0 0 10px;
  }
</style>

<Form on:submit={onSubmit}>
  <div class="input">
    <TextInput type="text" placeholder="Name" />
  </div>

  <Button htmlType="submit">Submit</Button>
</Form>
