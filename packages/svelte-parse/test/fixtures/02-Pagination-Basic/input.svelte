<script>
  import Pagination from '@sveltekit/ui/Pagination';

  let current = 1;
  let pageSize = 10;
  let total = 100;
  let canNavigate = true;
  let showSummary = true;
</script>

<Pagination {current} {pageSize} {total} {canNavigate} {showSummary}></Pagination>
