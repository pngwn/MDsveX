<script>
  import DatePicker from '@sveltekit/ui/DatePicker';

  let date = '2/1/2021';
  let minDate = '2/1/2021'
  let maxDate = '20/1/2021'
</script>

<div class="gridRow">
  <div class="gridCol-4">
    <DatePicker placeholder="Please click to select a date" bind:date {minDate} {maxDate} />
    <p>Date: {date}</p>
    <p>minDate: {minDate}</p>
    <p>maxDate: {maxDate}</p>
  </div>
</div>
