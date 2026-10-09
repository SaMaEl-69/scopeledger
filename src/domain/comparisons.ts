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
  feeMode: 'Fee basis',
  taxRate: 'Tax percentage',
  additionalDays: 'Additional delivery days',
  credit: 'Client credit',
  creditReason: 'Credit reason',
  contractConfirmed: 'Contract review',
};
export function pickTerms(change: ChangeTerms): ChangeTerms {
  return Object.fromEntries(
    Object.keys(TERM_LABELS)
      .filter((key) => change[key as keyof ChangeTerms] !== undefined)
      .map((key) => [key, change[key as keyof ChangeTerms]]),
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
  const value = (terms: ChangeTerms, key: keyof ChangeTerms) => {
    if (key === 'feeMode')
      return {
        'excluding-tax': 'Excluding tax',
        'including-tax': 'Including tax',
        custom: 'Custom fee',
      }[terms.feeMode ?? 'excluding-tax'];
    if (key === 'taxRate' || key === 'additionalDays') return terms[key] ?? '0';
    return String(terms[key]);
  };
  return (Object.keys(TERM_LABELS) as (keyof ChangeTerms)[])
    .filter((key) => value(before, key) !== value(after, key))
    .map((key) => ({
      key,
      label: TERM_LABELS[key],
      before: value(before, key),
      after: value(after, key),
    }));
}
