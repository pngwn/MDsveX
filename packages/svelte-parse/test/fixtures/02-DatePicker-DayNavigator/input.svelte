<script>
  import DatePicker from '@sveltekit/ui/DatePicker';

  let date;
</script>

<div class="gridRow">
  <div class="gridCol-4">
    <DatePicker placeholder="Please click to select a date" bind:date canNavigate />
    <p>Date: {date}</p>
  </div>
</div>
