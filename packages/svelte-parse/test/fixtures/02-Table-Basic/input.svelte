<script>
  import Table from '@sveltekit/ui/Table';

  const columns = [
    {
      title: 'First Name',
      cell: 'FirstName'
    },
    {
      title: 'Last Name',
      cell: 'LastName'
    },
    {
      title: 'Total Bookings',
      cell: 'Score'
    }
  ]

  const data = [
    {
      FirstName: 'Xavier',
      LastName: 'Xu',
      Score: 106
    },
    {
      FirstName: 'Bobby',
      LastName: 'Bilbosh',
      Score: 71
    }
  ];
</script>

<Table {columns} {data}>
  <div slot="noResults">
    Sorry there are no results so <button>Do something</button>
  </div>
</Table>
