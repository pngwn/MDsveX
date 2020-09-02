<script>
  export let image = undefined;
</script>

<style>
  .container img {
    width: 100%;
  }

</style>

<div class="container">
  <p>Hello form Tab2!</p>
  {#if image}
    <img src={image} alt="example image" />
  {/if}
</div>
