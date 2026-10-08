export function backupServer(db: string, env: string, destination: string): Promise<any>;
export function restoreServer(source: string, db: string, env: string): Promise<any>;
