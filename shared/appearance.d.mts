export type AppearancePreference = 'system' | 'light' | 'dark';
export type AppearanceState = { preference: AppearancePreference; theme: 'light' | 'dark' };
export const APPEARANCE_KEY: string;
export function appearancePreference(value: unknown): AppearancePreference;
export function readAppearance(win?: Window): AppearanceState;
export function applyAppearance(state: AppearanceState, win?: Window): void;
export function createAppearanceController(win?: Window): {
  getState(): AppearanceState;
  setPreference(value: AppearancePreference): void;
  subscribe(listener: (state: AppearanceState) => void): () => boolean;
  start(): () => void;
};
