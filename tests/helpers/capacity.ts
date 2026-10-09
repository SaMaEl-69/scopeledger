import type { Workspace } from '../../src/domain/types';
import { MAX_WORKSPACE_BYTES } from '../../src/storage/limits';

/** Valid client notes fill a workspace to a known remaining UTF-8 allowance. */
export function fillNearCapacity(workspace: Workspace, remainingBytes: number) {
  let used = Buffer.byteLength(JSON.stringify(workspace));
  for (let index = 0; used < MAX_WORKSPACE_BYTES - remainingBytes; index++) {
    const client = {
      id: `capacity-${index}`,
      name: `Client ${index}`,
      contact: '',
      email: '',
      notes: '',
    };
    const overhead = Buffer.byteLength(JSON.stringify(client)) + 1;
    const length = Math.min(100000, MAX_WORKSPACE_BYTES - remainingBytes - used - overhead);
    if (length < 0) throw new Error('Capacity fixture needs more reserved space.');
    client.notes = 'x'.repeat(length);
    workspace.clients.push(client);
    used += overhead + length;
  }
  return workspace;
}
