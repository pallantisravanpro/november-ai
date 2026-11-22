import { z, type ZodType } from 'zod';
import { LANGUAGES } from './prompts.js';
import { HttpError } from './errors.js';

const language = z.enum(LANGUAGES);

export const chatSchema = z.object({
  language: language.default('en'),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1, 'Message text is empty.').max(4000, 'A message is too long (4000 characters maximum).'),
      }),
    )
    .min(1, 'Send at least one message.')
    .max(30, 'Too many messages in one request (30 maximum).'),
});

export const expertSchema = z
  .object({
    language: language.default('en'),
    question: z.string().trim().max(4000, 'Question is too long (4000 characters maximum).').optional(),
    documentText: z.string().trim().max(20000, 'Document text is too long (20000 characters maximum).').optional(),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
      .max(20)
      .optional(),
  })
  .refine((v) => (v.question ?? '').length > 0 || (v.documentText ?? '').length > 0, {
    message: 'Type a question or paste some document text.',
    path: ['question'],
  });

export const lessonSchema = z.object({
  language: language.default('en'),
  subject: z.string().trim().min(1, 'Choose a subject.').max(80),
  topic: z.string().trim().min(2, 'Enter a topic (at least 2 characters).').max(120),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  goal: z.string().trim().max(300).optional(),
  weakConcepts: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
});

export const assessmentSchema = z.object({
  language: language.default('en'),
  subject: z.string().trim().min(1, 'Choose a subject.').max(80),
  topic: z.string().trim().min(2, 'Enter a topic (at least 2 characters).').max(120),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  stage: z.enum(['pre', 'quiz', 'post']).default('quiz'),
  weakConcepts: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
});

export const evaluateSchema = z.object({
  token: z.string().min(10, 'Assessment token is missing.'),
  answers: z
    .array(
      z.object({
        id: z.string().min(1),
        choiceIndex: z.number().int().min(-1).max(3).nullable(),
      }),
    )
    .min(1, 'No answers were submitted.')
    .max(20),
});

export function parseBody<S extends ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      field: i.path.join('.') || 'body',
      message: i.message,
    }));
    throw new HttpError(400, 'invalid_input', issues[0]?.message ?? 'The request is not valid.', issues);
  }
  return result.data;
}
