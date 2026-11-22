import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL } from './config.js';
import { HttpError, safeMessage } from './errors.js';

let client: GoogleGenAI | null = null;

export function isConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
}

function getClient(): GoogleGenAI {
  if (!isConfigured()) {
    throw new HttpError(
      503,
      'not_configured',
      'The AI backend has no GEMINI_API_KEY configured on the server. Add it to the server environment and restart.',
    );
  }
  if (!client) client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  return client;
}

/** Maps an SDK/network failure onto a client-safe HTTP error. */
export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  const anyErr = err as { status?: number; code?: number | string; message?: string; name?: string };
  const raw = String(anyErr?.message ?? err ?? 'Unknown error');
  const message = safeMessage(raw, [GEMINI_API_KEY]);
  const status = typeof anyErr?.status === 'number' ? anyErr.status : undefined;

  if (status === 429 || /RESOURCE_EXHAUSTED|rate limit|quota/i.test(raw)) {
    return new HttpError(429, 'rate_limited', 'The AI service is rate limited right now. Please retry in a moment.');
  }
  if (status === 401 || status === 403 || /API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i.test(raw)) {
    return new HttpError(
      502,
      'upstream_rejected',
      'The AI service rejected the server credential. Check that GEMINI_API_KEY is valid and enabled for this model.',
    );
  }
  if (status === 404 || /NOT_FOUND|model.*not found|not supported/i.test(raw)) {
    return new HttpError(
      502,
      'upstream_rejected',
      `The configured model "${GEMINI_MODEL}" was rejected by the AI service. Set GEMINI_MODEL to a model your API key can use.`,
    );
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(raw)) {
    return new HttpError(502, 'upstream_unavailable', 'Could not reach the AI service. Check the server network connection.');
  }
  return new HttpError(502, 'upstream_unavailable', `The AI service failed: ${message.slice(0, 300)}`);
}

const RETRYABLE = /429|5\d\d/;

export async function generateText(args: {
  system: string;
  contents: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const ai = getClient();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: args.contents,
        config: {
          systemInstruction: args.system,
          temperature: args.temperature ?? 0.6,
          maxOutputTokens: args.maxOutputTokens ?? 1600,
        },
      });
      const text = (response.text ?? '').trim();
      if (!text) throw new HttpError(502, 'upstream_unavailable', 'The AI service returned an empty response. Please try again.');
      return text;
    } catch (err) {
      lastError = err;
      const mapped = toHttpError(err);
      if (attempt === 0 && mapped.status === 429) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      throw mapped;
    }
  }
  throw toHttpError(lastError);
}

export async function generateJson<T>(args: {
  system: string;
  contents: string;
  schema: unknown;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<T> {
  const ai = getClient();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: args.contents,
        config: {
          systemInstruction: args.system,
          temperature: args.temperature ?? 0.5,
          maxOutputTokens: args.maxOutputTokens ?? 2400,
          responseMimeType: 'application/json',
          responseJsonSchema: args.schema,
        },
      });
      const raw = (response.text ?? '').trim();
      if (!raw) throw new HttpError(502, 'upstream_unavailable', 'The AI service returned an empty response. Please try again.');
      return parseJson<T>(raw);
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError) throw err;
      const mapped = toHttpError(err);
      if (attempt === 0 && (mapped.status === 429 || mapped.code === 'upstream_unavailable')) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      throw mapped;
    }
  }
  throw toHttpError(lastError);
}

/** Tolerates stray code fences or prose around the JSON object. */
export function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fall through */
      }
    }
    throw new HttpError(502, 'upstream_unavailable', 'The AI service returned a response that could not be read. Please try again.');
  }
}

export { RETRYABLE };
