import { MAX_WORKSPACE_BYTES } from './repository';
export const MAX_ENCRYPTED_BACKUP_BYTES = 14 * 1024 * 1024;
const FORMAT = 'scopeledger-encrypted-backup';
const ITERATIONS = 600000;
const aad = new TextEncoder().encode('ScopeLedger workspace backup v1');
function cryptoApi() {
  if (!globalThis.crypto?.subtle)
    throw new Error('Encrypted backups require a secure browser connection.');
  return globalThis.crypto;
}
function base64(bytes: Uint8Array<ArrayBuffer>) {
  let value = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(value);
}
function decode(value: unknown, maximum: number) {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(maximum / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('This encrypted backup is malformed.');
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('This encrypted backup is malformed.');
  }
  if (bytes.length > maximum || base64(bytes) !== value)
    throw new Error('This encrypted backup is malformed.');
  return bytes;
}
async function key(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  if (passphrase.length < 16 || passphrase.length > 1024 || passphrase.trim().length < 16)
    throw new Error('Use a passphrase with at least 16 characters.');
  const api = cryptoApi(),
    material = await api.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
  return api.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export function isEncryptedBackup(raw: string) {
  try {
    return JSON.parse(raw)?.format === FORMAT;
  } catch {
    return false;
  }
}
export async function encryptWorkspaceBackup(raw: string, passphrase: string) {
  const plain = new TextEncoder().encode(raw);
  if (plain.length > MAX_WORKSPACE_BYTES)
    throw new Error('Choose a workspace no larger than 10 MB.');
  const api = cryptoApi(),
    salt = api.getRandomValues(new Uint8Array(16)),
    iv = api.getRandomValues(new Uint8Array(12));
  try {
    const encrypted = await api.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
      await key(passphrase, salt),
      plain,
    );
    return JSON.stringify({
      format: FORMAT,
      version: 1,
      kdf: 'PBKDF2-SHA256',
      iterations: ITERATIONS,
      salt: base64(salt),
      iv: base64(iv),
      ciphertext: base64(new Uint8Array(encrypted)),
    });
  } finally {
    plain.fill(0);
  }
}
export async function decryptWorkspaceBackup(raw: string, passphrase: string) {
  if (new TextEncoder().encode(raw).length > MAX_ENCRYPTED_BACKUP_BYTES)
    throw new Error('Encrypted backup exceeds the supported size.');
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new Error('This encrypted backup is malformed.');
  }
  if (
    !envelope ||
    Object.keys(envelope).sort().join(',') !== 'ciphertext,format,iterations,iv,kdf,salt,version' ||
    envelope.format !== FORMAT ||
    envelope.version !== 1 ||
    envelope.kdf !== 'PBKDF2-SHA256' ||
    envelope.iterations !== ITERATIONS
  )
    throw new Error('This encrypted backup format is unsupported.');
  const salt = decode(envelope.salt, 16),
    iv = decode(envelope.iv, 12),
    ciphertext = decode(envelope.ciphertext, MAX_WORKSPACE_BYTES + 16);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16)
    throw new Error('This encrypted backup is malformed.');
  const derived = await key(passphrase, salt);
  let plain;
  try {
    plain = new Uint8Array(
      await cryptoApi().subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
        derived,
        ciphertext,
      ),
    );
  } catch {
    throw new Error(
      'The passphrase is incorrect or this backup has been changed. Your workspace is untouched.',
    );
  }
  try {
    if (plain.length > MAX_WORKSPACE_BYTES)
      throw new Error('Workspace exceeds the supported size.');
    return new TextDecoder('utf-8', { fatal: true }).decode(plain);
  } finally {
    plain.fill(0);
  }
}
