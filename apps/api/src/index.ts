import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { loadEnv } from '@sdl/shared/env';
import { getPool, closeDb } from '@sdl/db';
import { registry, httpRequestsTotal, httpRequestDurationSeconds } from './metrics.js';

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('x-request-id');
  req.headers['x-request-id'] = header && header.length > 0 ? header : randomUUID();
  next();
});

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] as string,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }),
);

app.use((req: Request, res: Response, next: NextFunction) => {
  const end = httpRequestDurationSeconds.startTimer();
  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: req.route?.path ?? req.path,
      status: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
});

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/readyz', async (_req, res) => {
  try {
    await getPool().query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    logger.error({ err }, 'readyz failed');
    res.status(503).json({ status: 'not_ready' });
  }
});

app.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
});

const server = app.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, 'api listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  server.close(() => logger.info('http server closed'));
  await closeDb().catch((err) => logger.error({ err }, 'db close failed'));
  setTimeout(() => process.exit(0), 1_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
