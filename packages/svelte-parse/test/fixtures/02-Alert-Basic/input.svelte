<script>
import Alert, { options } from "@sveltekit/ui/Alert";
import InformationIcon from "../../Icons/Information.svelte";

export let warning = "Warning! Hot food! 🔥🔥🔥🔥";
</script>

<div class="row">
  <Alert>{warning}</Alert>
</div>

<div class="row">
  <Alert type={options.type.INFORMATION}>
  {warning}
  </Alert>
</div>
