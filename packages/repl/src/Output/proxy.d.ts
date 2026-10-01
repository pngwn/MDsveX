export type Handlers = Record<
	| 'on_fetch_progress'
	| 'on_error'
	| 'on_unhandled_rejection'
	| 'on_iframe_reload'
	| 'on_console',
	(data: any) => void
>;
