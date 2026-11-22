import { speechLocale, type Lang } from '../i18n';

// Minimal typings for the Web Speech API (not in TypeScript's DOM lib).
type SpeechRecognitionAlternative = { transcript: string; confidence: number };
type SpeechRecognitionResult = { isFinal: boolean; length: number; [index: number]: SpeechRecognitionAlternative };
type SpeechRecognitionResultList = { length: number; [index: number]: SpeechRecognitionResult };

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function support() {
  const hasSynth = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return {
    recognition: typeof window !== 'undefined' && recognitionCtor() !== null,
    synthesis: hasSynth,
    // Secure context is required by browsers for microphone access.
    secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
  };
}

export type Recognizer = {
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function createRecognizer(
  lang: Lang,
  handlers: {
    onInterim: (text: string) => void;
    onFinal: (text: string) => void;
    onError: (code: string) => void;
    onEnd: () => void;
    onStart: () => void;
  },
): Recognizer | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang = speechLocale(lang);
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => handlers.onStart();
  rec.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? '';
      if (result.isFinal) final += text;
      else interim += text;
    }
    if (interim) handlers.onInterim(interim.trim());
    if (final.trim()) handlers.onFinal(final.trim());
  };
  rec.onerror = (event) => handlers.onError(event.error);
  rec.onend = () => handlers.onEnd();

  return {
    start: () => rec.start(),
    stop: () => rec.stop(),
    abort: () => rec.abort(),
  };
}

export function voicesForLang(lang: Lang): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const wanted = speechLocale(lang).toLowerCase();
  const prefix = wanted.split('-')[0];
  return window.speechSynthesis.getVoices().filter((v) => {
    const tag = v.lang.toLowerCase().replace('_', '-');
    return tag === wanted || tag.startsWith(`${prefix}-`) || tag === prefix;
  });
}

export function speak(text: string, lang: Lang, handlers: { onEnd?: () => void; onError?: (message: string) => void } = {}): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechLocale(lang);
  const [voice] = voicesForLang(lang);
  if (voice) utterance.voice = voice;
  utterance.rate = 0.95;
  utterance.onend = () => handlers.onEnd?.();
  utterance.onerror = (e) => {
    handlers.onError?.(e.error || 'speech-error');
    handlers.onEnd?.();
  };
  synth.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking;
}
