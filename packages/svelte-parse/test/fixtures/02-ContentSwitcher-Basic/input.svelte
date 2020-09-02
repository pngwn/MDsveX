<script>
  import ContentSwitcher from '@sveltekit/ui/ContentSwitcher';
  import { Alert, Add, ArrowUp } from '@sveltekit/ui/Icons';

  const items = [
    {
      label: 'Tab 1',
      Icon: Alert
    },
    {
      label: 'Tab 2',
      Icon: Add
    },
    {
      label: 'Tab 3',
      Icon: ArrowUp
    }
  ]
</script>

<ContentSwitcher {items}></ContentSwitcher>
