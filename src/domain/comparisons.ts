import type { Workspace, ChangeTerms } from './types';
import { id, now } from './types';
export const TERM_LABELS: Record<keyof ChangeTerms, string> = {
  title: 'Title',
  request: 'Scope request',
  deliverables: 'Deliverables',
  exclusions: 'Exclusions',
  dependencies: 'Dependencies',
  assumptions: 'Assumptions',
  contractChecks: 'Contract checks',
  classification: 'Classification',
  route: 'Response',
  hours: 'Hours',
  rate: 'Loaded cost',
  outside: 'Outside cost',
  removed: 'Removed future cost',
  removedScope: 'Removed scope',
  fee: 'Proposed fee',
  credit: 'Client credit',
  creditReason: 'Credit reason',
  contractConfirmed: 'Contract review',
};
export function pickTerms(change: ChangeTerms): ChangeTerms {
  return Object.fromEntries(
    Object.keys(TERM_LABELS).map((key) => [key, change[key as keyof ChangeTerms]]),
  ) as unknown as ChangeTerms;
}
export function saveComparison(
  w: Workspace,
  changeId: string,
  name: string,
  terms: ChangeTerms,
): Workspace {
  const change = w.changes.find((c) => c.id === changeId && !c.deletedAt);
  if (!change || !name.trim()) throw new Error('Select a change and name this comparison.');
  return {
    ...w,
    updatedAt: now(),
    comparisons: [
      ...w.comparisons,
      {
        id: id(),
        projectId: change.projectId,
        changeId,
        name: name.trim(),
        terms: structuredClone(pickTerms(terms)),
        createdAt: now(),
        deletedAt: null,
      },
    ],
  };
}
export function revisionDifferences(before: ChangeTerms, after: ChangeTerms) {
  return (Object.keys(TERM_LABELS) as (keyof ChangeTerms)[])
    .filter((key) => before[key] !== after[key])
    .map((key) => ({
      key,
      label: TERM_LABELS[key],
      before: String(before[key]),
      after: String(after[key]),
    }));
}
