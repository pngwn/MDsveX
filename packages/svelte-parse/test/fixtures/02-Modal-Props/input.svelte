<script>
  import { onDestroy } from 'svelte';

  import Checkbox from '@sveltekit/ui/Checkbox';
  import Button from '@sveltekit/ui/Button';
  import Modal from '@sveltekit/ui/Modal';
  import modalService from '../modal';

  let modal = undefined;

  export let modalProps = {
    hasCancelButton: true,
    hasFooter: true,
    hasOverlay: true,
    isClosable: true,
    isWaiting: false,
    isOverlayClosable: true,
    isKeyboardClosable: true,
    isOkDisabled: false,
    maxWidth: '100%'
  };

  function showModal() {
    modal = modalService.open(
      Modal,
      {
        title: 'Modal title',
        ...modalProps
      },
      '<h3>Model content</h3>'
    );
  }

  onDestroy(() => {
    if (modal) {
      modalService.remove();
    }
  });
</script>

<style>
  .prop {
    display: flex;
  }

  .prop span {
    margin: 0 0 0 5px;
  }
</style>

<div class="row">
  {#each Object.entries(modalProps) as [propName, propValue]}
    <label class="prop">
      <Checkbox name={propName} bind:isChecked={modalProps[propName]} />
      <span>{propName}</span>
    </label>
  {/each}
</div>

<Button on:click={showModal}>Show Modal</Button>
