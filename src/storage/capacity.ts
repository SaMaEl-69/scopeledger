import type { Workspace } from '../domain/types';
import { MAX_WORKSPACE_BYTES } from './repository';

export function workspaceCapacity(workspace: Workspace) {
  const bytes = new TextEncoder().encode(JSON.stringify(workspace)).byteLength;
  return { bytes, limit: MAX_WORKSPACE_BYTES, fraction: bytes / MAX_WORKSPACE_BYTES };
}
export function assertWorkspaceCapacity(workspace: Workspace) {
  if (workspaceCapacity(workspace).bytes > MAX_WORKSPACE_BYTES)
    throw new Error(
      'This edit exceeds the 10 MiB workspace limit and was not applied. Your previous work is preserved. Export a backup, reduce image sizes, or use a separate browser workspace before adding more.',
    );
}
