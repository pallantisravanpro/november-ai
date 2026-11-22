import { Router } from 'express';
import { generateJson, generateText, isConfigured } from './gemini.js';
import { HttpError } from './errors.js';
import { BUILD_STAMP, GEMINI_MODEL } from './config.js';
import { rateLimit } from './ratelimit.js';
import { assessmentSchema, chatSchema, evaluateSchema, expertSchema, lessonSchema, parseBody } from './validate.js';
import {
  EXPERT_SCHEMA,
  LESSON_SCHEMA,
  QUESTIONS_SCHEMA,
  chatSystem,
  expertSystem,
  tutorLessonSystem,
  tutorQuizSystem,
  type Language,
} from './prompts.js';
import {
  compareTests,
  evaluateAnswers,
  normaliseQuestions,
  signAssessment,
  toPublicQuestions,
  verifyAssessment,
  type AssessmentToken,
  type GeneratedQuestion,
} from './quiz.js';

export const api = Router();

const aiLimiter = rateLimit({ name: 'ai', windowMs: 60_000, max: 20 });
const heavyLimiter = rateLimit({ name: 'heavy', windowMs: 60_000, max: 12 });

api.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'november-ai',
    model: GEMINI_MODEL,
    configured: isConfigured(),
    build: BUILD_STAMP,
    time: new Date().toISOString(),
  });
});

api.post('/chat', aiLimiter, async (req, res, next) => {
  try {
    const body = parseBody(chatSchema, req.body);
    const transcript = body.messages
      .map((m) => `${m.role === 'user' ? 'User' : 'November AI'}: ${m.content}`)
      .join('\n\n');

    const reply = await generateText({
      system: chatSystem(body.language as Language),
      contents: `${transcript}\n\nNovember AI:`,
      temperature: 0.7,
    });

    res.json({ reply });
  } catch (err) {
    next(err);
  }
});

api.post('/expert', heavyLimiter, async (req, res, next) => {
  try {
    const body = parseBody(expertSchema, req.body);
    const parts: string[] = [];

    if (body.history?.length) {
      parts.push(
        'Earlier in this conversation:\n' +
          body.history.map((h) => `${h.role === 'user' ? 'User' : 'Expert AI'}: ${h.content}`).join('\n'),
      );
    }
    if (body.question) parts.push(`The user asks: ${body.question}`);
    if (body.documentText) {
      parts.push(
        'Text the user pasted (treat it as their own document; do not assume anything that is not written in it):\n"""\n' +
          body.documentText +
          '\n"""',
      );
    }
    parts.push(
      'Give your answer as JSON. In "verifiedFromYourText" put only statements taken directly from the pasted text; ' +
        'if nothing was pasted, return an empty list. In "assumptions" put anything you are inferring. ' +
        'In "professionalHelp" name the professional to consult, or return an empty string if none is needed.',
    );

    const answer = await generateJson<Record<string, unknown>>({
      system: expertSystem(body.language as Language),
      contents: parts.join('\n\n'),
      schema: EXPERT_SCHEMA,
      temperature: 0.4,
    });

    res.json({ answer });
  } catch (err) {
    next(err);
  }
});

api.post('/tutor/lesson', heavyLimiter, async (req, res, next) => {
  try {
    const body = parseBody(lessonSchema, req.body);
    const weak = body.weakConcepts?.length ? `\nConcepts the learner got wrong before: ${body.weakConcepts.join(', ')}. Address them directly.` : '';
    const goal = body.goal ? `\nThe learner's goal: ${body.goal}` : '';

    const lesson = await generateJson<Record<string, unknown>>({
      system: tutorLessonSystem(body.language as Language),
      contents: `Subject: ${body.subject}\nTopic: ${body.topic}\nLearner level: ${body.level}${goal}${weak}`,
      schema: LESSON_SCHEMA,
      temperature: 0.5,
    });

    res.json({ lesson });
  } catch (err) {
    next(err);
  }
});

const STAGE_COUNT = { pre: 3, quiz: 5, post: 3 } as const;
const STAGE_BRIEF = {
  pre: 'Write 3 short diagnostic questions that check what the learner already knows about the topic. Start easy, end slightly harder.',
  quiz: 'Write 5 quiz questions that test the topic at the learner\'s level, mixing recall and application.',
  post: 'Write 3 questions of the same difficulty as the diagnostic pre-test, covering the same ground.',
} as const;

api.post('/tutor/assessment', heavyLimiter, async (req, res, next) => {
  try {
    const body = parseBody(assessmentSchema, req.body);
    const count = STAGE_COUNT[body.stage];
    const weak = body.weakConcepts?.length ? `\nThe learner previously got these wrong: ${body.weakConcepts.join(', ')}.` : '';

    const generated = await generateJson<{ questions: GeneratedQuestion[] }>({
      system: tutorQuizSystem(body.language as Language),
      contents: `Subject: ${body.subject}\nTopic: ${body.topic}\nLearner level: ${body.level}\n${STAGE_BRIEF[body.stage]}${weak}\nReturn exactly ${count} questions.`,
      schema: QUESTIONS_SCHEMA,
      temperature: 0.6,
    });

    const questions = normaliseQuestions(generated.questions, count);
    const payload: AssessmentToken = {
      v: 1,
      stage: body.stage,
      subject: body.subject,
      topic: body.topic,
      level: body.level,
      issuedAt: Date.now(),
      questions,
    };

    res.json({
      stage: body.stage,
      topic: body.topic,
      questions: toPublicQuestions(questions),
      token: signAssessment(payload),
    });
  } catch (err) {
    next(err);
  }
});

api.post('/tutor/evaluate', aiLimiter, async (req, res, next) => {
  try {
    const body = parseBody(evaluateSchema, req.body);
    const token = verifyAssessment(body.token);
    const result = evaluateAnswers(token, body.answers);
    res.json({ ...result, stage: token.stage, topic: token.topic, subject: token.subject });
  } catch (err) {
    next(err);
  }
});

api.post('/tutor/compare', aiLimiter, (req, res, next) => {
  try {
    const body = req.body as { pre?: unknown; post?: unknown };
    const asScore = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
    };
    res.json(compareTests(asScore(body.pre), asScore(body.post)));
  } catch (err) {
    next(err);
  }
});

api.use((_req, _res, next) => {
  next(new HttpError(404, 'not_found', 'That API route does not exist.'));
});
