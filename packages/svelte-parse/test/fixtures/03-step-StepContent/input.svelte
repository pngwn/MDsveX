<div 
    class="content {className}"
    {...exclude($$props, ['class'])}
><slot></slot></div>

<script context="module">
    import { exclude } from '../../lib'
</script>

<script>
    let className = ''
    export { className as class }
</script>