<script>
  import Card, { options } from '@sveltekit/ui/Card';

  export let count = 0;
  export let isClickable = true;
  export let isClickDisabled = false;
</script>

<style>
  .content {
    padding: 20px;
  }
</style>

<div class="col">
  <Card on:click="{() => count += 1 }" {isClickDisabled} {isClickable}>
    <div class="content">
      <h3>Clickable</h3>
      <p>Click to increase count</p>
    </div>
  </Card>

  <Card>
    <div class="content">
      <p>Click count: { count }</p>
    </div>
  </Card>
</div>

