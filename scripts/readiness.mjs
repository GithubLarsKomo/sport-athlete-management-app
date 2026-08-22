import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/persistence/db.mjs';

const config = loadConfig();
const db = createDatabase(config);

try {
  await db.query('SELECT 1 AS ok');
  console.log('READY');
} catch {
  console.error('NOT_READY');
  process.exitCode = 1;
} finally {
  await db.close().catch(() => {});
}
