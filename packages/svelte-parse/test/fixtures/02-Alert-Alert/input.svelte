<script>
  import { classnames } from '../../helpers/classnames';
  import options from './options';
  import AlertIcon from '../Icons/Alert.svelte';

  export let type = options.type.WARNING;

  $: ClassNames = classnames(`type-${type}`);
</script>

<style>
  .alert {
    display: flex;
    align-items: var(--Alert-align-items, center);
    padding: var(--Alert-padding, 10px);
    border-radius: var(--Alert-border-radius, 3px);
    font-weight: var(--Alert-font-weight, bold);
  }

  .type-warning {
    background: var(--secondary_1, #ff2d55);
    color: var(--Alert-warning-color, #fff);
  }

  .type-information {
    background: var(--yellow, #ffe6c1);
    color: var(--brown, #6a4000);
  }

  .icon {
    min-width: var(--Alert-icon-min-width, 20px);
    width: var(--Alert-icon-width, 20px);
    height: var(--Alert-icon-height, 20px);
    margin-right: var(--Alert-icon-margin-right, 10px);
  }

  .content {
    flex-grow: 1;
    position: relative;
  }
</style>

<div class="alert {ClassNames}">

  <div class="icon">
    <AlertIcon />
  </div>

  <div class="content">
    <slot>Alert slot fallback</slot>
  </div>
</div>
