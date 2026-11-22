# November AI — Test Report

**Build:** `v1.0.0` · 22 November 2026
**Environment:** Linux (Debian 12), Node 20.20.2, Chromium 158 headless, viewports 360×800 (mobile) and 1280×900 (desktop).
**Gemini API key available during the build:** **no.** This is the single most important fact in this report — every test that needs a real model answer is marked **NOT TESTED**, not PASS.

| Suite | Command | Result |
| --- | --- | --- |
| Unit (Vitest) | `npm test` | **17 / 17 passed** |
| HTTP API smoke | `npm run test:api` | **13 / 13 passed** |
| Browser UI | `npm run test:e2e` → `ui.smoke.mjs` | **48 / 48 passed** |
| Browser tutor flow | `npm run test:e2e` → `tutor.flow.mjs` | **21 / 21 passed** |

---

## The 20 required tests (section L of the brief)

| # | Required test | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Dashboard navigation | **PASS** | Browser: 4 tiles open Expert, Voice, Tutor, Chat; bottom nav (360 px) and header nav (1280 px) both navigate; Settings opens from the gear. |
| 2 | Expert AI backend response | **FAIL (not runnable here) / NOT TESTED** | Route exists, validates input and maps upstream errors (`/api/expert` returns `503 not_configured` with no key, `400 invalid_input` on an empty body). **No real model answer was produced — no API key in this environment.** |
| 3 | General chat backend response | **FAIL (not runnable here) / NOT TESTED** | Same: `/api/chat` validated, fails closed correctly, but no real reply was generated. With a *dummy* key the request reached Google and came back `400 API_KEY_INVALID`, which proves the SDK call path works but produces no content. |
| 4 | Telugu text conversation | **PARTIAL — NOT TESTED for the AI reply** | UI fully switches to Telugu; the request body carries `language: "te"` (asserted in the browser); the error message is shown in Telugu. **No Telugu AI answer was produced.** |
| 5 | Hindi text conversation | **PARTIAL — NOT TESTED for the AI reply** | Same as Telugu, with `language: "hi"` asserted and a Hindi error message. **No Hindi AI answer was produced.** |
| 6 | English text conversation | **PARTIAL — NOT TESTED for the AI reply** | English UI, `language: "en"` sent, honest error state. **No English AI answer was produced.** |
| 7 | Microphone permission handling | **PASS (denied path)** | With permissions overridden to deny, tapping the mic shows the listening state and then a real outcome notice; no transcript is invented; `aria-pressed` reflects state. The explicit "blocked" notice text is implemented but was not reached in headless Chromium (its recogniser reported no-speech/listening instead). |
| 8 | Voice input when supported | **NOT TESTED** | Needs a real microphone and a device where the Web Speech API is backed by a service. Not possible in a headless sandbox. |
| 9 | Speech output when supported | **NOT TESTED** | No speech voices are installed in this container, so playback cannot be verified. The UI checks voice availability and warns when a language has no voice instead of pretending. |
| 10 | Tutor pre-test | **PASS** | Browser: pre-test loads 3 questions, accepts answers, submits, shows 67% (2/3) computed by the server. Question generation stubbed (see note below). |
| 11 | Tutor lesson | **PASS** | Browser: lesson renders objectives, explanation, analogy, worked examples and quick-check answers. Lesson text stubbed. |
| 12 | Five-question quiz | **PASS** | Browser: 5 questions, one at a time, with progress bar and answer selection. |
| 13 | Quiz scoring | **PASS** | Browser: 3/5 correct → 60%, exactly as submitted. Unit tests also cover all-correct, partial, unanswered and out-of-range answers. |
| 14 | Weak-topic identification | **PASS** | Browser: wrong answers produced weak concepts `Power`, `Circuits`; correct ones appear under "Solid". |
| 15 | Post-test comparison | **PASS** | Browser: pre 67% vs post 100% → `+33%`, "Improved by 33 percentage points." |
| 16 | Local progress persistence | **PASS** | Browser: `localStorage` entry holds `prePercent 67`, `quizPercent 60`, `postPercent 100`, `completed true`; after a reload the dashboard shows the topic and "1 / 1" complete. |
| 17 | Clear history | **PASS** | Browser: confirmation is required first, nothing is deleted before confirming, then progress and recent conversations are removed (`null`). |
| 18 | Mobile responsive layout | **PASS** | 360×800 screenshots of every screen; no horizontal overflow; bottom nav on mobile, header nav on desktop; 2-column dashboard at 1280 px. |
| 19 | Server error handling | **PASS** | 13 HTTP checks: empty body → 400, bad language → 400, malformed JSON → 400, no key → 503, forged token → 400 `bad_token`, unknown route → 404 JSON, 16 rapid requests → 429, upstream rejection → 502 with a safe message. |
| 20 | API key protection | **PASS** | `GEMINI_API_KEY` is read only in `server/config.ts`; the built frontend bundle and the compiled server contain no key-like string (`grep -E "AIza[0-9A-Za-z_-]{20,}" dist dist-server` → no match); error bodies were asserted not to contain the dummy key; `.env` is git-ignored and only `.env.example` is committed. |

