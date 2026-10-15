import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateClient, generatedDir } from './generate-client.js';

// The SHA-256 of each file in `dir`, by its name. A folder that does not exist has no files.
async function digests(dir: string): Promise<Record<string, string>> {
  const names = await readdir(dir).catch(() => []);
  const result: Record<string, string> = {};
  for (const name of names.sort()) {
    result[name] = createHash('sha256')
      .update(await readFile(join(dir, name)))
      .digest('hex');
  }
  return result;
}

describe('generated-drift', () => {
  it('generated client matches the pinned contracts', async () => {
    const fresh = await mkdtemp(join(tmpdir(), 'site-sdk-generated-'));
    try {
      await generateClient(fresh);
      expect(await digests(generatedDir)).toEqual(await digests(fresh));
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }
  });
});
