<script>
  import Alert, { options } from '@sveltekit/ui/Alert';
</script>

<div class="row">
  <Alert>
    Warning! VERY LONG MESSAGE VERY LONG MESSAGE VERY LONG MESSAGE VERY LONG
    MESSAGE VERY LONG MESSAGE VERY LONG MESSAGE VERY LONG MESSAGE VERY LONG
    MESSAGE.
  </Alert>
</div>

<div class="row">
  <Alert type={options.type.INFORMATION}>
    Information! VERY LONG MESSAGE VERY LONG MESSAGE VERY LONG MESSAGE VERY LONG
    MESSAGE VERY LONG MESSAGE VERY LONG MESSAGE VERY LONG MESSAGE VERY LONG
    MESSAGE.
  </Alert>
</div>
