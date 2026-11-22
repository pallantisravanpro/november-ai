# November AI

A mobile-first AI web app built around three hackathon themes:

1. **The $15-an-hour expert** — plain-language help with bills, invoices, forms and paperwork.
2. **Voice is the interface** — speak a question, hear the answer, in English, Telugu or Hindi.
3. **A tutor for every learner** — a real learning loop: pre-test, lesson, five-question quiz, post-test, progress you can measure.

All AI calls go through the app's own Node server. The Gemini API key never reaches the browser.

---

## What is in the box

| Mode | What it does |
| --- | --- |
| **Expert AI** | Takes a question and/or pasted document text. Returns a summary, explained terms, numbered steps, missing information, what was taken from the user's own text, what is an assumption, questions to ask a professional, and which professional to consult. |
| **Voice AI** | Browser speech recognition (where supported), AI reply, speech synthesis playback, type-instead fallback, honest permission and unsupported-browser messages. |
| **Personal Tutor** | Pre-test → lesson (objectives, explanation, analogy, worked examples, quick checks) → five-question quiz → post-test → pre/post comparison. Scoring happens on the server; lessons are only marked complete from submitted quiz answers. |
| **General AI Chat** | Multi-turn conversation in the current session, copy response, new chat, loading and error states. |

Everything is available in **English, తెలుగు (Telugu) and हिन्दी (Hindi)**. The selected language is sent to the server with every request, and the server instructs the model to answer in that language.

---

## Tech stack

- **Frontend:** React 19 + TypeScript, Vite, hand-written responsive CSS (mobile-first, dark navy/violet, teal and purple accents).
- **Backend:** Node.js + Express 5 + TypeScript.
- **AI:** `@google/genai` (official Google Gen AI SDK) calling the Gemini API with structured JSON output for the expert and tutor modes.
- **Validation:** Zod schemas on every route.
- **Tests:** Vitest (unit), a Node HTTP smoke test, and two Puppeteer browser suites.

Model name is set in exactly one place: `GEMINI_MODEL` (default `gemini-3.8-flash`), read in `server/config.ts`. Change it there, or in `.env`, if your key uses a different model.

---

## Quick start

```bash
# 1. install
npm install

# 2. configure (server-side only)
cp .env.example .env
# then edit .env and set GEMINI_API_KEY=...      (https://aistudio.google.com/apikey)

# 3. develop (API on :8080, Vite on :5173 with /api proxied)
npm run dev
```

Open http://localhost:5173.

### Production build

```bash
npm run build     # frontend -> dist/, server -> dist-server/
npm start         # single process serves the API and the built frontend
```

Open http://localhost:8080.

---

## Environment variables

