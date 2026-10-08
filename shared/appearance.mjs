export const APPEARANCE_KEY = 'sl-theme';

export function appearancePreference(value) {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function readAppearance(win = window) {
  let preference = 'system';
  try {
    preference = appearancePreference(win.localStorage.getItem(APPEARANCE_KEY));
  } catch {
    // Storage restrictions do not prevent a usable appearance control.
  }
  return {
    preference,
    theme:
      preference === 'system'
        ? win.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : preference,
  };
}

export function applyAppearance(state, win = window) {
  const root = win.document.documentElement;
  root.dataset.theme = state.theme;
  root.dataset.themePreference = state.preference;
  root.style.colorScheme = state.theme;
  const background = state.theme === 'dark' ? '#08090a' : '#f5f5f2';
  root.style.background = background;
  win.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
}

// Home and workspace share the same persisted preference. System changes never
// replace that preference with a manual choice or echo a cross-tab storage event.
export function createAppearanceController(win = window) {
  const media = win.matchMedia('(prefers-color-scheme: dark)');
  let storage;
  try {
    storage = win.localStorage;
  } catch {
    // Storage may be restricted even while media queries remain available.
  }
  let state = readAppearance(win);
  const listeners = new Set();
  const update = (preference) => {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    state = { preference, theme };
    applyAppearance(state, win);
    for (const listener of listeners) listener(state);
  };
  const systemChanged = () => {
    if (state.preference === 'system') update('system');
  };
  const storageChanged = (event) => {
    if (event.key === APPEARANCE_KEY || event.key === null) {
      if (event.storageArea && event.storageArea !== storage) return;
      update(appearancePreference(event.newValue));
    }
  };
  return {
    getState: () => state,
    setPreference(value) {
      const preference = appearancePreference(value);
      try {
        win.localStorage.setItem(APPEARANCE_KEY, preference);
      } catch {
        // The current page still follows the selected preference.
      }
      update(preference);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      update(state.preference);
      media.addEventListener('change', systemChanged);
      win.addEventListener('storage', storageChanged);
      return () => {
        media.removeEventListener('change', systemChanged);
        win.removeEventListener('storage', storageChanged);
      };
    },
  };
}
