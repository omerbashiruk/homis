/**
 * Fastify entrypoint (src/api/). Step 0 ships the app skeleton with health +
 * CORS. The §7 routes — sessions, donations, dashboard/report, billing — get
 * registered here next, each delegating into the same logic the MockBackend
 * already implements. When they land, set RAMADAN_CLOSE_BACKEND=http and Dev B's
 * imports keep working unchanged.
 */

import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'ramadan-close',
    backend: process.env.RAMADAN_CLOSE_BACKEND ?? 'mock',
  }));

  // TODO(step 1+): register §7 routes here.
  //   app.register(sessionRoutes);
  //   app.register(donationRoutes);
  //   app.register(readRoutes);
  //   app.register(billingRoutes);

  return app;
}

async function start(): Promise<void> {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '0.0.0.0';
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isDirectRun) {
  void start();
}
