<script>
  import Tabs from '@sveltekit/ui/Tabs';
  import Tab1 from './_tab1.svelte';
  import Tab2 from './_tab2.svelte';

  const tabs = [
    {
      label: 'Tab 1',
      component: Tab1
    },
    {
      label: 'Tab 2',
      component: Tab2,
      attributes: {
        image: "https://i.ibb.co/C80fqb9/m2-2580x2580.jpg"
      }
    },
  ];

</script>


<Tabs {tabs}></Tabs>
