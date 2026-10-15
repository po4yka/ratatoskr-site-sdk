import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// The vendored contract files are byte-exact copies from ratatoskr-contracts at the commit in
// contracts/contracts.lock.json. This fails on a changed byte, on a missing file, and on a file in
// a vendored folder that the lock does not name.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(root, 'contracts', 'contracts.lock.json');
const vendoredDirs = ['src/contracts', 'contracts/fixtures', 'contracts/schemas'];

function listFiles(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

function digestOf(path) {
  try {
    return createHash('sha256')
      .update(readFileSync(join(root, path)))
      .digest('hex');
  } catch {
    return 'absent';
  }
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const problems = [];
for (const file of lock.files) {
  const actual = digestOf(file.path);
  if (actual !== file.sha256) {
    problems.push(`${file.path}\n    expected: ${file.sha256}\n    actual:   ${actual}`);
  }
}
const locked = new Set(lock.files.map((file) => file.path));
for (const path of vendoredDirs.flatMap(listFiles)) {
  if (!locked.has(path)) {
    problems.push(`${path}\n    is in a vendored folder and not in the lock`);
  }
}

if (problems.length > 0) {
  console.error(
    `The vendored contract files no longer match contracts/contracts.lock.json ` +
      `(ratatoskr-contracts ${lock.commit}):\n  ${problems.join('\n  ')}\n` +
      `Copy the files again from that commit, or move the pin as DEVELOPMENT.md says.`,
  );
  process.exit(1);
}
console.log(
  `${lock.files.length} vendored contract files match ratatoskr-contracts ${lock.commit}.`,
);
