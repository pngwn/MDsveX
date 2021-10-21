export function to_posix(_path: string): string {
	const isExtendedLengthPath = /^\\\\\?\\/.test(_path);
	const hasNonAscii = /[^\u0000-\u0080]+/.test(_path);

	if (isExtendedLengthPath || hasNonAscii) {
		return _path;
	}

	return _path.replace(/\\/g, '/');
}
