<script>
	import Button from '@sveltekit/ui/Button';
	import Checkbox from '@sveltekit/ui/Checkbox';
	import TextInput from '@sveltekit/ui/TextInput';
	import { notification, options } from '@sveltekit/ui/Notification';

	let title = 'Example Title';
	let text = 'Some text!';
	let isClosable = false;
	let isDark = false;
	let isLoading = false;
	let isTimedAction = false;
	let placement = undefined;
	let currentKey = undefined;

	function action() {
		const key = notification.generateKey();
		currentKey = key;

		notification
			.open({
				title,
				text,
				key,
				isClosable,
				placement,
				isDark,
				isTimedAction,
				isLoading,
				actions: {
					Really: () => {
						notification.complete(key);
					},
					'Try again': () => {
						notification.complete(key, 'yes I wanna try again');
					},
					Cancel: () => {
						notification.cancel(key, 'cancel please');
					},
				},
			})
			.then(() => {})
			.catch(() => {})
			.finally(() => {
				currentKey = null;
			});
	}

	function notify() {
		const key = `notification${Date.now()}`;
		currentKey = key;

		notification
			.open({
				title,
				text,
				key,
				isClosable,
				placement,
				isDark,
				isLoading,
				isTimedAction,
			})
			.then(() => {})
			.catch(() => {})
			.finally(() => {
				currentKey = null;
			});
	}

	function close() {
		notification.cancel(currentKey);
	}
</script>

<style>
	.checkbox {
		display: flex;
	}

	.checkbox span {
		margin: 0 0 0 5px;
	}
</style>

<div class="row">
	<label class="checkbox">
		<Checkbox bind:isChecked={isClosable} />
		<span>Closable</span>
	</label>

	<label class="checkbox">
		<Checkbox bind:isChecked={isDark} />
		<span>Dark</span>
	</label>

	<label class="checkbox">
		<Checkbox bind:isChecked={isLoading} />
		<span>Loading</span>
	</label>

	<label class="checkbox">
		<Checkbox bind:isChecked={isTimedAction} />
		<span>isTimedAction</span>
	</label>
</div>

<div class="row">
	<TextInput placeholder="Enter a title" bind:value={title} />
	<TextInput placeholder="Enter text" bind:value={text} />
</div>

<div class="row">
	<label for="placement">Placement:</label>
	<select id="placement" placeholder="Enter text" bind:value={placement}>
		<option value="x">DEFAULT</option>
		{#each Object.entries(options.placement) as [key, val]}
			<option value={val}>{key}</option>
		{/each}
	</select>
</div>

<div class="row">
	<Button on:click={notify}>Notify</Button>
	<Button on:click={action}>Action</Button>
</div>

{#if currentKey}
	<div class="row">
		<Button on:click={close}>Cancel</Button>
		<p>{currentKey}</p>
	</div>
{/if}
