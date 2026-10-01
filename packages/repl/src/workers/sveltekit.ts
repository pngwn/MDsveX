const virtual_module =
	/^\$(?:app|env)(?:\/|$)|^\$(?:lib|service-worker)(?:\/|$)/;

export function is_sveltekit_virtual_module(id: string) {
	return virtual_module.test(id);
}
