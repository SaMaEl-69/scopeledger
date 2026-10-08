import { useCallback, useEffect, useRef, useState } from 'react';
import type { Workspace } from '../domain/types';
import { createWorkspace } from '../domain/operations';
import { assertWorkspaceCapacity } from './capacity';
import {
  EVENTS_CHANNEL,
  parseBackup,
  Repository,
  serializeWorkspace,
  StorageConflictError,
  StorageRecoveryError,
} from './repository';

export type SaveState = 'loading' | 'saving' | 'saved' | 'failed';
const LEGACY_WORKSPACE_KEY = 'scopeledger.v1';
const conflictMessage =
  'Another tab saved this workspace. Export your current edits, then reload to use the latest version.';

export function useWorkspace() {
  // Construct only when used; rendering the hook must not create a notification channel.
  const repositoryRef = useRef<Repository | null>(null);
  const getRepository = useCallback(() => {
    if (!repositoryRef.current) repositoryRef.current = new Repository();
    return repositoryRef.current;
  }, []);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<{ raw: string; reason: string } | null>(null);
  const [previous, setPrevious] = useState<Workspace | null>(null);
  const [migrationNotice, setMigrationNotice] = useState('');
  const workspaceRef = useRef<Workspace | null>(null);
  const sequence = useRef(0);
  const pending = useRef(false);
  const writing = useRef(false);
  const editVersion = useRef(0);
  const lock = useRef<Error | null>(null);
  const migrating = useRef(false);
  const restoring = useRef(false);
  const inFlightSequence = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(false);
  const mutationFailure = useRef<Error | null>(null);

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const markFailure = useCallback((failure: unknown) => {
    const cause =
      failure instanceof Error
        ? failure
        : new Error('Your work could not be saved. Export a backup before closing.');
    if (cause instanceof StorageConflictError || cause instanceof StorageRecoveryError)
      lock.current = cause;
    if (mounted.current) {
      setSaveState('failed');
      setError(cause instanceof StorageConflictError ? conflictMessage : cause.message);
    }
    return cause;
  }, []);

  const flush = useCallback((): Promise<unknown> => {
    cancelTimer();
    const task = async () => {
      if (lock.current) throw lock.current;
      if (restoring.current) return;
      // A new edit can arrive while IndexedDB is writing. Drain it before reporting saved.
      while (pending.current && workspaceRef.current) {
        if (lock.current) throw lock.current;
        const current = workspaceRef.current,
          version = editVersion.current;
        pending.current = false;
        writing.current = true;
        inFlightSequence.current = sequence.current + 1;
        if (mounted.current) setSaveState('saving');
        try {
          sequence.current = await getRepository().save(current, sequence.current);
          if (workspaceRef.current) {
            workspaceRef.current = { ...workspaceRef.current, sequence: sequence.current };
            if (mounted.current) setWorkspace(workspaceRef.current);
          }
          pending.current = pending.current || editVersion.current !== version;
          if (lock.current) throw lock.current;
          if (mounted.current && !pending.current) {
            setSaveState('saved');
            setError('');
            if (migrating.current) {
              setMigrationNotice(
                'Your previous ScopeLedger workspace was migrated. Its original saved copy is still preserved in this browser.',
              );
              migrating.current = false;
            }
          }
        } catch (failure) {
          pending.current = true;
          throw markFailure(failure);
        } finally {
          writing.current = false;
          inFlightSequence.current = null;
        }
      }
    };
    const next = queue.current.catch(() => {}).then(task);
    queue.current = next;
    return next;
  }, [cancelTimer, getRepository, markFailure]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const repository = getRepository();
    const initialize = async () => {
      let result: Awaited<ReturnType<Repository['load']>>;
      try {
        result = await repository.load();
      } catch (failure) {
        if (!active) return;
        // Do not discard a draft already adopted by a previous lifecycle pass.
        const data = workspaceRef.current ?? createWorkspace();
        workspaceRef.current = data;
        setWorkspace(data);
        pending.current = true;
        setSaveState('failed');
        setError(
          `Storage is unavailable. Your edits stay in memory. Export a backup before closing. ${failure instanceof Error ? failure.message : ''}`,
        );
        return;
      }
      if (!active) return;
      sequence.current = result.sequence;
      if (result.recovery) {
        lock.current = new StorageRecoveryError();
        setRecovery(result.recovery);
        setPrevious(result.previous ?? null);
        setSaveState('failed');
        setError(result.recovery.reason);
        return;
      }
      let data = result.workspace;
      if (!data) {
        let legacy: string | null = null;
        try {
          legacy = window.localStorage.getItem(LEGACY_WORKSPACE_KEY);
        } catch {
          /* IndexedDB can work when optional legacy localStorage access is blocked. */
        }
        if (legacy !== null) {
          try {
            // A verification outage must never hide or erase existing paid work.
            data = parseBackup(legacy);
            migrating.current = true;
            setMigrationNotice(
              'Your previous workspace is loaded. Its original saved copy is preserved while this device migration is saved.',
            );
          } catch (failure) {
            const reason =
              failure instanceof Error
                ? failure.message
                : 'The previous workspace could not be migrated.';
            lock.current = new StorageRecoveryError();
            setRecovery({
              raw: legacy,
              reason: `Previous ScopeLedger data needs recovery. ${reason}`,
            });
            setSaveState('failed');
            setError(reason);
            return;
          }
        }
      }
      data ??= createWorkspace();
      workspaceRef.current = data;
      setWorkspace(data);
      if (result.workspace && !result.migrated) setSaveState('saved');
      else {
        if (result.migrated) {
          migrating.current = true;
          setMigrationNotice(
            'Your saved workspace is being upgraded. Its previous version is preserved for recovery.',
          );
        }
        pending.current = true;
        void flush().catch(() => {});
      }
    };
    void initialize();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current || writing.current || restoring.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const pageHide = () => {
      if (pending.current && !lock.current) void flush().catch(() => {});
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', pageHide);
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(EVENTS_CHANNEL);
    } catch {
      /* Atomic database sequences protect conflicts when notifications are unavailable. */
    }
    if (channel)
      channel.onmessage = (event) => {
        const message = event.data;
        if (
          !active ||
          message?.type !== 'workspace-saved' ||
          message.databaseName !== repository.databaseName ||
          !Number.isSafeInteger(message.sequence)
        )
          return;
        if (message.sequence > sequence.current && message.sequence !== inFlightSequence.current) {
          lock.current = new StorageConflictError();
          cancelTimer();
          setError(conflictMessage);
          setSaveState('failed');
        }
      };
    return () => {
      active = false;
      mounted.current = false;
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', pageHide);
      channel?.close();
      cancelTimer();
      // Let an active transaction finish. Aborting it would throw away acknowledged edits.
      if (pending.current && !lock.current) void flush().catch(() => {});
      void queue.current
        .catch(() => {})
        .then(async () => {
          // StrictMode immediately mounts the same hook again; keep its repository alive.
          if (!mounted.current && repositoryRef.current === repository) {
            repositoryRef.current = null;
            await repository.close();
          }
        });
    };
  }, [cancelTimer, flush, getRepository]);

  const mutate = useCallback(
    (change: Workspace | ((current: Workspace) => Workspace)) => {
      if (!workspaceRef.current) return;
      if (restoring.current) {
        setError('Workspace replacement is being saved. Wait for it to finish before editing.');
        return;
      }
      const next = typeof change === 'function' ? change(workspaceRef.current) : change;
      if (next === workspaceRef.current) return;
      // Reject excessive edits before adopting them; the last valid state remains usable.
      try {
        assertWorkspaceCapacity(next);
      } catch (failure) {
        mutationFailure.current =
          failure instanceof Error ? failure : new Error('The edit was not applied.');
        setError(mutationFailure.current.message);
        return false;
      }
      workspaceRef.current = next;
      setWorkspace(next);
      editVersion.current += 1;
      pending.current = true;
      cancelTimer();
      if (lock.current) {
        setSaveState('failed');
        return;
      }
      setSaveState('saving');
      timer.current = setTimeout(() => void flush().catch(() => {}), 350);
      return true;
    },
    [cancelTimer, flush],
  );

  const restore = useCallback(
    (data: Workspace): Promise<void> => {
      cancelTimer();
      restoring.current = true;
      const task = async () => {
        if (mounted.current) setSaveState('saving');
        inFlightSequence.current = sequence.current + 1;
        try {
          const committed = await getRepository().restore(data, sequence.current);
          sequence.current = committed;
          const restored = { ...data, sequence: committed };
          pending.current = false;
          editVersion.current += 1;
          workspaceRef.current = restored;
          lock.current = null;
          migrating.current = false;
          if (mounted.current) {
            setWorkspace(restored);
            setRecovery(null);
            setPrevious(null);
            setError('');
            setMigrationNotice('');
            setSaveState('saved');
          }
        } catch (failure) {
          throw markFailure(failure);
        } finally {
          restoring.current = false;
          inFlightSequence.current = null;
        }
      };
      const next = queue.current.catch(() => {}).then(task);
      queue.current = next;
      return next;
    },
    [cancelTimer, getRepository, markFailure],
  );

  const restorePrevious = useCallback(async () => {
    if (previous) await restore(previous);
  }, [previous, restore]);
  return {
    workspace,
    mutate,
    saveState,
    error,
    recovery,
    previous,
    migrationNotice,
    restore,
    restorePrevious,
    flush,
    clearMutationFailure: () => {
      mutationFailure.current = null;
    },
    assertMutationApplied: () => {
      if (mutationFailure.current) throw mutationFailure.current;
    },
    serialize: () => (workspaceRef.current ? serializeWorkspace(workspaceRef.current) : ''),
  };
}
