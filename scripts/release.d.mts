export function stampBuild(directory?: string): Promise<string>;
export function prepareRelease(source: string, deployment: string, id: string): Promise<any>;
export function verifyRelease(target: string): Promise<any>;
export function activateRelease(deployment: string, id: string): Promise<any>;
