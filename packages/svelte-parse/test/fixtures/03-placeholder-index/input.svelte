<div 
    use:actions={use}
    use:events
    class="{clsxd(
        'ui',
        fluid && 'fluid',
        inverted && 'inverted',
        className,
        'placeholder'
    )}"
>
    {#if header}
        <div class="header" class:image>
            <slot name="header">
                {#each iterable(header) as line}
                    <Line size={line} />
                {/each}
            </slot>
        </div>
    {/if}
    <slot>
        {#if image && !header}
            <div class="image {image}"></div>
        {:else if paragraphs && lines}
            {#each iterable(paragraphs) as para}
                <Paragraph>
                    {#each iterable(lines) as line}
                        <Line size={line} />
                    {/each}
                </Paragraph>
            {/each}
        {:else if paragraphs}
            {#each iterable(paragraphs) as para}
                <Paragraph>
                    {#each iterable(para) as line}
                        <Line size={line} />
                    {/each}
                </Paragraph>
            {/each}
        {:else if lines}
            {#each iterable(lines) as line}
                <Line size={line} />
            {/each}
        {/if}
    </slot>
</div>

<script context="module">
    import { exclude, eventsBuilder, actions, clsxd } from '../../lib'
    import { current_component } from 'svelte/internal'
    import Paragraph from './Paragraph.svelte'
    import Line from './Line.svelte'

    export { Line, Paragraph }
</script>

<script>
    const events = eventsBuilder(current_component)

    export let use = [];
    let className = '';
    export { className as class };

    export let fluid = false;
    export let inverted = false;
    export let header = false;
    export let image = '';
    export let lines = '';
    export let paragraphs = []

    function iterable(t) {
        if (Array.isArray(t)) return t;
        else {
            t = parseInt(t)
            return Array(isNaN(t) ? 1 : t).fill('');
        }
    }
</script>

