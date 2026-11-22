import crypto from 'node:crypto';
import { QUIZ_SIGNING_SECRET } from './config.js';
import { HttpError } from './errors.js';

export type GeneratedQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  concept: string;
  explanation: string;
};

export type StoredQuestion = GeneratedQuestion & { id: string };

export type AssessmentToken = {
  v: 1;
  stage: 'pre' | 'quiz' | 'post';
  subject: string;
  topic: string;
  level: string;
  issuedAt: number;
  questions: StoredQuestion[];
};

export type PublicQuestion = { id: string; question: string; options: string[]; concept: string };

const TTL_MS = 6 * 60 * 60 * 1000;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signAssessment(payload: AssessmentToken): string {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', QUIZ_SIGNING_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyAssessment(token: string, now = Date.now()): AssessmentToken {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new HttpError(400, 'bad_token', 'This assessment link is not valid. Start the quiz again.');

  const expected = crypto.createHmac('sha256', QUIZ_SIGNING_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(400, 'bad_token', 'This assessment could not be verified. Start the quiz again.');
  }

  let payload: AssessmentToken;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AssessmentToken;
  } catch {
    throw new HttpError(400, 'bad_token', 'This assessment could not be read. Start the quiz again.');
  }

  if (payload.v !== 1 || !Array.isArray(payload.questions) || payload.questions.length === 0) {
    throw new HttpError(400, 'bad_token', 'This assessment is incomplete. Start the quiz again.');
  }
  if (now - payload.issuedAt > TTL_MS) {
    throw new HttpError(400, 'bad_token', 'This quiz has expired. Start a new one.');
  }
  return payload;
}

/** Keeps the answer key server-side: the client only ever sees this shape. */
export function toPublicQuestions(questions: StoredQuestion[]): PublicQuestion[] {
  return questions.map((q) => ({ id: q.id, question: q.question, options: q.options, concept: q.concept }));
}

/** Normalises model output and rejects anything that is not a usable 4-option question. */
export function normaliseQuestions(raw: GeneratedQuestion[], expected: number): StoredQuestion[] {
  const cleaned: StoredQuestion[] = [];
  for (const q of Array.isArray(raw) ? raw : []) {
    if (!q || typeof q.question !== 'string' || !Array.isArray(q.options)) continue;
    const options = q.options.map((o) => String(o ?? '').trim()).filter((o) => o.length > 0).slice(0, 4);
    const correctIndex = Number(q.correctIndex);
    if (options.length !== 4) continue;
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) continue;
    cleaned.push({
      id: `q${cleaned.length + 1}`,
      question: String(q.question).trim(),
      options,
      correctIndex,
      concept: String(q.concept ?? 'General').trim() || 'General',
      explanation: String(q.explanation ?? '').trim(),
    });
  }
  if (cleaned.length < expected) {
    throw new HttpError(502, 'upstream_unavailable', 'The AI service did not return a usable set of questions. Please try again.');
  }
  return cleaned.slice(0, expected);
}

export type AnswerInput = { id: string; choiceIndex: number | null };

export type EvaluationResult = {
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
};

export function evaluateAnswers(token: AssessmentToken, answers: AnswerInput[]): EvaluationResult {
  const byId = new Map(answers.map((a) => [a.id, a.choiceIndex]));
  const results = token.questions.map((q) => {
    const chosenIndex = byId.has(q.id) ? byId.get(q.id) ?? null : null;
    const correct = chosenIndex !== null && chosenIndex === q.correctIndex;
    return {
      id: q.id,
      question: q.question,
      options: q.options,
      concept: q.concept,
      chosenIndex,
      correctIndex: q.correctIndex,
      correct,
      explanation: q.explanation,
    };
  });

  const score = results.filter((r) => r.correct).length;
  const total = results.length;
  const percentage = total === 0 ? 0 : Math.round((score / total) * 100);

  const weakConcepts = [...new Set(results.filter((r) => !r.correct).map((r) => r.concept))];
  const strongConcepts = [...new Set(results.filter((r) => r.correct).map((r) => r.concept))];

  const recommendation =
    weakConcepts.length === 0
      ? 'Strong result. Move on to the next lesson and try a harder level.'
      : `Revise: ${weakConcepts.join(', ')}. Re-read the lesson section for these and retry the quiz.`;

  return { score, total, percentage, results, weakConcepts, strongConcepts, recommendation };
}

/** Compares a pre-test and post-test percentage and describes the change. */
export function compareTests(pre: number | null, post: number | null): { delta: number | null; verdict: string } {
  if (pre === null || post === null) return { delta: null, verdict: 'Both tests are needed to compare progress.' };
  const delta = post - pre;
  const verdict =
    delta > 0
      ? `Improved by ${delta} percentage points.`
      : delta === 0
        ? 'No change between the pre-test and the post-test.'
        : `Dropped by ${Math.abs(delta)} percentage points — revise the weak concepts and try again.`;
  return { delta, verdict };
}
