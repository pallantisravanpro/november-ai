import { describe, expect, it } from 'vitest';
import {
  compareTests,
  evaluateAnswers,
  normaliseQuestions,
  signAssessment,
  toPublicQuestions,
  verifyAssessment,
  type AssessmentToken,
  type GeneratedQuestion,
} from '../server/quiz.js';

const gen = (over: Partial<GeneratedQuestion> = {}): GeneratedQuestion => ({
  question: 'What is 2 + 2?',
  options: ['3', '4', '5', '6'],
  correctIndex: 1,
  concept: 'Addition',
  explanation: '2 + 2 equals 4.',
  ...over,
});

function tokenFor(questions = [gen()]): AssessmentToken {
  return {
    v: 1,
    stage: 'quiz',
    subject: 'Mathematics',
    topic: 'Addition',
    level: 'beginner',
    issuedAt: Date.now(),
    questions: normaliseQuestions(questions, questions.length),
  };
}

describe('assessment tokens', () => {
  it('round-trips a signed assessment', () => {
    const token = signAssessment(tokenFor());
    const parsed = verifyAssessment(token);
    expect(parsed.topic).toBe('Addition');
    expect(parsed.questions[0].correctIndex).toBe(1);
  });

  it('rejects a tampered payload', () => {
    const token = signAssessment(tokenFor());
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...tokenFor(), topic: 'Hacked' })).toString('base64url');
    expect(() => verifyAssessment(`${forged}.${sig}`)).toThrow(/verified|valid/i);
    expect(() => verifyAssessment(`${body}.${sig.slice(0, -2)}xx`)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = signAssessment({ ...tokenFor(), issuedAt: Date.now() - 7 * 60 * 60 * 1000 });
    expect(() => verifyAssessment(token)).toThrow(/expired/i);
  });

  it('never exposes the answer key to the client', () => {
    const publicQuestions = toPublicQuestions(tokenFor().questions);
    expect(JSON.stringify(publicQuestions)).not.toContain('correctIndex');
    expect(JSON.stringify(publicQuestions)).not.toContain('explanation');
  });
});

describe('question normalisation', () => {
  it('drops questions without four options or a valid index', () => {
    const cleaned = normaliseQuestions(
      [gen(), gen({ options: ['a', 'b'] }), gen({ correctIndex: 9 })],
      1,
    );
    expect(cleaned).toHaveLength(1);
  });

  it('fails loudly when the model returns too few usable questions', () => {
    expect(() => normaliseQuestions([gen({ options: [] })], 5)).toThrow(/usable set of questions/i);
  });
});

describe('scoring', () => {
  const questions = [
    gen({ concept: 'Addition' }),
    gen({ question: 'Capital of India?', options: ['Mumbai', 'Delhi', 'Kolkata', 'Chennai'], correctIndex: 1, concept: 'Capitals' }),
    gen({ question: 'Water formula?', options: ['H2O', 'CO2', 'O2', 'NaCl'], correctIndex: 0, concept: 'Formulae' }),
  ];
  const token = tokenFor(questions);

  it('scores an all-correct submission as 100%', () => {
    const result = evaluateAnswers(token, [
      { id: 'q1', choiceIndex: 1 },
      { id: 'q2', choiceIndex: 1 },
      { id: 'q3', choiceIndex: 0 },
    ]);
    expect(result.score).toBe(3);
    expect(result.total).toBe(3);
    expect(result.percentage).toBe(100);
    expect(result.weakConcepts).toEqual([]);
  });

  it('counts wrong and unanswered answers and names the weak concepts', () => {
    const result = evaluateAnswers(token, [
      { id: 'q1', choiceIndex: 0 },
      { id: 'q2', choiceIndex: null },
      { id: 'q3', choiceIndex: 0 },
    ]);
    expect(result.score).toBe(1);
    expect(result.percentage).toBe(33);
    expect(result.weakConcepts).toEqual(['Addition', 'Capitals']);
    expect(result.strongConcepts).toEqual(['Formulae']);
    expect(result.recommendation).toContain('Addition');
  });

  it('marks an out-of-range or missing answer as incorrect, never correct', () => {
    const result = evaluateAnswers(token, [{ id: 'q1', choiceIndex: null }]);
    expect(result.results.every((r) => r.correct === false)).toBe(true);
    expect(result.score).toBe(0);
  });
});

describe('pre/post comparison', () => {
  it('reports an improvement', () => {
    expect(compareTests(33, 100)).toEqual({ delta: 67, verdict: expect.stringContaining('Improved') });
  });
  it('reports no change and a drop', () => {
    expect(compareTests(50, 50).delta).toBe(0);
    expect(compareTests(80, 40).verdict).toMatch(/Dropped by 40/);
  });
  it('asks for both tests when one is missing', () => {
    expect(compareTests(null, 60).delta).toBeNull();
  });
});
