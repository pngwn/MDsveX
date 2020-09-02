<script>
  import Tag from '@sveltekit/ui/Tag';
  import { options } from '@sveltekit/ui/Tag';
  import { Alert as AlertIcon } from '@sveltekit/ui/Icons';

  export let iconPosition = options.iconPosition.LEFT;
  export let tabLabel = 'Example label';
</script>

<Tag Icon="{ AlertIcon }" { iconPosition }>{ tabLabel }</Tag>
