<script>
  import Search from '@sveltekit/ui/Search';

  let searchText = '';
</script>

<Search bind:value={searchText} debounce="{true}"></Search>
<p>Search text: {searchText}</p>
