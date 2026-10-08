export function generateRecoveryKey(path: string): Promise<any>;
export function encryptedBackup(
  database: string,
  environment: string,
  keyPath: string,
  destination: string,
): Promise<any>;
export function encryptedRestore(
  archivePath: string,
  keyPath: string,
  database: string,
  environment: string,
): Promise<any>;
