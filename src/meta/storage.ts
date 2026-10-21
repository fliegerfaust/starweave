/** Обёртка над localStorage: приватный режим и отказы не роняют игру. */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* место кончилось или хранилище запрещено — играем без сохранения */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* то же */
    }
  },
};

export const KEYS = {
  run: 'starweave.run.v1',
  profile: 'starweave.profile.v1',
  settings: 'starweave.settings.v1',
  /** Копия купленного на площадке (правда — у площадки). */
  owned: 'starweave.owned.v1',
};
