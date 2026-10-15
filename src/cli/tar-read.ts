import { bundlePathProblem, CliError } from './bundle-paths.js';
import type { TarEntry } from './tar.js';

// Reads a bundle archive in memory. It accepts only what `writeTar` writes: regular files and PAX
// `x` records. A link, a folder or a device stops the read, so no path of the archive ever reaches
// the disk.

const blockSize = 512;
// Fatal: a name that is not UTF-8 stops the read instead of becoming U+FFFD.
const decoder = new TextDecoder('utf-8', { fatal: true });

function decode(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new CliError('The bundle archive holds a name that is not UTF-8.');
  }
}

function text(block: Uint8Array, field: { at: number; length: number }): string {
  const bytes = block.subarray(field.at, field.at + field.length);
  const end = bytes.indexOf(0);
  return decode(end < 0 ? bytes : bytes.subarray(0, end));
}

function checkSum(block: Uint8Array): void {
  const stored = parseInt(text(block, { at: 148, length: 8 }).trim(), 8);
  let sum = 0;
  block.forEach((byte, index) => (sum += index >= 148 && index < 156 ? 32 : byte));
  if (stored !== sum) throw new CliError('The bundle archive has a damaged header.');
}

// The `path` of a PAX extended header, or `undefined` when it has none.
function paxPath(body: Uint8Array): string | undefined {
  let at = 0;
  let path: string | undefined;
  while (at < body.length) {
    const space = body.indexOf(0x20, at);
    const length = parseInt(decode(body.subarray(at, space)), 10);
    if (space < 0 || !Number.isInteger(length) || length <= 0) {
      throw new CliError('The bundle archive has a damaged PAX record.');
    }
    const record = decode(body.subarray(space + 1, at + length - 1));
    if (record.startsWith('path=')) path = record.slice('path='.length);
    at += length;
  }
  return path;
}

interface Header {
  path: string;
  type: string;
  size: number;
}

function header(block: Uint8Array): Header {
  checkSum(block);
  const name = text(block, { at: 0, length: 100 });
  const prefix = text(block, { at: 345, length: 155 });
  return {
    path: prefix === '' ? name : `${prefix}/${name}`,
    type: String.fromCharCode(block[156] ?? 0),
    size: parseInt(text(block, { at: 124, length: 12 }).trim() || '0', 8),
  };
}

// A path of the archive that leaves the bundle, or that the gateway reserves, stops the read.
function safeEntry(entry: TarEntry): TarEntry {
  const problem = bundlePathProblem(entry.path);
  if (problem !== null)
    throw new CliError(`The bundle archive holds ${entry.path}, which ${problem}.`);
  return entry;
}

export function readTar(archive: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let longPath: string | undefined;
  while (offset + blockSize <= archive.length) {
    const block = archive.subarray(offset, offset + blockSize);
    if (block.every((byte) => byte === 0)) return entries;
    const { path, type, size } = header(block);
    const body = archive.subarray(offset + blockSize, offset + blockSize + size);
    if (body.length !== size) throw new CliError(`The bundle archive ends inside ${path}.`);
    offset += blockSize + Math.ceil(size / blockSize) * blockSize;
    if (type === 'x') {
      longPath = paxPath(body);
    } else if (type === '0' || type === '\0') {
      entries.push(safeEntry({ path: longPath ?? path, bytes: body }));
      longPath = undefined;
    } else {
      throw new CliError(`The bundle archive holds ${path}, which is not a regular file.`);
    }
  }
  throw new CliError('The bundle archive has no end.');
}
