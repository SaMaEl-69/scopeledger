import type { Workspace } from './domain/types';
import type { NavigateTarget } from './domain/commercial';
const views = new Set([
  'workspace',
  'dashboard',
  'projects',
  'clients',
  'settings',
  'support',
  'calendar',
  'documents',
  'playbook',
]);
export function readWorkspaceRoute(
  workspace: Workspace,
  url: URL,
): { target: NavigateTarget; message?: string } | null {
  const view = url.searchParams.get('view');
  if (!view || !views.has(view)) return null;
  const target: NavigateTarget = { view: view as NavigateTarget['view'] };
  const invalid = () => ({
    target: { view: 'projects' } as NavigateTarget,
    message:
      'This link refers to a record that is unavailable in this browser. Choose a project from your local workspace.',
  });
  const projectId = url.searchParams.get('project');
  const changeId = url.searchParams.get('change');
  if (projectId) {
    if (!workspace.projects.some((record) => record.id === projectId && !record.deletedAt))
      return invalid();
    target.projectId = projectId;
  }
  if (changeId) {
    const change = workspace.changes.find((record) => record.id === changeId && !record.deletedAt);
    if (!change || (projectId && change.projectId !== projectId)) return invalid();
    target.projectId = change.projectId;
    target.changeId = change.id;
  }
  for (const [parameter, field, records] of [
    ['document', 'documentId', workspace.documents],
    ['event', 'eventId', workspace.calendarEvents],
    ['client', 'clientId', workspace.clients],
  ] as const) {
    const value = url.searchParams.get(parameter);
    if (value) {
      const record = records.find((record) => record.id === value);
      if (!record || ('deletedAt' in record && record.deletedAt)) return invalid();
      if ('projectId' in record) {
        if (target.projectId && target.projectId !== record.projectId) return invalid();
        target.projectId = record.projectId;
      }
      if ('changeId' in record && record.changeId) {
        if (target.changeId && target.changeId !== record.changeId) return invalid();
        target.changeId = record.changeId;
      }
      target[field] = value;
    }
  }
  if (
    target.projectId &&
    !workspace.projects.some((record) => record.id === target.projectId && !record.deletedAt)
  )
    return invalid();
  if (
    target.changeId &&
    !workspace.changes.some(
      (record) =>
        record.id === target.changeId && record.projectId === target.projectId && !record.deletedAt,
    )
  )
    return invalid();
  return { target };
}
export function workspaceRouteUrl(url: URL, target: NavigateTarget) {
  const next = new URL(url);
  for (const parameter of ['view', 'project', 'change', 'document', 'event', 'client'])
    next.searchParams.delete(parameter);
  next.searchParams.set('view', target.view);
  for (const [parameter, value] of [
    ['project', target.projectId],
    ['change', target.changeId],
    ['document', target.view === 'documents' ? target.documentId : undefined],
    ['event', target.view === 'calendar' ? target.eventId : undefined],
    ['client', target.view === 'clients' ? target.clientId : undefined],
  ])
    if (value) next.searchParams.set(parameter!, value);
  return `${next.pathname}${next.search}${next.hash}`;
}
