import { CliError, sha256Hex } from './bundle-paths.js';

// The bundle archive: an uncompressed ustar archive (workspace design D4). Every entry is a regular
// file with mode 0644, owner 0 and time 0, so one build output always gives the same bytes. A path
// longer than the 100 bytes of the ustar name field goes in a PAX `path` record before its entry.

export interface TarEntry {
  path: string;
  bytes: Uint8Array;
}

const blockSize = 512;
// The ustar size field holds 11 octal digits: less than 8 GiB.
const maxFileBytes = 8 * 1024 ** 3;
const encoder = new TextEncoder();

const octal = (value: number, width: number): string =>
  `${value.toString(8).padStart(width - 1, '0')}\0`;

function put(header: Uint8Array, field: { at: number; text: string }): void {
  header.set(encoder.encode(field.text), field.at);
}

function header(entry: { name: string; size: number; type: '0' | 'x' }): Uint8Array {
  const block = new Uint8Array(blockSize);
  put(block, { at: 0, text: entry.name });
  put(block, { at: 100, text: octal(0o644, 8) });
  put(block, { at: 108, text: octal(0, 8) });
  put(block, { at: 116, text: octal(0, 8) });
  put(block, { at: 124, text: octal(entry.size, 12) });
  put(block, { at: 136, text: octal(0, 12) });
  put(block, { at: 148, text: '        ' });
  put(block, { at: 156, text: entry.type });
  put(block, { at: 257, text: 'ustar\u000000' });
  const sum = block.reduce((total, byte) => total + byte, 0);
  put(block, { at: 148, text: `${sum.toString(8).padStart(6, '0')}\0 ` });
  return block;
}

const padding = (size: number): Uint8Array =>
  new Uint8Array((blockSize - (size % blockSize)) % blockSize);

// One PAX record: "<length> <key>=<value>\n", where the length counts the whole record.
function paxRecord(key: string, value: string): Uint8Array {
  const body = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(body);
  while (Buffer.byteLength(`${length}${body}`) !== length) {
    length = Buffer.byteLength(`${length}${body}`);
  }
  return encoder.encode(`${length}${body}`);
}

function entryBlocks(entry: TarEntry): Uint8Array[] {
  if (entry.bytes.length >= maxFileBytes) {
    throw new CliError(`${entry.path} is 8 GiB or more, which a bundle cannot hold.`);
  }
  const blocks: Uint8Array[] = [];
  let name = entry.path;
  if (Buffer.byteLength(name) > 100) {
    const record = paxRecord('path', entry.path);
    name = `long/${sha256Hex(encoder.encode(entry.path)).slice(0, 32)}`;
    blocks.push(header({ name: `pax/${name}`, size: record.length, type: 'x' }));
    blocks.push(record, padding(record.length));
  }
  blocks.push(header({ name, size: entry.bytes.length, type: '0' }));
  blocks.push(entry.bytes, padding(entry.bytes.length));
  return blocks;
}

export function writeTar(entries: TarEntry[]): Uint8Array {
  return Buffer.concat([...entries.flatMap(entryBlocks), new Uint8Array(2 * blockSize)]);
}
