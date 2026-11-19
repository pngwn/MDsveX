type Command =
	| 'info'
	| 'warn'
	| 'error'
	| 'table'
	| 'group'
	| 'clear'
	| 'unclonable';

export class Log {
	command: Command;
	args?: any[];
	stack?: Array<{
		label?: string;
		location?: string;
	}>;
	data?: any;
	columns?: string[];

	collapsed = $state(false);
	expanded = $state(false);
	count = $state(1);
	logs = $state([]);

	constructor(data: any) {
		this.command = data.command;
		Object.assign(this, data);
	}
}
