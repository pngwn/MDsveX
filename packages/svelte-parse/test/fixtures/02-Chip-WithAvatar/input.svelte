<script>
  import Chip from '@sveltekit/ui/Chip';

  let avatarWithImage = {
    alt: '',
    src: '/avatar_example.gif'
  };

  let avatarNoImage = {
    alt: 'XX'
  };

</script>

<div class="row">
  <span>
    <Chip avatar="{avatarWithImage}">
      Chip with Avatar image
    </Chip>
  </span>

  <span>
    <Chip avatar="{avatarNoImage}">
      Chip with Avatar text
    </Chip>
  </span>
</div>
