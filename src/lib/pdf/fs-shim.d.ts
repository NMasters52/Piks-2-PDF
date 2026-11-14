/** Minimal Node typings for PDF test asset loading (no @types/node in project). */
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
}
declare module 'node:url' {
  export function fileURLToPath(path: URL | string): string;
}