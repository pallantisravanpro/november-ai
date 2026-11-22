import 'dotenv/config';
import crypto from 'node:crypto';

function required(key: string, fallback = ''): string {
  return (process.env[key] ?? fallback).trim();
}

export const PORT = Number(process.env.PORT ?? 8080);

/** Server-side credential only. Never logged, never returned to a client. */
export const GEMINI_API_KEY = required('GEMINI_API_KEY');

/** The single place the model name is set. Override with GEMINI_MODEL. */
export const GEMINI_MODEL = required('GEMINI_MODEL', 'gemini-3.8-flash');

/**
 * Secret for signing tutor assessment tokens. If it is not configured we derive
 * a per-install secret so the app still works in development, and warn once.
 */
export const QUIZ_SIGNING_SECRET = (() => {
  const configured = required('QUIZ_SIGNING_SECRET');
  if (configured) return configured;
  const derived = crypto.createHash('sha256').update(`november-ai:${GEMINI_API_KEY || 'no-key'}`).digest('hex');
  console.warn('[november-ai] QUIZ_SIGNING_SECRET not set — using a derived development secret. Set it before deploying.');
  return derived;
})();

export const IS_PROD = process.env.NODE_ENV === 'production';

export const BUILD_STAMP = `v1.0.0 · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
