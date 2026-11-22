import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUILD_STAMP, GEMINI_API_KEY, IS_PROD, PORT } from './config.js';
import { HttpError } from './errors.js';
import { api } from './routes.js';
import { installProxyFromEnv } from './proxy.js';

const proxyHost = installProxyFromEnv();

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: IS_PROD ? false : true }));
app.use(express.json({ limit: '256kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use('/api', api);

// Serve the built frontend in production (single origin, no CORS needed).
const distDir = path.resolve(here, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '1h', index: false }));
  // Express 5 needs a named or RegExp wildcard for the SPA fallback.
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// Central error handler: never leaks a key or a stack trace to the client.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details ?? null } });
    return;
  }
  const anyErr = err as { status?: number; message?: string };
  if (anyErr?.status === 400) {
    res.status(400).json({ error: { code: 'invalid_input', message: 'The request body could not be read.', details: null } });
    return;
  }
  const message = String(anyErr?.message ?? 'Unexpected server error');
  console.error('[november-ai] unhandled error:', message.split(GEMINI_API_KEY || '\u0000').join('[redacted]'));
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong on the server. Please try again.', details: null } });
});

app.listen(PORT, () => {
  console.log(`[november-ai] ${BUILD_STAMP}`);
  console.log(`[november-ai] API on http://localhost:${PORT}/api`);
  if (proxyHost) console.log(`[november-ai] Outbound HTTP goes through proxy ${proxyHost}`);
  console.log(
    GEMINI_API_KEY
      ? '[november-ai] GEMINI_API_KEY is configured.'
      : '[november-ai] GEMINI_API_KEY is MISSING — AI routes will return a clear 503 until it is set.',
  );
});
