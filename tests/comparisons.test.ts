import { describe, it, expect } from 'vitest';
import { createWorkspace } from '../src/domain/operations';
import { saveComparison, revisionDifferences, pickTerms } from '../src/domain/comparisons';
import { calculate } from '../src/domain/finance';
describe('independent decision alternatives and revision differences', () => {
  it('preserves active terms and financial records when an alternative is saved', () => {
    const w = createWorkspace(),
      change = w.changes[0],
      before = structuredClone(w);
    const terms = { ...pickTerms(change), route: 'Absorb' as const, fee: '0', hours: '12' };
    const next = saveComparison(w, change.id, 'Absorb extra work', terms);
    expect(w).toEqual(before);
    expect(next.changes).toEqual(before.changes);
    expect(next.approvals).toEqual(before.approvals);
    expect(next.documents).toEqual(before.documents);
    expect(next.comparisons).toHaveLength(1);
    expect(next.comparisons[0].projectId).toBe(change.projectId);
    expect(next.comparisons[0].terms).not.toHaveProperty('status');
    terms.hours = '99';
    expect(next.comparisons[0].terms.hours).toBe('12');
    expect(calculate(w.projects[0].baseline, next.comparisons[0].terms).effectiveFee).toBe('0');
  });
  it('identifies every changed term without mutating a revision', () => {
    const before = pickTerms(createWorkspace().changes[0]);
    const after = { ...before, fee: '1000', request: 'Different scope', contractConfirmed: true };
    expect(revisionDifferences(before, after).map((d) => d.key)).toEqual([
      'request',
      'fee',
      'contractConfirmed',
    ]);
    expect(revisionDifferences(before, before)).toEqual([]);
  });
  it('rejects nameless alternatives and missing relationships', () => {
    const w = createWorkspace();
    expect(() => saveComparison(w, w.changes[0].id, ' ', w.changes[0])).toThrow();
    expect(() => saveComparison(w, 'missing', 'Alt', w.changes[0])).toThrow();
  });
});
