import { Component, useState, type ReactNode } from 'react';

/** Keep failures in optional views away from the application/store shell. */
export class ViewErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ViewRecovery({
  name,
  workspace,
  onBackup,
  onWorkspace,
  onSettings,
}: {
  name: string;
  workspace: object | null;
  onBackup: () => boolean;
  onWorkspace: () => void;
  onSettings?: () => void;
}) {
  const [exportedWorkspace, setExportedWorkspace] = useState<object | null>(null);
  const [backupFailed, setBackupFailed] = useState(false);
  const backupCurrent = !!exportedWorkspace && exportedWorkspace === workspace;
  return (
    <section className="card view-recovery" aria-label={`${name} recovery`}>
      <div role="alert">
        <h2>{name} unavailable</h2>
        <p className="section-description">
          This view could not load or display. A connection problem or an application update may be
          involved. Your workspace is still held in this tab.
        </p>
      </div>
      <p className="section-description">
        Continue in another view or export your current workspace before reloading. Reloading
        downloads the application again; reopening this view alone may not recover its failed
        download.
      </p>
      <div className="button-row">
        <button
          className="button primary"
          onClick={() => {
            const exported = onBackup();
            setExportedWorkspace(exported ? workspace : null);
            setBackupFailed(!exported);
          }}
        >
          Export current edits
        </button>
        <button className="button secondary" onClick={onWorkspace}>
          Return to change requests
        </button>
        {onSettings && (
          <button className="button secondary" onClick={onSettings}>
            Settings & backup
          </button>
        )}
      </div>
      {backupFailed && (
        <p className="field-error" role="alert">
          The backup could not be exported. Keep this tab open and use Settings & backup to recover
          your workspace.
        </p>
      )}
      <p className="field-hint">
        Workspace backups include current edits, document drafts and saved records. Unfinished
        composer/comparison entries are not included; copy those before reloading.
      </p>
      {backupCurrent && (
        <p role="status" className="field-hint">
          A workspace backup download has started. Keep the downloaded file before reloading;
          restore it afterward if any current edits were not saved on this device.
        </p>
      )}
      {exportedWorkspace && !backupCurrent && (
        <p role="status" className="field-hint">
          The workspace changed after that export. Export the current edits again before reloading.
        </p>
      )}
      <button
        className="button secondary"
        disabled={!backupCurrent}
        onClick={() => window.location.reload()}
      >
        Reload application
      </button>
    </section>
  );
}

/** A failed save must never offer an unguarded route that discards memory edits. */
export function SaveRecovery({
  error,
  workspace,
  onBackup,
  onRetry,
}: {
  error: string;
  workspace: object;
  onBackup: () => boolean;
  onRetry: () => void;
}) {
  const [exportedWorkspace, setExportedWorkspace] = useState<object | null>(null);
  const backedUp = exportedWorkspace === workspace;
  return (
    <div className="save-recovery">
      <strong>Your work needs attention</strong>
      <p>{error}</p>
      <p>Keep this tab open. Export your current edits before reloading the saved workspace.</p>
      <div className="button-row">
        <button
          className="button secondary"
          onClick={() => setExportedWorkspace(onBackup() ? workspace : null)}
        >
          Export current edits
        </button>
        <button
          className="button secondary"
          disabled={!backedUp}
          onClick={() => window.location.reload()}
        >
          Reload saved version
        </button>
        <button className="button secondary" onClick={onRetry}>
          Retry save
        </button>
      </div>
      {exportedWorkspace && (
        <p className="field-hint" role="status">
          {backedUp
            ? 'A backup download has started. Keep the file before reloading; restore it afterward to recover unsaved edits.'
            : 'Your workspace changed after that export. Export the current edits again before reloading.'}
        </p>
      )}
      <p className="field-hint">
        Backups include current edits, document drafts and saved records. Reload clears unfinished
        dialog, composer and comparison entries; save or copy those separately.
      </p>
    </div>
  );
}
