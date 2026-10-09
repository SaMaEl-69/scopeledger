import { describe, expect, it } from 'vitest';
import { encryptWorkspaceBackup, decryptWorkspaceBackup } from '../src/storage/encrypted-backup';
import { createWorkspace } from '../src/domain/operations';
import { serializeWorkspace, parseBackup, MAX_WORKSPACE_BYTES } from '../src/storage/repository';
const phrase = 'A long unique recovery phrase 2026';
describe('encrypted workspace transport', () => {
  it('round trips a full workspace with fresh salts/nonces and no exposed client copy', async () => {
    const w = createWorkspace();
    w.agency.name = 'CONFIDENTIAL CLIENT SENTINEL';
    const raw = serializeWorkspace(w);
    const first = await encryptWorkspaceBackup(raw, phrase),
      second = await encryptWorkspaceBackup(raw, phrase);
    expect(first).not.toContain(w.agency.name);
    expect(first).not.toContain(phrase);
    expect(first).not.toBe(second);
    expect(parseBackup(await decryptWorkspaceBackup(first, phrase))).toEqual(w);
  });
  it('rejects a wrong passphrase and authenticated ciphertext changes', async () => {
    const raw = await encryptWorkspaceBackup(serializeWorkspace(createWorkspace()), phrase);
    await expect(decryptWorkspaceBackup(raw, 'A different secure recovery phrase')).rejects.toThrow(
      'incorrect',
    );
    const envelope = JSON.parse(raw);
    envelope.ciphertext =
      (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1);
    await expect(decryptWorkspaceBackup(JSON.stringify(envelope), phrase)).rejects.toThrow(
      'changed',
    );
  });
  it.each(['iterations', 'kdf', 'version', 'salt', 'iv', 'extra'])(
    'rejects malformed or downgraded %s before cryptographic work',
    async (field) => {
      const envelope: any = {
        format: 'scopeledger-encrypted-backup',
        version: 1,
        kdf: 'PBKDF2-SHA256',
        iterations: 600000,
        salt: btoa('x'.repeat(16)),
        iv: btoa('x'.repeat(12)),
        ciphertext: btoa('x'.repeat(16)),
      };
      if (field === 'iterations') envelope.iterations = 1e12;
      else if (field === 'salt' || field === 'iv') envelope[field] = 'invalid';
      else envelope[field] = 'invalid';
      await expect(decryptWorkspaceBackup(JSON.stringify(envelope), phrase)).rejects.toThrow();
    },
  );
  it('rejects short passphrases and over-sized plaintext', async () => {
    await expect(encryptWorkspaceBackup('{}', 'short')).rejects.toThrow('16');
    await expect(
      encryptWorkspaceBackup('x'.repeat(MAX_WORKSPACE_BYTES + 1), phrase),
    ).rejects.toThrow('50 MiB');
  });
});
