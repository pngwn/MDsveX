import type { Handlers } from './proxy';

let uid = 1;

export default class ReplProxy {
	iframe: HTMLIFrameElement;
	handlers: Handlers;
	pending_cmds: Map<
		number,
		{ resolve: (value: any) => void; reject: (value: any) => void }
	> = new Map();

	handle_event = (event: MessageEvent<any>) => {
		if (event.source !== this.iframe.contentWindow) return;

		const { action, args } = event.data;

		switch (action) {
			case 'cmd_error':
			case 'cmd_ok':
				return this.handle_command_message(event.data);
			case 'fetch_progress':
				return this.handlers.on_fetch_progress(args.remaining);
			case 'error':
				return this.handlers.on_error(event.data);
			case 'unhandledrejection':
				return this.handlers.on_unhandled_rejection(event.data);
			case 'iframe_reload':
				return this.handlers.on_iframe_reload(event.data);
			case 'console':
				if (
					event.data.command === 'info' &&
					event.data.args[0]?.type === '__error'
				) {
					const data = event.data.args[0];
					const e = new Error(data.message);
					e.name = data.name;
					e.stack = data.stack;
					event.data.args[0] = e;
				}

				return this.handlers.on_console(event.data);
		}
	};

	constructor(iframe: HTMLIFrameElement, handlers: Handlers) {
		this.iframe = iframe;
		this.handlers = handlers;

		window.addEventListener('message', this.handle_event, false);
	}

	destroy() {
		window.removeEventListener('message', this.handle_event);
	}

	iframe_command(action: string, args: any) {
		return new Promise((resolve, reject) => {
			const cmd_id = uid++;

			this.pending_cmds.set(cmd_id, { resolve, reject });

			this.iframe.contentWindow?.postMessage({ action, cmd_id, args }, '*');
		});
	}

	handle_command_message(cmd_data: {
		action: string;
		cmd_id: number;
		message: string;
		stack: any;
		args: any;
	}) {
		let action = cmd_data.action;
		let id = cmd_data.cmd_id;
		let handler = this.pending_cmds.get(id);

		if (handler) {
			this.pending_cmds.delete(id);
			if (action === 'cmd_error') {
				let { message, stack } = cmd_data;
				let e = new Error(message);
				e.stack = stack;
				handler.reject(e);
			}

			if (action === 'cmd_ok') {
				handler.resolve(cmd_data.args);
			}
		} else {
			console.error('command not found', id, cmd_data, [
				...this.pending_cmds.keys(),
			]);
		}
	}

	eval(script: string, style?: string) {
		return this.iframe_command('eval', { script, style });
	}

	handle_links() {
		return this.iframe_command('catch_clicks', {});
	}
}
