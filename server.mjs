import { createServer } from 'node:http';
import { createApplication } from './src/app.mjs';
import { loadConfig } from './src/config.mjs';
import { createDatabase } from './src/persistence/db.mjs';
import { createRepository } from './src/persistence/repository.mjs';
import { createP1Repository } from './src/persistence/p1-repository.mjs';
import { createActivityRepository } from './src/persistence/activity-repository.mjs';

const config = loadConfig();
const db = createDatabase(config);
const repository = Object.assign(createRepository(db), createP1Repository(db), createActivityRepository(db));
const handler = createApplication({ config, repository });

const server = createServer(handler);
server.listen(config.port, '0.0.0.0', () => {
  console.log(`Sport Athlete Management listening on 0.0.0.0:${config.port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(async () => {
    await db.close().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
