import type { Lang } from '../i18n';

const SETTINGS_KEY = 'november-ai.settings.v1';
const PROGRESS_KEY = 'november-ai.progress.v1';
const RECENT_KEY = 'november-ai.recent.v1';

export type Settings = { lang: Lang; seenWelcome: boolean };

export type ProgressEntry = {
  id: string;
  subject: string;
  topic: string;
  level: string;
  lang: Lang;
  prePercent: number | null;
  quizPercent: number | null;
  postPercent: number | null;
  weakConcepts: string[];
  nextLesson: string | null;
  updatedAt: string;
  completed: boolean;
};

export type RecentEntry = { id: string; mode: 'chat' | 'expert' | 'voice' | 'tutor'; title: string; at: string };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be full or blocked — the app keeps working in memory */
  }
}

export const store = {
  getSettings(): Settings {
    return read<Settings>(SETTINGS_KEY, { lang: 'en', seenWelcome: false });
  },
  saveSettings(s: Settings): void {
    write(SETTINGS_KEY, s);
  },

  getProgress(): ProgressEntry[] {
    return read<ProgressEntry[]>(PROGRESS_KEY, []);
  },
  saveProgress(entry: ProgressEntry): ProgressEntry[] {
    const all = read<ProgressEntry[]>(PROGRESS_KEY, []);
    const idx = all.findIndex((p) => p.id === entry.id);
    const next = idx >= 0 ? all.map((p, i) => (i === idx ? entry : p)) : [entry, ...all];
    const trimmed = next.slice(0, 50);
    write(PROGRESS_KEY, trimmed);
    return trimmed;
  },

  getRecent(): RecentEntry[] {
    return read<RecentEntry[]>(RECENT_KEY, []);
  },
  addRecent(entry: RecentEntry): RecentEntry[] {
    const all = read<RecentEntry[]>(RECENT_KEY, []).filter((r) => r.id !== entry.id);
    const next = [entry, ...all].slice(0, 8);
    write(RECENT_KEY, next);
    return next;
  },

  clearAll(): void {
    try {
      localStorage.removeItem(PROGRESS_KEY);
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* ignore */
    }
  },
};

export function progressId(subject: string, topic: string, level: string): string {
  return `${subject}|${topic.trim().toLowerCase()}|${level}`;
}
