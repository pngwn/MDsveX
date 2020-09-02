<script>
  import TextInput from '@sveltekit/ui/TextInput';
  let value = '';
</script>

<TextInput bind:value></TextInput>
<p>Value: {value}</p>
