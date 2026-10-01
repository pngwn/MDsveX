export function max(version: string) {
	if (!version || version === '*' || version === 'x') {
		return 'latest';
	}

	// x and star parts are dropped
	version = version.replace(/\.[x*].+/, '');

	const match =
		/^([~^])?(\d+|[*x])(?:\.(\d+|[*x])(?:\.(\d+|[*x]))?)?(-.*)?$/.exec(version);

	if (!match) {
		console.warn(`Could not resolve version from ${version}`);
		return 'latest';
	}

	const [_, qualifier, major, minor, _patch, prerelease] = match;

	// a prerelease range may have no stable release yet, so it is kept as is
	if (prerelease) {
		return qualifier ? version.slice(qualifier.length) : version;
	}

	// caret keeps the major, or the minor below major 1
	if (qualifier === '^') {
		if (major === '0') {
			if (minor === '0') {
				return version.slice(1);
			}

			return `${major}.${minor}`;
		}

		return major;
	}

	// tilde keeps the minor
	if (qualifier === '~') {
		if (minor !== undefined) {
			return `${major}.${minor}`;
		}

		return major;
	}

	return version;
}
