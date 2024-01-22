
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://kit.svelte.dev/docs/modules#$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://kit.svelte.dev/docs/configuration#env) (if configured).
 * 
 * _Unlike_ [`$env/dynamic/private`](https://kit.svelte.dev/docs/modules#$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 * 
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * 
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 * 
 * You can override `.env` values from the command line like so:
 * 
 * ```bash
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const MANPATH: string;
	export const _VOLTA_TOOL_RECURSION: string;
	export const npm_config_prefer_workspace_packages: string;
	export const npm_package_devDependencies_codemirror: string;
	export const npm_package_devDependencies_rollup_plugin_svelte: string;
	export const npm_package_devDependencies_rollup_plugin_terser: string;
	export const TERM_PROGRAM: string;
	export const npm_package_scripts_cy_run: string;
	export const NODE: string;
	export const PYENV_ROOT: string;
	export const INIT_CWD: string;
	export const SHELL: string;
	export const TERM: string;
	export const npm_package_devDependencies_unist_util_visit: string;
	export const npm_package_devDependencies_vite: string;
	export const npm_config_shamefully_hoist: string;
	export const HOMEBREW_REPOSITORY: string;
	export const TMPDIR: string;
	export const npm_package_devDependencies__rollup_plugin_babel: string;
	export const TERM_PROGRAM_VERSION: string;
	export const npm_package_scripts_dev: string;
	export const VOLTA_HOME: string;
	export const npm_package_devDependencies__rollup_plugin_replace: string;
	export const npm_package_devDependencies__babel_plugin_syntax_dynamic_import: string;
	export const npm_package_private: string;
	export const npm_package_devDependencies__sveltejs_kit: string;
	export const npm_config_registry: string;
	export const PNPM_HOME: string;
	export const npm_package_devDependencies_rehype_slug: string;
	export const USER: string;
	export const npm_package_description: string;
	export const npm_package_devDependencies__babel_plugin_transform_runtime: string;
	export const npm_package_dependencies_mdsvex: string;
	export const npm_package_dependencies_yootils: string;
	export const COMMAND_MODE: string;
	export const npm_package_devDependencies_typeface_catamaran: string;
	export const PNPM_SCRIPT_SRC_DIR: string;
	export const npm_package_dependencies_refractor: string;
	export const npm_package_devDependencies__babel_core: string;
	export const SSH_AUTH_SOCK: string;
	export const npm_package_devDependencies__rollup_plugin_commonjs: string;
	export const WARP_IS_LOCAL_SHELL_SESSION: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const npm_package_devDependencies_rehype_autolink_headings: string;
	export const npm_package_devDependencies_remark_syntax_highlight: string;
	export const npm_execpath: string;
	export const WARP_USE_SSH_WRAPPER: string;
	export const npm_package_devDependencies_svelte: string;
	export const npm_package_devDependencies__rollup_plugin_json: string;
	export const npm_package_devDependencies__babel_runtime: string;
	export const PATH: string;
	export const npm_package_devDependencies_rollup: string;
	export const LaunchInstanceID: string;
	export const __CFBundleIdentifier: string;
	export const PWD: string;
	export const npm_package_devDependencies__rollup_plugin_node_resolve: string;
	export const npm_package_devDependencies_npm_run_all: string;
	export const npm_command: string;
	export const npm_package_scripts_preview: string;
	export const npm_lifecycle_event: string;
	export const LANG: string;
	export const npm_package_name: string;
	export const npm_package_devDependencies__babel_preset_env: string;
	export const npm_package_devDependencies_svelte_json_tree: string;
	export const NODE_PATH: string;
	export const npm_package_scripts_build: string;
	export const XPC_FLAGS: string;
	export const npm_config_node_gyp: string;
	export const XPC_SERVICE_NAME: string;
	export const npm_package_version: string;
	export const npm_package_devDependencies__sveltejs_adapter_auto: string;
	export const HOME: string;
	export const PYENV_SHELL: string;
	export const SHLVL: string;
	export const npm_package_type: string;
	export const npm_package_scripts_cy_open: string;
	export const npm_package_scripts_test: string;
	export const HOMEBREW_PREFIX: string;
	export const LOGNAME: string;
	export const npm_lifecycle_script: string;
	export const SSH_SOCKET_DIR: string;
	export const npm_config_user_agent: string;
	export const HOMEBREW_CELLAR: string;
	export const INFOPATH: string;
	export const npm_package_scripts_generate_workers: string;
	export const npm_package_devDependencies_prism_svelte: string;
	export const npm_config_link_workspace_packages: string;
	export const CONDA_CHANGEPS1: string;
	export const SECURITYSESSIONID: string;
	export const npm_package_devDependencies_typeface_roboto: string;
	export const COLORTERM: string;
	export const npm_node_execpath: string;
	export const NODE_ENV: string;
}

/**
 * Similar to [`$env/static/private`](https://kit.svelte.dev/docs/modules#$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Values are replaced statically at build time.
 * 
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/master/packages/adapter-node) (or running [`vite preview`](https://kit.svelte.dev/docs/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://kit.svelte.dev/docs/configuration#env) (if configured).
 * 
 * This module cannot be imported into client-side code.
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 * 
 * > In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		MANPATH: string;
		_VOLTA_TOOL_RECURSION: string;
		npm_config_prefer_workspace_packages: string;
		npm_package_devDependencies_codemirror: string;
		npm_package_devDependencies_rollup_plugin_svelte: string;
		npm_package_devDependencies_rollup_plugin_terser: string;
		TERM_PROGRAM: string;
		npm_package_scripts_cy_run: string;
		NODE: string;
		PYENV_ROOT: string;
		INIT_CWD: string;
		SHELL: string;
		TERM: string;
		npm_package_devDependencies_unist_util_visit: string;
		npm_package_devDependencies_vite: string;
		npm_config_shamefully_hoist: string;
		HOMEBREW_REPOSITORY: string;
		TMPDIR: string;
		npm_package_devDependencies__rollup_plugin_babel: string;
		TERM_PROGRAM_VERSION: string;
		npm_package_scripts_dev: string;
		VOLTA_HOME: string;
		npm_package_devDependencies__rollup_plugin_replace: string;
		npm_package_devDependencies__babel_plugin_syntax_dynamic_import: string;
		npm_package_private: string;
		npm_package_devDependencies__sveltejs_kit: string;
		npm_config_registry: string;
		PNPM_HOME: string;
		npm_package_devDependencies_rehype_slug: string;
		USER: string;
		npm_package_description: string;
		npm_package_devDependencies__babel_plugin_transform_runtime: string;
		npm_package_dependencies_mdsvex: string;
		npm_package_dependencies_yootils: string;
		COMMAND_MODE: string;
		npm_package_devDependencies_typeface_catamaran: string;
		PNPM_SCRIPT_SRC_DIR: string;
		npm_package_dependencies_refractor: string;
		npm_package_devDependencies__babel_core: string;
		SSH_AUTH_SOCK: string;
		npm_package_devDependencies__rollup_plugin_commonjs: string;
		WARP_IS_LOCAL_SHELL_SESSION: string;
		__CF_USER_TEXT_ENCODING: string;
		npm_package_devDependencies_rehype_autolink_headings: string;
		npm_package_devDependencies_remark_syntax_highlight: string;
		npm_execpath: string;
		WARP_USE_SSH_WRAPPER: string;
		npm_package_devDependencies_svelte: string;
		npm_package_devDependencies__rollup_plugin_json: string;
		npm_package_devDependencies__babel_runtime: string;
		PATH: string;
		npm_package_devDependencies_rollup: string;
		LaunchInstanceID: string;
		__CFBundleIdentifier: string;
		PWD: string;
		npm_package_devDependencies__rollup_plugin_node_resolve: string;
		npm_package_devDependencies_npm_run_all: string;
		npm_command: string;
		npm_package_scripts_preview: string;
		npm_lifecycle_event: string;
		LANG: string;
		npm_package_name: string;
		npm_package_devDependencies__babel_preset_env: string;
		npm_package_devDependencies_svelte_json_tree: string;
		NODE_PATH: string;
		npm_package_scripts_build: string;
		XPC_FLAGS: string;
		npm_config_node_gyp: string;
		XPC_SERVICE_NAME: string;
		npm_package_version: string;
		npm_package_devDependencies__sveltejs_adapter_auto: string;
		HOME: string;
		PYENV_SHELL: string;
		SHLVL: string;
		npm_package_type: string;
		npm_package_scripts_cy_open: string;
		npm_package_scripts_test: string;
		HOMEBREW_PREFIX: string;
		LOGNAME: string;
		npm_lifecycle_script: string;
		SSH_SOCKET_DIR: string;
		npm_config_user_agent: string;
		HOMEBREW_CELLAR: string;
		INFOPATH: string;
		npm_package_scripts_generate_workers: string;
		npm_package_devDependencies_prism_svelte: string;
		npm_config_link_workspace_packages: string;
		CONDA_CHANGEPS1: string;
		SECURITYSESSIONID: string;
		npm_package_devDependencies_typeface_roboto: string;
		COLORTERM: string;
		npm_node_execpath: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * Similar to [`$env/dynamic/private`](https://kit.svelte.dev/docs/modules#$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://kit.svelte.dev/docs/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
