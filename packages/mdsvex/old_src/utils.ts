export function to_posix(_path: string): string {
	const isExtendedLengthPath = /^\\\\\?\\/.test(_path);
	const hasNonAscii = /[^\u0000-\u0080]+/.test(_path);

	if (isExtendedLengthPath || hasNonAscii) {
		return _path;
	}

	return _path.replace(/\\/g, '/');
}

export function make_process() {
	const process = {
		title: 'browser',
		argv: [],
		version: '', // empty string to avoid regexp issues
		versions: {
			http_parser: '',
			node: '',
			v8: '',
			ares: '',
			uv: '',
			zlib: '',
			brotli: '',
			modules: '',
			nghttp2: '',
			napi: '',
			llhttp: '',
			openssl: '',
			icu: '',
			tz: '',
			unicode: '',
		},
		env: {
			NODE_ENV: 'production',
		},
		stdout: {
			isTTY: false,
		},
		binding() {
			return;
		},
		cwd() {
			return '/';
		},
		chdir() {
			return;
		},
		umask() {
			return 0;
		},
		on: noop,
		addListener: noop,
		once: noop,
		off: noop,
		removeListener: noop,
		removeAllListeners: noop,
		emit: noop,
	};

	function noop() {}

	return process;
}
