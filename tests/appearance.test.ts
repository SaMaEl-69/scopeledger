import { describe, expect, it, vi } from 'vitest';
import {
  appearancePreference,
  createAppearanceController,
  readAppearance,
} from '../shared/appearance.mjs';

function browser(saved: string | null = null, dark = false, denied = false) {
  const events = new EventTarget();
  const changes = new EventTarget();
  const media = {
    matches: dark,
    addEventListener: changes.addEventListener.bind(changes),
    removeEventListener: changes.removeEventListener.bind(changes),
  };
  const meta = { setAttribute: vi.fn() };
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  const storage = { getItem: vi.fn(() => saved), setItem: vi.fn() };
  const win = {
    get localStorage() {
      if (denied) throw new Error('Storage unavailable');
      return storage;
    },
    matchMedia: () => media,
    document: { documentElement: root, querySelector: () => meta },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  } as unknown as Window;
  return {
    win,
    root,
    storage,
    meta,
    system(isDark: boolean) {
      media.matches = isDark;
      changes.dispatchEvent(new Event('change'));
    },
    external(value: string | null, key: string | null = 'sl-theme', area?: object) {
      events.dispatchEvent(
        Object.assign(new Event('storage'), { key, newValue: value, storageArea: area }),
      );
    },
  };
}

describe('shared appearance preference', () => {
  it('defaults to the device and treats missing or invalid preferences as system', () => {
    for (const value of [null, '', 'system', 'unexpected'])
      expect(appearancePreference(value)).toBe('system');
    expect(readAppearance(browser(null, true).win)).toEqual({
      preference: 'system',
      theme: 'dark',
    });
    expect(readAppearance(browser(null, false).win)).toEqual({
      preference: 'system',
      theme: 'light',
    });
  });

  it('preserves both legacy manual preferences even when the device disagrees', () => {
    expect(readAppearance(browser('light', true).win)).toEqual({
      preference: 'light',
      theme: 'light',
    });
    expect(readAppearance(browser('dark', false).win)).toEqual({
      preference: 'dark',
      theme: 'dark',
    });
  });

  it('follows device changes without persisting a manual mode or echoing storage', () => {
    const b = browser();
    const controller = createAppearanceController(b.win);
    controller.start();
    b.system(true);
    expect(controller.getState()).toEqual({ preference: 'system', theme: 'dark' });
    expect(b.root.dataset).toMatchObject({ theme: 'dark', themePreference: 'system' });
    expect(b.meta.setAttribute).toHaveBeenLastCalledWith('content', '#08090a');
    expect(b.storage.setItem).not.toHaveBeenCalled();
  });

  it('holds a manual choice until System is deliberately selected', () => {
    const b = browser();
    const controller = createAppearanceController(b.win);
    controller.start();
    controller.setPreference('dark');
    b.system(false);
    expect(controller.getState().theme).toBe('dark');
    expect(b.storage.setItem).toHaveBeenLastCalledWith('sl-theme', 'dark');
    controller.setPreference('system');
    expect(controller.getState()).toEqual({ preference: 'system', theme: 'light' });
    expect(b.storage.setItem).toHaveBeenLastCalledWith('sl-theme', 'system');
  });

  it('accepts cross-tab preference changes and resets to system after storage is cleared', () => {
    const b = browser('light', true);
    const controller = createAppearanceController(b.win);
    controller.start();
    b.external('dark');
    expect(controller.getState().preference).toBe('dark');
    b.external(null, null);
    expect(controller.getState()).toEqual({ preference: 'system', theme: 'dark' });
    b.external('light', 'another-key');
    b.external('light', 'sl-theme', {});
    expect(controller.getState().preference).toBe('system');
    expect(b.storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps controls and system updates usable when local storage is denied', () => {
    const b = browser(null, true, true);
    const controller = createAppearanceController(b.win);
    controller.start();
    expect(() => controller.setPreference('light')).not.toThrow();
    expect(b.root.dataset.theme).toBe('light');
    controller.setPreference('system');
    b.system(false);
    expect(controller.getState().theme).toBe('light');
  });

  it('releases subscriptions and device/storage listeners on cleanup', () => {
    const b = browser();
    const controller = createAppearanceController(b.win);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    const stop = controller.start();
    unsubscribe();
    controller.setPreference('dark');
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    b.external('light');
    b.system(false);
    expect(controller.getState().theme).toBe('dark');
  });
});
