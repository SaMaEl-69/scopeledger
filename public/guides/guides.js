(() => {
  const media = matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const preference = () => {
    try {
      const saved = localStorage.getItem('sl-theme');
      return ['light', 'dark'].includes(saved) ? saved : 'system';
    } catch {
      return 'system';
    }
  };
  let choice = preference();
  const apply = () => {
    const theme = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
    root.dataset.theme = theme;
    root.dataset.themePreference = choice;
    root.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#08090a' : '#f5f5f2');
    const control = document.querySelector('[data-appearance]');
    if (control) control.value = choice;
  };
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelector('[data-appearance]')?.addEventListener('change', (event) => {
      choice = event.target.value;
      try {
        localStorage.setItem('sl-theme', choice);
      } catch {
        /* Appearance still works when storage is restricted. */
      }
      apply();
    });
  });
  media.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key === 'sl-theme' || event.key === null) {
      choice = preference();
      apply();
    }
  });
})();
