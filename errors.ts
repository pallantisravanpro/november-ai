export type ErrorCode =
  | 'invalid_input'
  | 'not_configured'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'upstream_rejected'
  | 'bad_token'
  | 'not_found'
  | 'internal';

export class HttpError extends Error {
  status: number;
  code: ErrorCode;
  details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Removes anything that could leak a credential before an error reaches a client. */
export function safeMessage(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length > 6) out = out.split(s).join('[redacted]');
  }
  return out.replace(/AIza[0-9A-Za-z\-_]{10,}/g, '[redacted]');
}
