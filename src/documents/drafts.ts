import type { ClientDocument, DocumentDraft, DocumentOverrides, Workspace } from '../domain/types';
import { now } from '../domain/types';
import { serializeWorkspace } from '../storage/repository';

const keyFor = (
  workspaceId: string,
  draft: Pick<DocumentDraft, 'projectId' | 'changeId' | 'kind' | 'revision'>,
) => JSON.stringify([workspaceId, draft.projectId, draft.changeId, draft.kind, draft.revision]);

export function documentDraftKey(
  w: Workspace,
  projectId: string,
  changeId: string,
  kind: ClientDocument['kind'],
): string {
  return keyFor(w.id, {
    projectId,
    changeId,
    kind,
    revision: w.changes.find((c) => c.id === changeId)?.revision ?? 1,
  });
}
export function readDocumentDraft(w: Workspace, key: string): DocumentOverrides | undefined {
  const draft = w.documentDrafts?.find((d) => keyFor(w.id, d) === key);
  return draft ? structuredClone(draft.values) : undefined;
}
export function recentDocumentDraftKind(
  w: Workspace,
  projectId: string,
  changeId: string,
): ClientDocument['kind'] | undefined {
  const revision = w.changes.find((c) => c.id === changeId)?.revision;
  // Edits replace a context at the end; no drafts are silently evicted.
  return w.documentDrafts
    ?.slice()
    .reverse()
    .find((d) => d.projectId === projectId && d.changeId === changeId && d.revision === revision)
    ?.kind;
}
export function rememberDocumentDraft(
  w: Workspace,
  key: string,
  values: DocumentOverrides,
): Workspace {
  const [workspaceId, projectId, changeId, kind, revision] = JSON.parse(key);
  const change = w.changes.find((c) => c.id === changeId && c.projectId === projectId);
  if (
    workspaceId !== w.id ||
    !change ||
    revision !== change.revision ||
    !['brief', 'invoice', 'credit'].includes(kind)
  )
    throw new Error('The document source changed. Reopen the current revision before editing.');
  const updatedAt = now();
  const next: Workspace = {
    ...w,
    updatedAt,
    documentDrafts: [
      ...(w.documentDrafts ?? []).filter((d) => keyFor(w.id, d) !== key),
      { projectId, changeId, kind, revision, updatedAt, values: structuredClone(values) },
    ],
  };
  // Refuse an edit that cannot be saved instead of dropping older drafts to make room.
  serializeWorkspace(next);
  return next;
}
export function forgetDocumentDraft(w: Workspace, key: string): Workspace {
  return {
    ...w,
    updatedAt: now(),
    documentDrafts: (w.documentDrafts ?? []).filter((d) => keyFor(w.id, d) !== key),
  };
}
