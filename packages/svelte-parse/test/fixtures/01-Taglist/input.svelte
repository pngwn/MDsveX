<script>
	/** Tags inside are attached together	
    * @svelte-prop {Boolean} [attached=false]
    * */
	export let attached = false; 
</script>


<div class="tags" class:has-addons={attached}>
    <slot/>
</div>

