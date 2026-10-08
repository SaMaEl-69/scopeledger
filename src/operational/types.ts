import type { Workspace } from '../domain/types';
export interface NavigationTarget {
  view: Workspace['context']['view'];
  projectId?: string;
  changeId?: string;
  documentId?: string;
  eventId?: string;
}
export interface OperationalProps {
  w: Workspace;
  onChange: (next: Workspace | ((workspace: Workspace) => Workspace)) => void | boolean;
  onNavigate: (target: NavigationTarget) => void;
  notify?: (message: string) => void;
  storageError?: string;
  selectedEventId?: string;
}
