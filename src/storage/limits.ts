export const MAX_WORKSPACE_BYTES = 50 * 1024 * 1024;
// Base64 transport includes the authenticated encryption tag and envelope metadata.
export const MAX_ENCRYPTED_BACKUP_BYTES = Math.ceil((MAX_WORKSPACE_BYTES + 16) / 3) * 4 + 4096;
export const WORKSPACE_LIMIT_MIB = MAX_WORKSPACE_BYTES / 1048576;
export const ENCRYPTED_BACKUP_LIMIT_MIB = Math.ceil(MAX_ENCRYPTED_BACKUP_BYTES / 1048576);
