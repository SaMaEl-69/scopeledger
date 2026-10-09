import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../src/domain/operations';
import { buildBrief, issueDocument } from '../src/domain/commercial';
import {
  Repository,
  parseBackup,
  serializeWorkspace,
  validateWorkspace,
} from '../src/storage/repository';
import {
  documentDraftKey,
  forgetDocumentDraft,
  readDocumentDraft,
  recentDocumentDraftKind,
  rememberDocumentDraft,
} from '../src/documents/drafts';
import { emptySignatures } from '../src/documents/signatures';
import { fillNearCapacity } from './helpers/capacity';

describe('durable, revision-scoped document drafts', () => {
  it('round-trips independent brief and invoice edits, unfinished values and signatures through a backup', () => {
    let w = createWorkspace();
    const p = w.projects[0].id,
      c = w.changes[0].id;
    const brief = documentDraftKey(w, p, c, 'brief'),
      invoice = documentDraftKey(w, p, c, 'invoice');
    const signatures = emptySignatures('brief');
    signatures.issuer.name = 'Studio director';
    w = rememberDocumentDraft(w, brief, { reference: 'Working brief', signatures });
    w = rememberDocumentDraft(w, invoice, {
      reference: 'Working invoice',
      taxRate: '.',
      paymentInstructions: 'Agreed bank details',
    });
    signatures.issuer.name = 'Caller mutation';
    const restored = parseBackup(serializeWorkspace(w));
    expect(readDocumentDraft(restored, brief)?.signatures?.issuer.name).toBe('Studio director');
    expect(readDocumentDraft(restored, invoice)?.taxRate).toBe('.');
    expect(recentDocumentDraftKind(restored, p, c)).toBe('invoice');
    readDocumentDraft(restored, brief)!.reference = 'Reader mutation';
    expect(readDocumentDraft(restored, brief)?.reference).toBe('Working brief');
    expect(restored.documents).toEqual([]);
  });
  it('survives an actual repository close and reopen', async () => {
    const name = `draft-test-${crypto.randomUUID()}`;
    let repository = new Repository(name);
    let w = createWorkspace();
    const key = documentDraftKey(w, w.projects[0].id, w.changes[0].id, 'brief');
    w = rememberDocumentDraft(w, key, { reference: 'REOPEN-001', footer: 'Keep this wording.' });
    try {
      await repository.save(w, 0);
      await repository.close();
      repository = new Repository(name);
      const result = await repository.load();
      expect(readDocumentDraft(result.workspace!, key)?.footer).toBe('Keep this wording.');
    } finally {
      await repository.close();
      indexedDB.deleteDatabase(name);
    }
  });
  it('keeps old revisions separate, rejects stale edits, and never silently evicts the 51st context', () => {
    let w = createWorkspace();
    const p = w.projects[0].id,
      c = w.changes[0].id,
      key = documentDraftKey(w, p, c, 'brief');
    w = rememberDocumentDraft(w, key, { reference: 'Revision one' });
    w = { ...w, changes: w.changes.map((change) => ({ ...change, revision: 2 })) };
    expect(readDocumentDraft(w, documentDraftKey(w, p, c, 'brief'))).toBeUndefined();
    expect(recentDocumentDraftKind(w, p, c)).toBeUndefined();
    expect(() => rememberDocumentDraft(w, key, { reference: 'Stale' })).toThrow(/source changed/);
    for (let i = 0; i < 51; i++) {
      const change = { ...w.changes[0], id: crypto.randomUUID() };
      w = { ...w, changes: [...w.changes, change] };
      w = rememberDocumentDraft(w, documentDraftKey(w, p, change.id, 'brief'), {
        reference: `Draft ${i}`,
      });
    }
    expect(readDocumentDraft(w, key)?.reference).toBe('Revision one');
    expect(parseBackup(serializeWorkspace(w)).documentDrafts).toHaveLength(52);
  });
  it('clears only the confirmed context while preserving issued snapshots and other drafts', () => {
    let w = createWorkspace();
    const p = w.projects[0].id,
      c = w.changes[0].id;
    const brief = documentDraftKey(w, p, c, 'brief'),
      invoice = documentDraftKey(w, p, c, 'invoice');
    w = rememberDocumentDraft(w, brief, { reference: 'SIGNED-COPY' });
    w = rememberDocumentDraft(w, invoice, { reference: 'Other draft' });
    const expected = buildBrief(w, c, { reference: 'SIGNED-COPY' });
    w = forgetDocumentDraft(issueDocument(w, c, 'brief', { reference: 'SIGNED-COPY' }), brief);
    expect(w.documents[0].snapshot).toEqual(expected);
    expect(readDocumentDraft(w, brief)).toBeUndefined();
    expect(readDocumentDraft(w, invoice)?.reference).toBe('Other draft');
    expect(createWorkspace().documentDrafts).toBeUndefined();
  });
  it('accepts old backups without drafts and rejects unknown fields, invalid images, duplicated or foreign contexts', () => {
    const old = createWorkspace();
    expect(parseBackup(serializeWorkspace(old)).documentDrafts).toBeUndefined();
    const key = documentDraftKey(old, old.projects[0].id, old.changes[0].id, 'brief');
    const w = rememberDocumentDraft(old, key, { reference: 'Draft' });
    const bad = structuredClone(w);
    (bad.documentDrafts![0].values as any).secretKey = 'not allowed';
    expect(() => validateWorkspace(bad)).toThrow(/unrecognized/);
    const foreign = structuredClone(w);
    foreign.documentDrafts![0].projectId = 'missing';
    expect(() => validateWorkspace(foreign)).toThrow(/missing/);
    const future = structuredClone(w);
    future.documentDrafts![0].revision = 99;
    expect(() => validateWorkspace(future)).toThrow(/future/);
    const duplicate = structuredClone(w);
    duplicate.documentDrafts!.push(structuredClone(duplicate.documentDrafts![0]));
    expect(() => validateWorkspace(duplicate)).toThrow(/duplicate/);
    const image = structuredClone(w);
    image.documentDrafts![0].values.signatures = emptySignatures('brief');
    image.documentDrafts![0].values.signatures.issuer.imageDataUrl =
      'https://example.test/signature.png';
    expect(() => validateWorkspace(image)).toThrow(/PNG or JPEG/);
  });
  it('refuses a draft that exceeds capacity without changing saved work or evicting another draft', () => {
    const w = createWorkspace();
    fillNearCapacity(w, 50000);
    expect(() => serializeWorkspace(w)).not.toThrow();
    const key = documentDraftKey(w, w.projects[0].id, w.changes[0].id, 'brief');
    expect(() => rememberDocumentDraft(w, key, { footer: 'x'.repeat(100000) })).toThrow(/50 MiB/);
    expect(w.documentDrafts).toBeUndefined();
  });
});
