<script>
  import { onDestroy } from 'svelte';

  import Button from '@sveltekit/ui/Button';
  import Modal from '@sveltekit/ui/Modal';
  import modalService from '../modal';

  let modal = undefined;

  function showModal() {
    modal = modalService.open(Modal,
      {
        title: 'Modal title',
        maxWidth: '100%'
      },
      '<h3>Model content</h3>'
    );
  }

  onDestroy(() => {
    if (modal) modalService.remove();
  });

</script>

<Button on:click="{showModal}">Show Modal</Button>
