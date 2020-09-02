<script>
  import Avatar, { options } from '@sveltekit/ui/Avatar';

  export let initials = 'RB';
  export let size = options.size.MEDIUM;
</script>

<Avatar alt="{initials}" {size}></Avatar>
