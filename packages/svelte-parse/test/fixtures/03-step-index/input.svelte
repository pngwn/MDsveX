{#if link}
    <a
        use:actions={use}
        use:events
        href={link}
        class="{classes}"
        {...props}
    ><slot></slot></a>
{:else}
    <div
        use:actions={use}
        use:events
        class="{classes}"
        {...props}
    ><slot></slot></div>
{/if}

<script context="module">
    import { exclude, eventsBuilder, actions, clsxd } from '../../lib'
    import { current_component } from 'svelte/internal'
    import StepGroup from './StepGroup.svelte'
    import StepContent from './StepContent.svelte'
    import StepTitle from './StepTitle.svelte'
    import StepDescription from './StepDescription.svelte'

    export { StepGroup, StepContent, StepTitle, StepDescription }
</script>

<script>
    const events = eventsBuilder(current_component)

    export let use = [];
    let className = '';
    export { className as class };

    export let link = '';
    export let active = false;
    export let disabled = false;
    export let completed = false;

    $: classes = clsxd('step', className, {
        'active': active,
        'completed': completed,
        'disabled': disabled
    })
    $: props = exclude($$props, ['use', 'class', 'link', 'active', 'disabled', 'completed'])
</script>
