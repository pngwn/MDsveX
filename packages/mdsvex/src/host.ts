/**
 * what a host that is not vite needs beside compile to do the job of the vite
 * plugin, free of vite and of node like the compile entry
 */
export { module_script, read_exports } from './read_exports';
export type { ScanKind, ScannedExports, StripTypes } from './read_exports';
