<script>
  import DatePicker from '@sveltekit/ui/DatePicker';

  let date;
  let toDate;
</script>

<div class="gridRow">
  <div class="gridCol-4">
    <DatePicker placeholder="Please click to select a date" bind:date bind:toDate isRange />
    <p>Date: {date}</p>
    <p>toDate: {toDate}</p>
  </div>
</div>
