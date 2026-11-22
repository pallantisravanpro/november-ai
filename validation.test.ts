import { describe, expect, it } from 'vitest';
import { chatSchema, evaluateSchema, expertSchema, parseBody } from '../server/validate.js';
import { HttpError } from '../server/errors.js';

describe('request validation', () => {
  it('rejects an empty expert request with a readable message', () => {
    try {
      parseBody(expertSchema, { language: 'en' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
      expect((err as HttpError).code).toBe('invalid_input');
      expect((err as HttpError).message).toMatch(/question or paste/i);
    }
  });

  it('accepts an expert request with only document text', () => {
    const parsed = parseBody(expertSchema, { language: 'te', documentText: 'Bill total 1200' });
    expect(parsed.language).toBe('te');
  });

  it('rejects an unknown language', () => {
    expect(() => parseBody(chatSchema, { language: 'fr', messages: [{ role: 'user', content: 'hi' }] })).toThrow(HttpError);
  });

  it('rejects empty and oversized chat messages', () => {
    expect(() => parseBody(chatSchema, { messages: [{ role: 'user', content: '   ' }] })).toThrow(HttpError);
    expect(() => parseBody(chatSchema, { messages: [{ role: 'user', content: 'x'.repeat(4001) }] })).toThrow(HttpError);
  });

  it('rejects a submission with no token or answers', () => {
    expect(() => parseBody(evaluateSchema, { token: '', answers: [] })).toThrow(HttpError);
  });
});
