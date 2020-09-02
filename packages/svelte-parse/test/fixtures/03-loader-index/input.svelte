<script>
    export let size = '';
    export let color = '';
    export let speed = '';
    export let style = '';
    export let text = '';
    export let inline = false;
    export let centered = false;
    export let inverted = false;
    export let intermediate = false;
    export let active = true;
    export let disabled = false;
</script>

<div class="ui {size} {speed} {style} {color} loader" class:intermediate class:inline class:centered
class:active class:disabled class:inverted>
    {text}
</div>