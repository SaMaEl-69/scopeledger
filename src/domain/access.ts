import type { Workspace } from './types';

/** Commercial terms are fixed. Activation slots are browsers/devices, never projects. */
export const PLANS = Object.freeze({
  individual: Object.freeze({
    name: 'Individual',
    price: '49.79',
    currency: 'USD',
    purchase: 'one-time lifetime',
    activations: 1,
    completeFeatures: true,
  }),
  agency: Object.freeze({
    name: 'Agency',
    price: '69.79',
    currency: 'USD',
    purchase: 'one-time lifetime',
    activations: 5,
    completeFeatures: true,
  }),
});
export const SUPPORT_EMAIL = 'olim855597@gmail.com';
export const DEMO_CUSTOM_PROJECT_LIMIT = 1;
export const DEMO_SAMPLE_PROJECT_LIMIT = 1;

export function getAccess() {
  return Object.freeze({
    mode: 'demo' as const,
    licensingConfigured: false,
    canDownloadPdf: false,
    canPurchase: false,
  });
}

/** Trash and archive retain their slot so deletion cannot bypass the demo boundary. */
export function getProjectAllowance(workspace: Pick<Workspace, 'projects'>) {
  const customCount = workspace.projects.filter((project) => !project.sample).length;
  return {
    customCount,
    customLimit: DEMO_CUSTOM_PROJECT_LIMIT,
    available: Math.max(0, DEMO_CUSTOM_PROJECT_LIMIT - customCount),
  };
}

/** Activated is an in-memory result of a server authorization, never loaded from a backup. Server actions independently verify the secure session. */
export function canCreateProject(
  workspace: Pick<Workspace, 'projects'>,
  activated = false,
): boolean {
  return activated || getProjectAllowance(workspace).available > 0;
}

export function isWithinDemoAllowance(workspace: Pick<Workspace, 'projects'>): boolean {
  return (
    workspace.projects.filter((project) => project.sample).length <= DEMO_SAMPLE_PROJECT_LIMIT &&
    workspace.projects.filter((project) => !project.sample).length <= DEMO_CUSTOM_PROJECT_LIMIT
  );
}
