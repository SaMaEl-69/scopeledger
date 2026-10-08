import { describe, expect, it } from 'vitest';
import {
  documentHtml,
  signatureDimensions,
  validateClientDocument,
} from '../shared/client-document.mjs';
import { fixture, logo } from './server/fixtures.mjs';
import { createWorkspace } from '../src/domain/operations';
import { buildBrief, documentReadiness, issueDocument } from '../src/domain/commercial';
import { validateWorkspace } from '../src/storage/repository';
import { emptySignatures, prepareSignature } from '../src/documents/signatures';

describe('public document signatures and preserved history', () => {
  it('keeps old snapshots valid without adding or rewriting any fields', () => {
    const old = fixture();
    expect(validateClientDocument(old)).toEqual(old);
    expect(validateClientDocument(old)).not.toHaveProperty('signatures');
    expect(documentHtml(old)).not.toContain('aria-label="Document signatures"');
  });
  it('escapes signatory details, renders images locally and honours optional visibility', () => {
    const signatures = emptySignatures('brief');
    signatures.issuer = {
      name: '<b>Studio</b>',
      role: 'Director & owner',
      date: '2026-10-01',
      imageDataUrl: logo,
    };
    signatures.client.name = 'CLIENT SIGNER SENTINEL';
    let html = documentHtml(fixture({ signatures }));
    expect(html).toContain('&lt;b&gt;Studio&lt;/b&gt;');
    expect(html).toContain('Director &amp; owner');
    expect(html).toContain('data-signature="issuer"');
    expect(html).toContain('CLIENT SIGNER SENTINEL');
    signatures.showClient = false;
    html = documentHtml(fixture({ signatures }));
    expect(html).not.toContain('CLIENT SIGNER SENTINEL');
    expect(html).not.toContain('data-signature="client"');
    signatures.enabled = false;
    expect(documentHtml(fixture({ signatures }))).not.toContain('data-signature="issuer"');
  });
  it('rejects private nested fields, invalid dates, remote/script images and oversized signatures', () => {
    const signatures = emptySignatures('brief');
    for (const image of [
      'https://example.test/sig.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'javascript:alert(1)',
    ]) {
      expect(() =>
        validateClientDocument(
          fixture({
            signatures: { ...signatures, issuer: { ...signatures.issuer, imageDataUrl: image } },
          }),
        ),
      ).toThrow(/PNG or JPEG/);
    }
    expect(() =>
      validateClientDocument({ ...fixture(), signatures: { ...signatures, evidence: 'PRIVATE' } }),
    ).toThrow(/unapproved/);
    expect(() =>
      validateClientDocument({
        ...fixture(),
        signatures: { ...signatures, issuer: { ...signatures.issuer, privateNotes: 'PRIVATE' } },
      }),
    ).toThrow(/unapproved/);
    expect(() =>
      validateClientDocument(
        fixture({
          signatures: { ...signatures, issuer: { ...signatures.issuer, date: '2026-02-30' } },
        }),
      ),
    ).toThrow(/calendar date/);
    expect(() => signatureDimensions('data:image/png;base64,' + 'A'.repeat(349528))).toThrow(
      /256 KiB/,
    );
    expect(signatureDimensions(logo)).toEqual({ width: 1, height: 1 });
  });
  it('does not convert an imported client signature into approval or unlock an invoice', () => {
    const workspace = createWorkspace(),
      signatures = emptySignatures('brief');
    signatures.client = {
      name: 'Client contact',
      role: '',
      date: '2020-01-01',
      imageDataUrl: logo,
    };
    const original = structuredClone(workspace);
    const brief = buildBrief(workspace, workspace.changes[0].id, { signatures });
    expect(brief.status).toBe('Draft');
    expect(brief.approvalRecorded).toBe('');
    expect(workspace).toEqual(original);
    expect(
      documentReadiness(workspace, workspace.changes[0].id, 'invoice', { signatures }).find(
        (item) => item.key === 'approval',
      )?.complete,
    ).toBe(false);
  });
  it('preserves signature images and details through save/backup validation without sharing mutable drafts', () => {
    const workspace = createWorkspace(),
      signatures = emptySignatures('brief');
    signatures.issuer = {
      name: 'Studio signatory',
      role: 'Director',
      date: '2020-01-01',
      imageDataUrl: logo,
    };
    const issued = issueDocument(workspace, workspace.changes[0].id, 'brief', {
      reference: 'SIGNED-BRIEF-01',
      issueDate: '2020-01-01',
      signatures,
    });
    signatures.issuer.name = 'Later draft edit';
    signatures.issuer.imageDataUrl = '';
    const restored = JSON.parse(JSON.stringify(issued)) as typeof issued;
    validateWorkspace(restored);
    expect(restored.documents[0].snapshot?.signatures?.issuer).toMatchObject({
      name: 'Studio signatory',
      imageDataUrl: logo,
    });
    expect(restored.approvals).toEqual([]);
    expect(restored.changes[0].status).toBe('Draft');
  });
});

describe('signature import boundary', () => {
  it('rejects huge declared dimensions before allocating an image bitmap', async () => {
    const bytes = Uint8Array.from(atob(logo.split(',')[1]), (char) => char.charCodeAt(0));
    new DataView(bytes.buffer).setUint32(16, 5000);
    await expect(
      prepareSignature(new File([bytes], 'large-pixels.png', { type: 'image/png' })),
    ).rejects.toThrow(/4096/);
  });
  it('rejects unsupported, empty, oversized and disguised files before decoding', async () => {
    await expect(
      prepareSignature(new File(['<svg/>'], 'signature.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow(/PNG or JPEG/);
    await expect(
      prepareSignature(new File([], 'empty.png', { type: 'image/png' })),
    ).rejects.toThrow(/2 MB/);
    await expect(
      prepareSignature(
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
      ),
    ).rejects.toThrow(/2 MB/);
    await expect(
      prepareSignature(new File(['not a PNG'], 'fake.png', { type: 'image/png' })),
    ).rejects.toThrow(/contents/);
  });
});