All variables are read **server-side only** (`server/config.ts`). Nothing is exposed to the browser bundle.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | yes | – | Gemini API key. Without it the server still runs, `/api/health` reports `configured: false`, and AI routes return a clear `503 not_configured`. |
| `GEMINI_MODEL` | no | `gemini-3.8-flash` | Model used for every AI call. Verify the model is available to your key in the [Gemini model list](https://ai.google.dev/gemini-api/docs/models). |
| `PORT` | no | `8080` | Port for the API/production server. |
| `QUIZ_SIGNING_SECRET` | recommended | derived from the API key | HMAC secret used to sign tutor assessment tokens. Set a long random value in production (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). |
| `HTTPS_PROXY` / `HTTP_PROXY` | no | – | If set, outbound calls are routed through the proxy (`server/proxy.ts`). Node's fetch does not read these variables on its own. |

`.env` is git-ignored. Never commit it, and never put a key in frontend code — Vite would inline anything prefixed `VITE_` into the bundle.

---

## API

All routes are JSON. Errors always have the shape `{ "error": { "code", "message", "details" } }` and never contain a credential.

| Method | Route | Body | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{ ok, service, model, configured, build, time }` |
| POST | `/api/chat` | `{ language, messages: [{role, content}] }` | `{ reply }` |
| POST | `/api/expert` | `{ language, question?, documentText?, history? }` | `{ answer: { summary, keyTerms[], steps[], missingInformation[], verifiedFromYourText[], assumptions[], questionsForProfessional[], professionalHelp } }` |
| POST | `/api/tutor/lesson` | `{ language, subject, topic, level, goal?, weakConcepts? }` | `{ lesson: { title, objectives[], explanation, analogy, examples[], checkQuestions[], nextLesson } }` |
| POST | `/api/tutor/assessment` | `{ language, subject, topic, level, stage: "pre"\|"quiz"\|"post", weakConcepts? }` | `{ stage, topic, questions: [{id, question, options[], concept}], token }` |
| POST | `/api/tutor/evaluate` | `{ token, answers: [{id, choiceIndex}] }` | `{ score, total, percentage, results[], weakConcepts[], strongConcepts[], recommendation }` |
| POST | `/api/tutor/compare` | `{ pre, post }` (percentages) | `{ delta, verdict }` |

### How quiz scoring stays reliable

- The model returns questions **with** the correct option and an explanation.
- The server strips the answer key and sends the client only `{ id, question, options, concept }`.
- The answer key travels back in an **HMAC-signed token** (6-hour expiry), so a client cannot invent or edit it.
- `/api/tutor/evaluate` verifies the signature, compares answers itself, and computes the score, weak concepts and recommendation in code — not by asking the model.

### Request protection

- Zod validation on every route (message length, document size, language, answer indices).
- Per-IP rate limiting: 20 AI requests/min, 12 heavy (expert/lesson/assessment) requests/min.
- JSON body limit 256 kB; `x-powered-by` disabled; no stack traces to clients.
- Upstream failures are mapped to safe messages: 429 → rate limited, 401/403 → credential rejected, 404 → model not available, network → unavailable.

---

## Safety behaviour (by design)

- Expert AI is explicitly told it is **not** a lawyer, doctor, chartered accountant or financial adviser, and cannot make legal or tax decisions for the user.
- It must separate **verified-from-your-text** facts from **assumptions**, must list missing information, and must not invent government rules, fees, deadlines or citations.
- High-impact cases end with a named professional to consult.
- The UI warns users to hide personal details before pasting a document, and there is no file upload of identity documents.
- Chat and Expert responses carry a visible "this can be wrong, check official sources" note.
- The tutor never marks a lesson complete on opening it — only a submitted quiz with ≥ 50% does that.

---

## Testing

```bash
npm test            # 17 Vitest unit tests: token signing, scoring, validation
npm run test:api    # builds, then 13 live HTTP checks against the real server
npm run test:e2e    # builds, then 48 UI checks + 21 tutor-flow checks in Chromium
```

`test:e2e` needs `npm i -D puppeteer-core` and a Chrome binary:

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome npm run test:e2e
```

What each suite proves:

- **Unit (`tests/quiz.test.ts`, `tests/validation.test.ts`)** — signed tokens round-trip, tampering and expiry are rejected, the answer key never leaves the server, scoring counts wrong and unanswered answers, weak concepts are derived correctly, pre/post comparison is right, invalid request bodies are rejected with readable messages.
- **API (`tests/api.smoke.mjs`)** — health, input validation, fail-closed 503 without a key, forged-token rejection, 404 JSON, static frontend serving, rate limiting, malformed JSON, and (with a dummy key) that the Gemini call is really attempted and its rejection mapped to a safe 502 with no key material in the response.
- **UI (`tests/e2e/ui.smoke.mjs`)** — welcome/dashboard/nav, Telugu and Hindi UI + `language` in the request body, chat/expert/tutor error states, microphone permission handling, settings, clearing history, desktop layout, no horizontal overflow at 360 px and 1280 px, no uncaught console errors.
- **Tutor flow (`tests/e2e/tutor.flow.mjs`)** — full pre-test → lesson → quiz → post-test loop with server-side scoring (67% → 60% → 100%, +33), progress persisted in `localStorage` and shown on the dashboard after a reload.

See `TEST_REPORT.md` for the latest run and for what could not be tested here.

---

## Project structure

```
server/
  index.ts        Express app, static hosting, central error handler
  config.ts       env parsing, model name, build stamp
  gemini.ts       SDK wrapper, JSON mode, error mapping, one retry on 429
  prompts.ts      system prompts (safety rules) + JSON schemas + language rules
  routes.ts       the seven API routes
  validate.ts     Zod schemas
  quiz.ts         token signing/verification, scoring, comparison
  ratelimit.ts    per-IP fixed window limiter
  proxy.ts        optional HTTPS_PROXY support for outbound fetch
src/
  App.tsx         shell, hash router, language + health state
  i18n.ts         en / te / hi strings, ~120 keys each
  lib/api.ts      typed fetch, ApiError, localized error messages
  lib/storage.ts  localStorage settings, progress, recent conversations
  lib/speech.ts   speech recognition + synthesis wrappers
  pages/          Welcome, Dashboard, Chat, Expert, Voice, Tutor, Settings
  components/     logo/icons, shared UI
tests/            unit tests, HTTP smoke test, e2e scripts
```

## Data and privacy

- No account, no database, no cloud storage in this version.
- Conversation text lives in React state for the session; recent-chat titles and learning progress are stored in `localStorage` only.
- Settings → "Clear history and progress" deletes the stored progress and recent conversations.
- No passwords, API keys or document text are written to storage.
- Chat text is sent to Google's Gemini API through the server to produce a reply; that is the only outbound transfer.

## Deployment

The app is a single Node process that serves both the API and the built frontend, so any Node host works (Cloud Run, Render, Fly, a VM):

```bash
npm ci
npm run build
GEMINI_API_KEY=... QUIZ_SIGNING_SECRET=... PORT=8080 npm start
```

Notes:
- Microphone access requires **HTTPS** (or `localhost`). Deploy behind TLS.
- Set `GEMINI_API_KEY` as a secret in the host's environment, never in the repo or the image.
- If your platform requires an outbound proxy, set `HTTPS_PROXY`.

**This repository has not been deployed.** No public URL exists yet — see `TEST_REPORT.md`.

## Known limitations

- Speech recognition and speech synthesis depend on the browser. Chrome on Android/desktop works best; Firefox and iOS Safari have partial support. The UI reports what is actually available instead of pretending.
- The UI translations were written by hand and have not been reviewed by a native-speaker editor; wording may need polishing.
- Conversations and progress are per-device. There is no login or cross-device sync.
- Rate limiting is in-memory, so it applies per instance.
- Expert AI does not accept PDF or image uploads in this version — pasted text only, which also avoids storing sensitive documents.
