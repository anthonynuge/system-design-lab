import pino, { type Logger, type LoggerOptions } from 'pino';
import { loadEnv } from '@sdl/shared/env';

// One root logger per process. Services derive children with bindings
// (service name, request id, job id) instead of recreating loggers.
//
// INTENTIONAL: no pretty printing in dev. JSON only. Pretty output hides
// the shape of real logs and removes the practice of reading them as
// structured data. Pipe through `pino-pretty` in your shell if you want.
let rootLogger: Logger | undefined;

export function getLogger(bindings: Record<string, unknown> = {}): Logger {
  if (!rootLogger) {
    const env = loadEnv();
    const opts: LoggerOptions = {
      level: env.LOG_LEVEL,
      // ISO timestamps so they sort lexically in log aggregators
      timestamp: pino.stdTimeFunctions.isoTime,
      // 'err' is pino's serializer key for Error instances
      serializers: { err: pino.stdSerializers.err },
    };
    rootLogger = pino(opts);
  }
  return Object.keys(bindings).length === 0 ? rootLogger : rootLogger.child(bindings);
}

// For per-request child loggers carrying the X-Request-ID. The api binds
// this on every request; workers bind it from the job's request_id column
// so a single id traces api -> queue -> worker -> downstream HTTP.
export function childWithRequestId(parent: Logger, requestId: string): Logger {
  return parent.child({ requestId });
}

export type { Logger };
