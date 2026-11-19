if (!Array.prototype.at) {
	Array.prototype.at = function (index: number) {
		return this[index >= 0 ? index : this.length + index];
	};
}

if (!Promise.withResolvers) {
	Promise.withResolvers = function <T>() {
		let resolve!: (value: T | PromiseLike<T>) => void;
		let reject!: (reason?: unknown) => void;
		const promise = new Promise<T>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { resolve, reject, promise };
	};
}

export {};
