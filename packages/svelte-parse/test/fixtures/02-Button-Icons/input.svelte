<script>
  import Button, { options } from '@sveltekit/ui/Button';
  import SvgIcon from 'svelte-loader!@fortawesome/fontawesome-free/svgs/solid/plus.svg';
  import SvelteIconsIcon from 'svelte-icons/md/MdAdd.svelte';
  import { Add as SvelteKitIcon } from '@sveltekit/ui/Icons';
</script>



<div class="row">
  <span class="col">
    <Button>No icon</Button>
  </span>
  <span>
    <Button Icon="{ SvelteKitIcon }" iconPosition="{options.iconPosition.LEFT}">
      With icon
    </Button>
  </span>
  <span>
    <Button Icon="{ SvelteKitIcon }" iconPosition="{options.iconPosition.RIGHT}">
      With icon
    </Button>
  </span>
  <span>
    <Button Icon="{ SvelteKitIcon }"></Button>
  </span>
</div>


<h3>Different Icon Sets</h3>

<div class="row">
  <span>
    <Button Icon="{ SvgIcon }" iconPosition="{options.iconPosition.LEFT}">SVG Icon from Font Awesome</Button>
    <Button Icon="{ SvelteIconsIcon }" iconPosition="{options.iconPosition.LEFT}">Svelte Icon from Svelte Icons</Button>
    <Button Icon="{ SvelteKitIcon }" iconPosition="{options.iconPosition.LEFT}">Svelte Icon from SvelteKit</Button>
  </span>
</div>