### About tests 2–6

The build environment had **no Gemini API key**, and a key cannot be invented. What *was* verified:

- the request reaches the Gemini API (with a dummy key the service answered `400 API_KEY_INVALID` for `generativelanguage.googleapis.com/v1beta`),
- the SDK, model name, JSON mode and error mapping are wired correctly,
- the app never fabricates a reply when the model is unavailable — it shows the error instead.

To finish these five tests, add a real key and repeat:

```bash
cp .env.example .env      # set GEMINI_API_KEY
npm run build && npm start
# then open the app, or:
curl -s localhost:8080/api/chat -H 'Content-Type: application/json' \
  -d '{"language":"te","messages":[{"role":"user","content":"నా కరెంట్ బిల్లు ఎందుకు పెరిగింది?"}]}'
```

Expected: a Telugu reply in `reply`. If instead you get `502 upstream_rejected`, the key or the model name is the problem — the message tells you which.

### How the tutor flow was tested without a key

`tests/e2e/tutor.flow.mjs` stubs exactly two things: the JSON returned by the model for *assessment questions* and for the *lesson text*. Everything else is real:

- the assessment token is signed by the server's own HMAC code,
- the answers are scored by `/api/tutor/evaluate` on the server,
- the app saves progress to `localStorage` and renders it on the dashboard.

So the learning loop, scoring, weak-concept detection, comparison and persistence are genuinely tested; the model's *question writing* is not.

---

## What else was checked

- **Unit (17):** token round-trip, tampered payload rejection, expired token rejection, answer key never in the public question list, normalisation of malformed questions, "too few usable questions" failure, scoring (all correct / mixed / unanswered), weak and strong concept derivation, pre/post comparison, request validation for chat and expert.
- **No fake UI:** with the backend unconfigured, the chat log shows 0 assistant bubbles; the tutor does not produce a quiz; the mic does not produce a transcript.
- **Accessibility basics:** every control is a real `<button>`/`<label>`/`<input>` with an accessible name, 44 px+ touch targets, visible focus ring, `aria-pressed` on toggles, `role="alert"` on errors, `aria-live` on the chat log.
- **Console:** no uncaught JavaScript errors during either browser run.

## Known gaps and things still to configure

1. **`GEMINI_API_KEY` must be set** on the server for any AI feature to work. The app runs without it and says so clearly.
2. **Not deployed.** No public URL was generated, so nothing in this report is a deployment claim. Any Node host works — see README → Deployment.
3. **Real voice input/output** still need a test on a physical Android device over HTTPS.
4. **Telugu and Hindi UI strings** were written by hand and have not been checked by a native-speaker editor.
5. **Rate limiting is per instance** (in-memory). Behind multiple instances, use a shared store.
6. **No PDF/image upload** in Expert AI — pasted text only, by design, to avoid handling sensitive documents.
7. **Mobile bottom nav** is fixed and overlays the last ~70 px of the viewport; content can sit under it until the user scrolls (standard mobile pattern, but worth knowing when writing UI tests — the e2e scripts scroll elements to the centre before tapping).

## Reproducing this report

```bash
npm install
npm test                                   # 17 unit tests
npm run test:api                           # 13 HTTP checks (needs npm run build)
npm i -D puppeteer-core
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome npm run test:e2e   # 48 + 21 checks
```

Screenshots from the browser runs are written to `e2e-screenshots/`.
