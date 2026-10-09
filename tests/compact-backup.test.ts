import { describe, expect, it } from 'vitest';
import { compactBackup, expandCompactBackup } from '../src/storage/compact-backup';
import { createWorkspace } from '../src/domain/operations';
import { issueDocument } from '../src/domain/commercial';
import { emptySignatures } from '../src/documents/signatures';
import { serializeWorkspace, parseBackup } from '../src/storage/repository';
import { encryptWorkspaceBackup, decryptWorkspaceBackup } from '../src/storage/encrypted-backup';
import { logo } from './server/fixtures.mjs';
function imageWorkspace() {
  let w = createWorkspace();
  w.agency.logoDataUrl = logo;
  const signatures = emptySignatures('brief');
  signatures.issuer.imageDataUrl = logo;
  signatures.client.imageDataUrl = logo;
  for (let index = 0; index < 4; index++)
    w = issueDocument(w, w.changes[0].id, 'brief', { reference: `BRF-${index}`, signatures });
  return w;
}
describe('portable compact image backups', () => {
  it('stores repeated images once and restores the entire validated graph with exact issued snapshots', () => {
    const w = imageWorkspace(),
      raw = serializeWorkspace(w),
      packed = compactBackup(raw),
      envelope = JSON.parse(packed);
    expect(Buffer.byteLength(packed)).toBeLessThan(Buffer.byteLength(raw));
    expect(envelope.images).toEqual([logo]);
    expect(packed.split(logo).length - 1).toBe(1);
    expect(parseBackup(packed)).toEqual(w);
    expect(parseBackup(raw)).toEqual(w);
    expect(w.documents[0].snapshot?.signatures?.issuer.imageDataUrl).toBe(logo);
  });
  it('encrypts compact transport while restoring the same data with the recovery phrase', async () => {
    const w = imageWorkspace(),
      phrase = 'Unique recovery phrase for the test workspace';
    const encrypted = await encryptWorkspaceBackup(compactBackup(serializeWorkspace(w)), phrase);
    expect(encrypted).not.toContain(logo);
    expect(parseBackup(await decryptWorkspaceBackup(encrypted, phrase))).toEqual(w);
  });
  it('leaves image-free and unreadable recovery data unchanged', () => {
    const raw = serializeWorkspace(createWorkspace());
    expect(compactBackup(raw)).toBe(raw);
    expect(compactBackup('unreadable recovery copy')).toBe('unreadable recovery copy');
    const deep = '{"schemaVersion":3,"nested":' + '['.repeat(20000) + '0' + ']'.repeat(20000) + '}';
    expect(compactBackup(deep)).toBe(deep);
  });
  it.each([-1, 0.5, 1, '0', null])('rejects malformed image reference %s', (index) => {
    const envelope = JSON.parse(compactBackup(serializeWorkspace(imageWorkspace())));
    envelope.workspace.agency.logoDataUrl.$scopeledgerImage = index;
    expect(() => parseBackup(JSON.stringify(envelope))).toThrow(/malformed/);
  });
  it('rejects references in unapproved fields and unknown or unused image entries', () => {
    const make = () => JSON.parse(compactBackup(serializeWorkspace(imageWorkspace())));
    const malicious = make();
    malicious.workspace.agency.name = { $scopeledgerImage: 0 };
    expect(() => parseBackup(JSON.stringify(malicious))).toThrow(/malformed/);
    const unused = make();
    unused.images.push(logo);
    expect(() => parseBackup(JSON.stringify(unused))).toThrow(/malformed/);
    const injected = make();
    injected.workspace.agency.logoDataUrl.extra = 'injected';
    expect(() => parseBackup(JSON.stringify(injected))).toThrow(/malformed/);
    const badImage = make();
    badImage.images[0] = 'data:image/svg+xml;base64,PHN2Zz4=';
    expect(() => parseBackup(JSON.stringify(badImage))).toThrow(/malformed/);
  });
  it('blocks a small envelope that expands beyond the workspace cap before graph restoration', () => {
    const image = 'data:image/png;base64,' + 'A'.repeat(600000);
    const envelope = {
      format: 'scopeledger-compact-backup',
      version: 1,
      images: [image],
      workspace: {
        nested: Array.from({ length: 90 }, () => ({ imageDataUrl: { $scopeledgerImage: 0 } })),
      },
    };
    expect(() => expandCompactBackup(envelope)).toThrow(/50 MiB/);
  });
});
