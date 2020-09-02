<script>
  import Card, { options } from '@sveltekit/ui/Card';
</script>

<style>
  .content {
    padding: 20px;
  }
</style>

<div class="col">
  {#each Object.entries(options.level) as [levelKey, levelValue]}
  <span>
    <Card level="{levelValue}">
      <div class="content">
        <h3>Card</h3>
        <p>card.options.level.{ levelKey }</p>
      </div>
    </Card>
  </span>
  {/each}
</div>
