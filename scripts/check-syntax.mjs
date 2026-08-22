import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['server.mjs', 'src', 'scripts'];
const files = [];
async function walk(path) {
  if (path.endsWith('.mjs')) { files.push(path); return; }
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await walk(child);
    else if (entry.name.endsWith('.mjs')) files.push(child);
  }
}
for (const root of roots) await walk(root);
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax OK: ${files.length} files.`);
