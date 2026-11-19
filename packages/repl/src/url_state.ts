import type { ReplState } from './types';

const VERSION = 1;

function to_base64url(bytes: Uint8Array) {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function from_base64url(text: string) {
	const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function pipe(
	bytes: Uint8Array,
	stream: CompressionStream | DecompressionStream
) {
	const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
	return new Uint8Array(await new Response(body).arrayBuffer());
}

/** gzipped json in base64url, short enough for a link and safe in a url hash */
export async function encode_state(state: ReplState): Promise<string> {
	const json = JSON.stringify({ v: VERSION, ...state });
	const gzipped = await pipe(
		new TextEncoder().encode(json),
		new CompressionStream('gzip')
	);
	return to_base64url(gzipped);
}

/** returns null for anything that is not a state this module wrote */
export async function decode_state(encoded: string): Promise<ReplState | null> {
	try {
		const bytes = await pipe(
			from_base64url(encoded),
			new DecompressionStream('gzip')
		);
		const { v, ...state } = JSON.parse(new TextDecoder().decode(bytes));
		if (v !== VERSION || !Array.isArray(state.files)) return null;
		return state as ReplState;
	} catch {
		return null;
	}
}
