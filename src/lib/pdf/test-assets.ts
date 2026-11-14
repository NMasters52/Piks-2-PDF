import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export function loadFontBytes(): ArrayBuffer {
  return toArrayBuffer(readFileSync(join(assetRoot, 'assets/fonts/DejaVuSans.ttf')));
}

export function loadFixtureBytes(): {
  square: ArrayBuffer;
  wide: ArrayBuffer;
  tall: ArrayBuffer;
} {
  const base = join(assetRoot, 'tests/fixtures');
  return {
    square: toArrayBuffer(readFileSync(join(base, 'square-red-32.jpg'))),
    wide: toArrayBuffer(readFileSync(join(base, 'wide-green-64x32.jpg'))),
    tall: toArrayBuffer(readFileSync(join(base, 'tall-blue-32x64.jpg'))),
  };
}