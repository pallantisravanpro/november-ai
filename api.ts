export type ApiFailure = { code: string; message: string; details?: Array<{ field: string; message: string }> | null };

export class ApiError extends Error {
  code: string;
  status: number;
  details?: ApiFailure['details'];

  constructor(status: number, code: string, message: string, details?: ApiFailure['details']) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(
      0,
      'offline',
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'You appear to be offline. Reconnect and try again.'
        : 'Could not reach the November AI server. Check your connection and try again.',
    );
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = (data as { error?: ApiFailure } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? `The server returned ${res.status}.`,
      err?.details ?? null,
    );
  }
  if (data === null) {
    throw new ApiError(res.status, 'bad_response', 'The server sent a response that could not be read.');
  }
  return data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

// ---- Response shapes shared with the server ----

export type HealthResponse = {
  ok: boolean;
  service: string;
  model: string;
  configured: boolean;
  build: string;
  time: string;
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ExpertAnswer = {
  summary: string;
  keyTerms: Array<{ term: string; explanation: string }>;
  steps: string[];
  missingInformation: string[];
  verifiedFromYourText: string[];
  assumptions: string[];
  questionsForProfessional: string[];
  professionalHelp: string;
};

export type Lesson = {
  title: string;
  objectives: string[];
  explanation: string;
  analogy: string;
  examples: string[];
  checkQuestions: Array<{ question: string; answer: string }>;
  nextLesson: string;
};

export type AssessmentQuestion = { id: string; question: string; options: string[]; concept: string };
export type AssessmentResponse = {
  stage: 'pre' | 'quiz' | 'post';
  topic: string;
  questions: AssessmentQuestion[];
  token: string;
};

export type EvaluationResponse = {
  score: number;
  total: number;
  percentage: number;
  results: Array<{
    id: string;
    question: string;
    options: string[];
    concept: string;
    chosenIndex: number | null;
    correctIndex: number;
    correct: boolean;
    explanation: string;
  }>;
  weakConcepts: string[];
  strongConcepts: string[];
  recommendation: string;
  stage: 'pre' | 'quiz' | 'post';
  topic: string;
  subject: string;
};

/**
 * Turns an API failure into a message in the user's language. Falls back to the
 * server's own message when there is no translation for that error code.
 */
export function localizeError(t: (key: string) => string, err: unknown): string {
  if (err instanceof ApiError) {
    const key = `error.${err.code}`;
    const localized = t(key);
    if (localized !== key) return localized;
    return err.message;
  }
  return t('error.generic');
}
