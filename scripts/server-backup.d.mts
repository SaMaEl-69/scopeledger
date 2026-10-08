export function backupServer(db: string, env: string, destination: string): Promise<any>;
export function restoreServer(source: string, db: string, env: string): Promise<any>;
export function privateTarget(path: string): Promise<string>;
export function privateFile(path: string, read?: boolean): Promise<Buffer | null>;

export function privateWrite(path: string, bytes: string | Buffer): Promise<void>;
