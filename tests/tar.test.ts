import { describe, expect, it } from 'vitest';

import { CliError } from '../src/cli/bundle-paths.js';
import { readTar } from '../src/cli/tar-read.js';
import { writeTar } from '../src/cli/tar.js';

// SITE-026 review, low findings: the bundle archive reader accepts only regular files on safe
// paths with UTF-8 names, and the writer refuses a file that the ustar size field cannot hold.

// Writes `byte` at `at` in the first header of `archive`, and computes the checksum again.
function patched(archive: Uint8Array, change: { at: number; byte: number }): Uint8Array {
  const copy = new Uint8Array(archive);
  copy[change.at] = change.byte;
  let sum = 0;
  for (let index = 0; index < 512; index += 1) {
    sum += index >= 148 && index < 156 ? 32 : (copy[index] ?? 0);
  }
  copy.set(new TextEncoder().encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148);
  return copy;
}

const one = (path: string): Uint8Array => writeTar([{ path, bytes: Buffer.from('x') }]);

describe('the bundle archive', () => {
  it('reads back what writeTar writes, also a long path', () => {
    const long = `a/${'b'.repeat(150)}/c.txt`;
    const entries = readTar(
      writeTar([
        { path: 'index.html', bytes: Buffer.from('<p>') },
        { path: long, bytes: Buffer.from('long') },
      ]),
    );
    expect(entries.map((entry) => [entry.path, Buffer.from(entry.bytes).toString()])).toEqual([
      ['index.html', '<p>'],
      [long, 'long'],
    ]);
  });

  it('refuses a symbolic link', () => {
    // Type flag `2` is a symbolic link.
    const link = patched(one('link'), { at: 156, byte: '2'.charCodeAt(0) });
    expect(() => readTar(link)).toThrow(/link, which is not a regular file/);
  });

  it.each(['../../etc/passwd', '/etc/passwd', 'a/./b', '_r/v1/sites/docs/content'])(
    'refuses the path %s',
    (path) => {
      expect(() => readTar(one(path))).toThrow(CliError);
    },
  );

  it('refuses a name that is not UTF-8', () => {
    const name = patched(one('xy'), { at: 0, byte: 0xff });
    expect(() => readTar(name)).toThrow(CliError);
  });

  it('writeTar refuses a file of 8 GiB or more', () => {
    const huge = { length: 8 * 1024 ** 3 } as Uint8Array;
    expect(() => writeTar([{ path: 'huge.bin', bytes: huge }])).toThrow(CliError);
  });
});
