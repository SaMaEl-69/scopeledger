import type { AgencySettings, Workspace } from './types';
import { parseAmount } from './finance';
export const defaultsIdentity = (agency: AgencySettings) =>
  JSON.stringify([agency.name, agency.defaultCurrency, agency.defaultRate, agency.defaultTarget]);
export function defaultsReviewed(agency: AgencySettings) {
  return agency.defaultsReviewedFor === defaultsIdentity(agency);
}
export function confirmDefaults(workspace: Workspace): Workspace {
  const errors = {};
  const cost = parseAmount(workspace.agency.defaultRate, 'cost', errors, 'Loaded hourly cost');
  const target = parseAmount(
    workspace.agency.defaultTarget,
    'target',
    errors,
    'Target contribution margin',
  );
  if (!workspace.agency.name.trim() || !cost || !target || target.gte(100))
    throw new Error(
      'Enter your studio name, a valid loaded cost and a target below 100% before confirming.',
    );
  return {
    ...workspace,
    agency: { ...workspace.agency, defaultsReviewedFor: defaultsIdentity(workspace.agency) },
  };
}
