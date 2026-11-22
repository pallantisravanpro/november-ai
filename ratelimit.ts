import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './errors.js';

type Bucket = { hits: number[]; };

/**
 * Fixed-window (60 s) per-IP limiter. In-memory, so it protects a single
 * instance; put a shared store behind it if you run several.
 */
export function rateLimit(opts: { windowMs: number; max: number; name: string }) {
  const buckets = new Map<string, Bucket>();

  return function limiter(req: Request, _res: Response, next: NextFunction) {
    const key = `${opts.name}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const bucket = buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < opts.windowMs);

    if (bucket.hits.length >= opts.max) {
      const retryAfter = Math.ceil((opts.windowMs - (now - bucket.hits[0])) / 1000);
      next(
        new HttpError(
          429,
          'rate_limited',
          `Too many requests. Please wait ${retryAfter}s and try again.`,
        ),
      );
      return;
    }

    bucket.hits.push(now);
    buckets.set(key, bucket);

    if (buckets.size > 5000) {
      for (const [k, b] of buckets) {
        if (b.hits.every((t) => now - t >= opts.windowMs)) buckets.delete(k);
      }
    }
    next();
  };
}
