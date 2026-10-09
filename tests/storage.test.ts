import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Change, Workspace } from '../src/domain/types';
import {
  buildBrief,
  issueDocument,
  recordPayment,
  voidDocument,
  voidPayment,
} from '../src/domain/commercial';
import { blankTerms } from '../src/domain/operations';
import { reconcileChange, recordApproval } from '../src/domain/operations';
import { SCENARIOS } from '../src/content/scenarios';
import { confirmDefaults } from '../src/domain/setup';
import {
  MAX_WORKSPACE_BYTES,
  Repository,
  StorageConflictError,
  StorageRecoveryError,
  StorageUnavailableError,
  WorkspaceValidationError,
  parseBackup,
  prepareRestore,
  serializeWorkspace,
  WORKSPACE_STORE,
} from '../src/storage/repository';

const at = '2026-10-01T06:00:00.000Z';
function draft(id = 'change-1', projectId = 'sample-harbor'): Change {
  return {
    id,
    projectId,
    revision: 1,
    status: 'Draft',
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
    deletedAt: null,
    includedAt: null,
    title: 'Journal',
    request: 'Add a journal',
    deliverables: 'Index and template',
    exclusions: '',
    dependencies: '',
    assumptions: '',
    contractChecks: '',
    classification: 'Addition',
    route: 'Quote',
    hours: '8',
    rate: '65',
    outside: '0',
    removed: '0',
    removedScope: '',
    fee: '800',
    credit: '',
    creditReason: '',
    contractConfirmed: true,
  };
}
function fixture(): Workspace {
  const baseline = {
    fee: '8000',
    actual: '2000',
    remaining: '3200',
    target: '35',
    approvedScope: 'Website',
  };
  return {
    schemaVersion: 3,
    id: 'workspace-1',
    sequence: 0,
    updatedAt: at,
    agency: { name: 'Aster', defaultCurrency: 'USD', defaultRate: '65', defaultTarget: '35' },
    clients: [{ id: 'client-1', name: 'Harbor', contact: '', email: '', notes: '' }],
    projects: [
      {
        id: 'sample-harbor',
        clientId: 'client-1',
        name: 'Harbor / Website',
        currency: 'USD',
        sample: true,
        baseline: { ...baseline },
        originalBaseline: { ...baseline },
        createdAt: at,
        updatedAt: at,
        archivedAt: null,
        deletedAt: null,
      },
    ],
    changes: [draft()],
    revisions: [],
    approvals: [],
    reconciliations: [],
    documents: [],
    payments: [],
    calendarEvents: [],
    activity: [],
    customScenarios: [],
    assumptionPresets: [],
    comparisons: [],
    context: {
      projectId: 'sample-harbor',
      changeId: 'change-1',
      view: 'workspace',
      guideDismissed: false,
      lastBackupAt: null,
    },
  };
}
const repositories: Repository[] = [];
function repository(name: string = crypto.randomUUID()) {
  const value = new Repository(name);
  repositories.push(value);
  return value;
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(repositories.splice(0).map((repository) => repository.close()));
});
async function replaceStored(name: string, key: string, value: unknown) {
  await new Promise<void>((resolve, reject) => {
    const operation = indexedDB.open(name);
    operation.onerror = () => reject(operation.error);
    operation.onsuccess = () => {
      const database = operation.result,
        transaction = database.transaction(WORKSPACE_STORE, 'readwrite');
      transaction.objectStore(WORKSPACE_STORE).put(value, key);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}
function addCustom(workspace: Workspace, id = 'custom-1') {
  workspace.projects.push({
    ...structuredClone(workspace.projects[0]),
    id,
    sample: false,
    name: 'Custom',
  });
  workspace.changes.push(draft(`change-${id}`, id));
  return workspace;
}
function legacy(id = 'sample-harbor') {
  return {
    id,
    name: 'Harbor / Website',
    client: 'Harbor Studio',
    agency: 'Aster Studio',
    logo: '',
    currency: 'USD',
    fee: '8000',
    actual: '2000',
    remaining: '3200',
    target: '35',
    title: 'Add a journal',
    scope: 'Index and template',
    removedScope: '',
    assumptions: 'Copy from client',
    classification: 'Addition',
    route: 'Quote',
    hours: '8',
    rate: '65',
    outside: '0',
    removed: '0',
    adjustment: '800',
    status: 'Draft',
    revision: 1,
    approval: '',
    invoiceNumber: 'CHG-001',
    issueDate: '2026-09-13',
    dueDate: '2026-09-27',
    tax: '0',
    billing: 'Original billing address',
    payment: 'Bank transfer',
  };
}

describe('durable local workspace repository', () => {
  it('rolls back current and previous together when an active write transaction aborts', async () => {
    const store = repository(),
      workspace = fixture();
    await store.save(workspace, 0);
    workspace.changes[0].title = 'Not committed';
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = original.call(this, value, key);
      if (key === 'current') this.transaction.abort();
      return request;
    });
    await expect(store.save(workspace, 1)).rejects.toBeInstanceOf(StorageUnavailableError);
    vi.restoreAllMocks();
    const loaded = await store.load();
    expect(loaded.sequence).toBe(1);
    expect(loaded.workspace!.changes[0].title).toBe('Journal');
    expect(loaded.previous).toBeUndefined();
    expect(workspace.changes[0].title).toBe('Not committed');
  });
  it('keeps malformed timestamps recoverable and never adopts Date.parse overflow or local wall times', async () => {
    const store = repository(),
      workspace = fixture();
    await store.save(workspace, 0);
    for (const invalid of ['2026-02-31T12:00:00Z', '2026-10-04T12:30', '10/04/2026']) {
      const corrupt = { ...workspace, sequence: 1, updatedAt: invalid },
        raw = JSON.stringify(corrupt);
      await replaceStored(store.databaseName, 'current', { raw, sequence: 1 });
      const loaded = await store.load();
      expect(loaded.workspace).toBeNull();
      expect(loaded.recovery!.raw).toBe(raw);
      expect(loaded.recovery!.reason).toContain('explicit UTC offset');
      await expect(store.save(workspace, 1)).rejects.toBeInstanceOf(StorageRecoveryError);
    }
    const supported = { ...workspace, updatedAt: '2026-10-04T18:30:45.123+06:00' };
    expect(parseBackup(serializeWorkspace(supported)).updatedAt).toBe(supported.updatedAt);
  });
  it('uses atomic sequences when optional cross-tab notification construction is blocked', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new DOMException('Privacy policy', 'SecurityError');
        }
      },
    );
    const name = crypto.randomUUID(),
      first = repository(name),
      second = repository(name);
    await first.save(fixture(), 0);
    await expect(second.save(fixture(), 0)).rejects.toBeInstanceOf(StorageConflictError);
    expect((await second.load()).sequence).toBe(1);
  });
  it('saves and reopens exact identities, history, context, and committed sequence', async () => {
    const workspace = fixture(),
      first = repository('reload-test');
    workspace.context.guideDismissed = true;
    workspace.revisions.push({
      id: 'revision-1',
      projectId: 'sample-harbor',
      changeId: 'change-1',
      revision: 1,
      at,
      reason: 'Saved',
      change: structuredClone(workspace.changes[0]),
      baseline: structuredClone(workspace.projects[0].baseline),
    });
    expect(await first.load()).toEqual({ workspace: null, sequence: 0 });
    expect(await first.save(workspace, 0)).toBe(1);
    expect(workspace.sequence).toBe(0);
    await first.close();
    const next = repository('reload-test'),
      loaded = await next.load();
    expect(loaded.workspace).toEqual({ ...workspace, sequence: 1 });
    expect(loaded.sequence).toBe(1);
    expect(
      await next.save(
        { ...loaded.workspace!, context: { ...workspace.context, view: 'projects' } },
        1,
      ),
    ).toBe(2);
    expect((await next.load()).previous?.sequence).toBe(1);
  });
  it('retains unfinished and invalid numeric draft text across save, export, and restore', async () => {
    const workspace = fixture(),
      store = repository();
    workspace.projects[0].baseline.actual = '';
    workspace.projects[0].baseline.target = 'legacy unknown';
    workspace.changes[0].hours = '.';
    workspace.changes[0].rate = '3e9999';
    workspace.changes[0].fee = '-';
    workspace.changes[0].outside = 'not yet estimated';
    workspace.changes[0].removed = '1e-101';
    workspace.changes[0].credit = '-1e-999999999999999999';
    await store.save(workspace, 0);
    const loaded = (await store.load()).workspace!;
    expect(loaded.projects[0].baseline.actual).toBe('');
    expect(loaded.changes[0].hours).toBe('.');
    expect(loaded.changes[0].removed).toBe('1e-101');
    expect(loaded.changes[0].credit).toBe('-1e-999999999999999999');
    expect(parseBackup(serializeWorkspace(loaded))).toEqual(loaded);
    expect(prepareRestore(serializeWorkspace(loaded)).changes[0].rate).toBe('3e9999');
  });
  it('atomically rejects a stale tab without overwriting its newer saved version', async () => {
    const name = crypto.randomUUID(),
      first = repository(name),
      second = repository(name);
    await first.save(fixture(), 0);
    const left = (await first.load()).workspace!,
      right = (await second.load()).workspace!;
    left.changes[0].title = 'Tab A';
    right.changes[0].title = 'Tab B';
    const results = await Promise.allSettled([first.save(left, 1), second.save(right, 1)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(StorageConflictError);
    expect(rejected.reason.code).toBe('STORAGE_CONFLICT');
    const loaded = await first.load();
    expect(loaded.sequence).toBe(2);
    expect(['Tab A', 'Tab B']).toContain(loaded.workspace!.changes[0].title);
    expect(loaded.previous!.changes[0].title).toBe('Journal');
  });
  it('validates before replacing known-good records and does not coerce values', async () => {
    const store = repository(),
      valid = fixture();
    await store.save(valid, 0);
    const invalid = structuredClone(valid);
    (invalid.changes[0] as unknown as Record<string, unknown>).hours = 8;
    await expect(store.save(invalid, 1)).rejects.toBeInstanceOf(WorkspaceValidationError);
    expect((await store.load()).sequence).toBe(1);
    invalid.changes[0].hours = '8';
    invalid.changes[0].projectId = 'missing';
    await expect(store.save(invalid, 1)).rejects.toThrow('missing referenced project');
    expect((await store.load()).workspace).toEqual({ ...valid, sequence: 1 });
  });
  it('reports full storage and rolls the whole transaction back', async () => {
    const store = repository(),
      workspace = fixture();
    await store.save(workspace, 0);
    workspace.changes[0].title = 'Not committed';
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (key === 'current') throw new DOMException('Quota exhausted', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(store.save(workspace, 1)).rejects.toThrow('storage is full');
    vi.restoreAllMocks();
    const loaded = await store.load();
    expect(loaded.sequence).toBe(1);
    expect(loaded.workspace!.changes[0].title).toBe('Journal');
    expect(loaded.previous).toBeUndefined();
  });
  it('fails safely when browser storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const store = repository();
    await expect(store.load()).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(store.save(fixture(), 0)).rejects.toThrow('Local storage is unavailable');
    // The repository never claims that this in-memory draft was saved.
    vi.unstubAllGlobals();
    expect(await store.save(fixture(), 0)).toBe(1);
  });
  it('offers untouched corrupt data and previous known-good work without silently overwriting', async () => {
    const store = repository(),
      workspace = fixture();
    await store.save(workspace, 0);
    workspace.changes[0].title = 'Later work';
    await store.save(workspace, 1);
    const raw = '{"schemaVersion":2,"broken":';
    await replaceStored(store.databaseName, 'current', { raw, sequence: 2 });
    const loaded = await store.load();
    expect(loaded.workspace).toBeNull();
    expect(loaded.sequence).toBe(2);
    expect(loaded.recovery!.raw).toBe(raw);
    expect(loaded.previous!.changes[0].title).toBe('Journal');
    await expect(store.save(workspace, 2)).rejects.toBeInstanceOf(StorageRecoveryError);
    expect(await store.getRecoveryRaw()).toBe(raw);
    expect(await store.restorePrevious(2)).toBe(3);
    expect((await store.load()).workspace!.changes[0].title).toBe('Journal');
    expect(await store.getRecoveryRaw()).toBe(raw);
  });
  it('treats mismatched envelope sequence as corruption and retains raw recovery', async () => {
    const store = repository();
    await store.save(fixture(), 0);
    const raw = serializeWorkspace(fixture());
    await replaceStored(store.databaseName, 'current', { raw, sequence: 8 });
    const loaded = await store.load();
    expect(loaded.recovery!.reason).toContain('sequence');
    expect(loaded.sequence).toBe(8);
    await expect(store.restore(fixture(), 7)).rejects.toBeInstanceOf(StorageConflictError);
    await store.restore(fixture(), 8);
    expect((await store.load()).sequence).toBe(9);
    expect(await store.getRecoveryRaw()).toBe(raw);
  });
  it('does not silently create an empty workspace when a previous version survives a missing current record', async () => {
    const store = repository(),
      workspace = fixture();
    await store.save(workspace, 0);
    await store.save(workspace, 1);
    await replaceStored(store.databaseName, 'current', undefined);
    const loaded = await store.load();
    expect(loaded.workspace).toBeNull();
    expect(loaded.recovery!.reason).toContain('missing');
    expect(loaded.previous!.sequence).toBe(1);
    await expect(store.save(workspace, 0)).rejects.toBeInstanceOf(StorageRecoveryError);
    expect(await store.restorePrevious(0)).toBe(1);
    expect((await store.load()).workspace!.changes[0].title).toBe('Journal');
  });
});

describe('versioned backups and structural relationships', () => {
  it('restores a realistic sample-plus-custom graph with dated approvals, reconciliations, tax, partial cash, credit settlements and void history', async () => {
    let w = addCustom(fixture());
    w.agency.legalName = 'Aster legal';
    w.agency.address = 'Issuer address';
    w.agency.email = 'issuer@example.test';
    w.agency.paymentInstructions = 'Manual bank instructions';
    w.agency.timezone = 'Asia/Dhaka';
    w = confirmDefaults(w);
    w.agency.logoDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    w.clients[0].address = 'Client billing address';
    w.changes[0].credit = '0';
    w = recordApproval(w, 'change-1', 'Client accepted the dated quote by email', '2020-01-01');
    w = reconcileChange(w, 'change-1', '0', '520');
    w = issueDocument(w, 'change-1', 'invoice', {
      reference: 'RESTORE-INVOICE',
      issueDate: '2020-01-02',
      dueDate: '2020-01-15',
      taxRate: '5',
    });
    const invoiceId = w.documents[0].id;
    w = recordPayment(w, invoiceId, {
      id: 'voided-payment',
      amount: '240',
      date: '2020-01-10',
      note: 'Duplicate receipt',
    });
    w = voidPayment(w, 'voided-payment', 'Entry entered twice');
    w = recordPayment(w, invoiceId, {
      id: 'partial-payment',
      amount: '300',
      date: '2020-01-11',
      reference: 'Bank record',
    });
    const creditChange = w.changes.find((change) => change.projectId === 'custom-1')!;
    creditChange.fee = '0';
    creditChange.credit = '50';
    creditChange.creditReason = 'Agreed client credit';
    w = recordApproval(w, creditChange.id, 'Client accepted an explicit credit', '2020-01-01');
    w = issueDocument(w, creditChange.id, 'credit', {
      reference: 'RESTORE-CREDIT',
      issueDate: '2020-01-02',
      dueDate: '2020-01-15',
      taxRate: '0',
    });
    const creditId = w.documents[1].id;
    w = recordPayment(w, creditId, {
      id: 'outgoing-credit',
      amount: '20',
      date: '2020-01-12',
      note: 'Manual outgoing settlement',
    });
    w = voidDocument(w, creditId, 'Credit document replaced; recorded settlement retained');
    w.calendarEvents.push({
      id: 'linked-followup',
      projectId: 'sample-harbor',
      changeId: 'change-1',
      documentId: invoiceId,
      title: 'Request remaining payment',
      startsAt: '2026-10-04T12:30:45.123Z',
      endsAt: '2026-10-04T13:00:00Z',
      allDay: false,
      timezone: 'Asia/Dhaka',
      source: 'manual',
      status: 'completed',
      type: 'invoice-due',
    });
    w.projects[1].archivedAt = at;
    const raw = serializeWorkspace(w),
      restored = prepareRestore(raw, true),
      store = repository();
    expect(restored).toEqual(w);
    expect(restored.agency.logoDataUrl).toBe(w.agency.logoDataUrl);
    expect(await store.restore(restored, 0)).toBe(1);
    expect(await store.restore(prepareRestore(raw, true), 1)).toBe(2);
    const loaded = (await store.load()).workspace!;
    expect(loaded).toEqual({ ...w, sequence: 2 });
    expect(loaded.documents.map((document) => document.id)).toEqual([invoiceId, creditId]);
    expect(loaded.payments).toHaveLength(3);
    expect(loaded.reconciliations).toHaveLength(1);
    expect(loaded.approvals).toHaveLength(2);
    expect(loaded.calendarEvents[0].startsAt).toBe('2026-10-04T12:30:45.123Z');
  });
  it('rejects invoice source events that reference a brief or an unissued document', () => {
    const w = fixture();
    w.documents.push({
      id: 'source-doc',
      projectId: w.projects[0].id,
      changeId: w.changes[0].id,
      revision: 1,
      kind: 'brief',
      createdAt: at,
    });
    w.calendarEvents.push({
      id: 'bad-source',
      projectId: w.projects[0].id,
      documentId: 'source-doc',
      title: 'Invalid source',
      startsAt: '2026-10-04',
      allDay: true,
      source: 'invoice',
    });
    expect(() => serializeWorkspace(w)).toThrow('issued invoice source');
    w.documents[0].kind = 'invoice';
    expect(() => serializeWorkspace(w)).toThrow('issued invoice source');
  });
  it('keeps manual identities separate from derived source identities', () => {
    const w = fixture();
    w.calendarEvents.push({
      id: 'project-deadline:sample-harbor',
      projectId: 'sample-harbor',
      title: 'Impersonated deadline',
      startsAt: '2026-10-04',
    });
    expect(() => serializeWorkspace(w)).toThrow('cannot impersonate derived');
    w.calendarEvents[0].id = 'manual-deadline';
    expect(parseBackup(serializeWorkspace(w)).calendarEvents[0].id).toBe('manual-deadline');
  });
  it('preserves undated flat-v1 approval history but requires dated reconfirmation before execution', () => {
    const approved = legacy('approved-legacy');
    approved.status = 'Approved';
    approved.revision = 4;
    approved.approval = 'Client agreed in the original email; no date was saved.';
    const raw = JSON.stringify({
      version: 1,
      projects: [approved],
      snapshots: [
        { id: 'original-approved-snapshot', at: '2020-01-01T00:00:00Z', project: approved },
      ],
    });
    const workspace = parseBackup(raw),
      change = workspace.changes[0];
    expect(workspace.projects[0].id).toBe('approved-legacy');
    expect(change.status).toBe('Draft');
    expect(change.revision).toBe(5);
    expect(workspace.approvals).toEqual([]);
    expect(
      workspace.revisions.find((revision) => revision.id === 'original-approved-snapshot')!.change
        .status,
    ).toBe('Approved');
    const imported = workspace.revisions.find(
      (revision) => revision.id !== 'original-approved-snapshot',
    )!;
    expect(imported.change.status).toBe('Approved');
    expect(imported.change.revision).toBe(4);
    expect(imported.reason).toContain(approved.approval);
    expect(imported.reason).toContain('not client approval');
    expect(workspace.clients[0].notes).toContain('"approvalDate":null');
    expect(() => reconcileChange(workspace, change.id, '0', '520')).toThrow(
      'Record a current approval',
    );
    expect(parseBackup(serializeWorkspace(workspace))).toEqual(workspace);
  });
  it('keeps actual native schema2 approval dates and current approval state unchanged', () => {
    const current = fixture();
    current.changes[0].status = 'Approved';
    current.approvals.push({
      id: 'dated-approval',
      projectId: 'sample-harbor',
      changeId: 'change-1',
      revision: 1,
      approvedAt: '2020-03-04',
      recordedAt: '2020-03-04T12:00:00Z',
      evidence: 'Dated evidence',
      invalidatedAt: null,
    });
    const { activity, customScenarios, assumptionPresets, comparisons, ...old } = current;
    const migrated = parseBackup(JSON.stringify({ ...old, schemaVersion: 2 }));
    expect(migrated.approvals).toEqual(current.approvals);
    expect(migrated.changes[0].status).toBe('Approved');
    expect(migrated.changes[0].revision).toBe(1);
  });
  it('upgrades a native schema 2 record without changing identities, sequence, drafts or its original recovery copy', async () => {
    const store = repository();
    await store.load();
    const { activity, customScenarios, assumptionPresets, comparisons, ...old } = fixture();
    const source = {
      ...old,
      schemaVersion: 2,
      sequence: 7,
      calendarEvents: [
        {
          id: 'old-timed-event',
          projectId: 'sample-harbor',
          changeId: 'change-1',
          title: 'Old timed reminder',
          startsAt: '2026-10-01T18:30:00Z',
        },
      ],
    };
    source.changes[0].hours = '.';
    const raw = JSON.stringify(source);
    await replaceStored(store.databaseName, 'current', { raw, sequence: 7 });
    const loaded = await store.load();
    expect(loaded.migrated).toBe(true);
    expect(loaded.sequence).toBe(7);
    expect(loaded.workspace!.schemaVersion).toBe(3);
    expect(loaded.workspace!.changes[0].hours).toBe('.');
    expect(loaded.workspace!.calendarEvents[0]).toMatchObject({
      id: 'old-timed-event',
      startsAt: '2026-10-01T18:30:00Z',
      allDay: false,
      source: 'manual',
      status: 'open',
    });
    expect(loaded.workspace!.calendarEvents[0].timezone).toBeTruthy();
    expect(loaded.workspace!.activity).toEqual([]);
    expect(await store.save(loaded.workspace!, 7)).toBe(8);
    const saved = await store.load();
    expect(saved.migrated).toBeUndefined();
    expect(saved.previous!.sequence).toBe(7);
    expect(saved.previous!.changes[0].id).toBe('change-1');
  });
  it('loads and migrates existing work above demo allowance while explicit demo restore still requires activation', async () => {
    const store = repository();
    await store.load();
    const { activity, customScenarios, assumptionPresets, comparisons, ...old } = addCustom(
      addCustom(fixture()),
      'second-custom',
    );
    const raw = JSON.stringify({ ...old, schemaVersion: 2, sequence: 9 });
    await replaceStored(store.databaseName, 'current', { raw, sequence: 9 });
    expect((await store.load()).workspace!.projects).toHaveLength(3);
    expect(() => prepareRestore(raw, true)).toThrow('require activation');
    expect(prepareRestore(raw, false).projects).toHaveLength(3);
    const legacyRaw = JSON.stringify({
      version: 1,
      projects: [legacy(), legacy('custom-a'), legacy('custom-b')],
      snapshots: [],
    });
    expect(parseBackup(legacyRaw).projects).toHaveLength(3);
  });
  it('round-trips operational records, new settings, private comparisons and preserved client snapshots', async () => {
    const workspace = fixture();
    workspace.agency = {
      ...workspace.agency,
      timezone: 'Asia/Dhaka',
      legalName: 'Owner test agency',
      address: 'Address',
      defaultTaxRate: 'unfinished tax',
      accentColor: '#27695d',
      logoDataUrl: '',
      messageTemplates: {
        quote: 'Quote {{title}}',
        absorb: 'Absorb',
        exchange: 'Exchange',
        defer: 'Defer',
        followup: 'Follow-up',
      },
    };
    workspace.projects[0].deadline = '2026-10-05';
    workspace.projects[0].state = 'on-hold';
    workspace.clients[0].address = 'Billing address';
    const terms = Object.fromEntries(
      Object.keys(blankTerms()).map((key) => [key, workspace.changes[0][key as keyof Change]]),
    ) as unknown as ReturnType<typeof blankTerms>;
    workspace.customScenarios.push({
      ...SCENARIOS[0],
      id: 'custom-scenario',
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
    workspace.assumptionPresets.push({
      id: 'preset-1',
      title: 'Client copy',
      text: 'Approved copy supplied before delivery',
      deletedAt: null,
    });
    workspace.comparisons.push({
      id: 'comparison-1',
      projectId: 'sample-harbor',
      changeId: 'change-1',
      name: 'Private alternative',
      terms,
      createdAt: at,
      deletedAt: null,
    });
    const snapshot = buildBrief(workspace, 'change-1');
    workspace.documents.push({
      id: 'snapshot-document',
      projectId: 'sample-harbor',
      changeId: 'change-1',
      revision: 1,
      kind: 'brief',
      createdAt: at,
      issuedAt: at,
      snapshot,
      voidedAt: null,
      voidReason: '',
    });
    workspace.calendarEvents.push({
      id: 'event-1',
      projectId: 'sample-harbor',
      changeId: 'change-1',
      documentId: 'snapshot-document',
      title: 'Follow-up',
      startsAt: '2026-10-05',
      endsAt: '2026-10-06',
      allDay: true,
      timezone: 'Asia/Dhaka',
      type: 'quote-followup',
      source: 'manual',
      status: 'open',
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
    workspace.activity.push({
      id: 'activity-1',
      at,
      kind: 'reminder',
      message: 'Created follow-up',
      projectId: 'sample-harbor',
      changeId: 'change-1',
      documentId: 'snapshot-document',
    });
    const raw = serializeWorkspace(workspace),
      store = repository();
    expect(parseBackup(raw)).toEqual(workspace);
    await store.restore(prepareRestore(raw), 0);
    expect((await store.load()).workspace).toEqual({ ...workspace, sequence: 1 });
  });
  it('rejects malformed new arrays and orphaned comparison/activity/event links', () => {
    const workspace = fixture(),
      terms = Object.fromEntries(
        Object.keys(blankTerms()).map((key) => [key, workspace.changes[0][key as keyof Change]]),
      ) as unknown as ReturnType<typeof blankTerms>;
    workspace.comparisons.push({
      id: 'comparison',
      projectId: 'missing',
      changeId: 'change-1',
      name: 'Comparison',
      terms,
      createdAt: at,
      deletedAt: null,
    });
    expect(() => serializeWorkspace(workspace)).toThrow('missing referenced project');
    workspace.comparisons[0].projectId = 'sample-harbor';
    workspace.activity.push({
      id: 'activity',
      at,
      kind: 'document',
      message: 'Issued',
      documentId: 'missing',
    });
    expect(() => serializeWorkspace(workspace)).toThrow('missing or different source');
    workspace.activity = [];
    workspace.calendarEvents.push({
      id: 'event',
      projectId: 'sample-harbor',
      documentId: 'missing',
      title: 'Due',
      startsAt: '2026-10-05',
      allDay: true,
    });
    expect(() => serializeWorkspace(workspace)).toThrow('missing or different source');
    workspace.calendarEvents = [];
    workspace.assumptionPresets.push({
      id: 'preset',
      title: 'Valid',
      text: 'Text',
      deletedAt: null,
    });
    workspace.assumptionPresets.push({ ...workspace.assumptionPresets[0] });
    expect(() => serializeWorkspace(workspace)).toThrow('duplicate identity');
    workspace.assumptionPresets = [];
    const malformed = { ...workspace, customScenarios: {} };
    expect(() => parseBackup(JSON.stringify(malformed))).toThrow('expected a list');
  });
  it('enforces document confidentiality, stable snapshot relationships and issued-history immutability', async () => {
    const workspace = fixture(),
      snapshot = buildBrief(workspace, 'change-1');
    workspace.documents.push({
      id: 'preserved-document',
      projectId: 'sample-harbor',
      changeId: 'change-1',
      revision: 1,
      kind: 'brief',
      createdAt: at,
      issuedAt: at,
      snapshot,
      voidedAt: null,
    });
    const invalid = structuredClone(workspace);
    (invalid.documents[0].snapshot as unknown as Record<string, unknown>).privateHours = '8';
    expect(() => serializeWorkspace(invalid)).toThrow('unapproved fields');
    const wrong = structuredClone(workspace);
    wrong.documents[0].snapshot!.changeReference = 'different-change';
    expect(() => serializeWorkspace(wrong)).toThrow('change identity');
    const store = repository();
    await store.save(workspace, 0);
    const revised = structuredClone(workspace);
    revised.documents[0].snapshot!.scope = 'Rewritten history';
    await expect(store.save(revised, 1)).rejects.toThrow('issued snapshots');
    expect((await store.load()).sequence).toBe(1);
    const voided = structuredClone(workspace);
    voided.documents[0].voidedAt = at;
    voided.documents[0].voidReason = 'Cancelled by agreement';
    await expect(store.save(voided, 1)).resolves.toBe(2);
    expect((await store.load()).workspace!.documents[0].snapshot).toEqual(snapshot);
  });
  it('migrates legacy projects and snapshots while preserving IDs, partial drafts, and document settings', () => {
    const sample = legacy(),
      custom = legacy('custom-legacy');
    custom.hours = '.';
    custom.actual = '';
    custom.tax = 'draft tax';
    const source = {
      version: 1,
      projects: [sample, custom],
      snapshots: [{ id: 'original-snapshot-id', at, project: structuredClone(custom) }],
    };
    const workspace = prepareRestore(JSON.stringify(source));
    expect(workspace.schemaVersion).toBe(3);
    expect(workspace.projects.map((project) => project.id)).toEqual([
      'sample-harbor',
      'custom-legacy',
    ]);
    expect(workspace.revisions[0].id).toBe('original-snapshot-id');
    expect(workspace.revisions[0].changeId).toBe(workspace.changes[1].id);
    expect(workspace.changes[1].hours).toBe('.');
    expect(workspace.projects[1].baseline.actual).toBe('');
    expect(workspace.clients[1].notes).toContain('draft tax');
    expect(workspace.clients[1].notes).toContain('Original billing address');
    expect(parseBackup(serializeWorkspace(workspace))).toEqual(workspace);
  });
  it('preserves repeated legacy snapshots and recovers a snapshot of an absent project', () => {
    const sample = legacy(),
      forgotten = legacy('forgotten');
    forgotten.revision = 3;
    const workspace = parseBackup(
      JSON.stringify({
        version: 1,
        projects: [sample],
        snapshots: [
          { id: 'snapshot-a', at, project: forgotten },
          { id: 'snapshot-b', at, project: forgotten },
        ],
      }),
    );
    expect(workspace.revisions.map((revision) => revision.id)).toEqual([
      'snapshot-a',
      'snapshot-b',
    ]);
    expect(workspace.projects[1].id).toBe('forgotten');
    expect(workspace.projects[1].archivedAt).not.toBeNull();
    expect(workspace.changes[1].revision).toBe(3);
  });
  it('accepts sample plus one custom in a fresh demo and repeated restores replace without duplicates', async () => {
    const workspace = addCustom(fixture()),
      raw = serializeWorkspace(workspace),
      store = repository();
    expect(await store.restore(prepareRestore(raw), 0)).toBe(1);
    expect(await store.restore(prepareRestore(raw), 1)).toBe(2);
    const loaded = (await store.load()).workspace!;
    expect(loaded.projects.map((project) => project.id)).toEqual(['sample-harbor', 'custom-1']);
    expect(loaded.changes.map((change) => change.id)).toEqual(['change-1', 'change-custom-1']);
    expect(loaded.projects).toHaveLength(2);
    expect(loaded.changes).toHaveLength(2);
  });
  it('enforces demo allowance for archived projects and rejects spoofed samples and client licensing flags', () => {
    const workspace = addCustom(addCustom(fixture()), 'custom-2');
    workspace.projects[2].archivedAt = at;
    expect(() => prepareRestore(serializeWorkspace(workspace))).toThrow('require activation');
    expect(prepareRestore(serializeWorkspace(workspace), false).projects).toHaveLength(3);
    workspace.projects[2].sample = true;
    expect(() => serializeWorkspace(workspace)).toThrow('canonical');
    const spoofed = { ...fixture(), licenseActive: true };
    expect(() => parseBackup(JSON.stringify(spoofed))).toThrow('unrecognized field');
  });
  it('uses a compatible 50 MiB byte limit for saves, exports, and restore', async () => {
    const workspace = fixture(),
      store = repository();
    for (let index = 0; index < Math.ceil(MAX_WORKSPACE_BYTES / 120000) + 1; index++)
      workspace.clients.push({
        id: `large-client-${index}`,
        name: '',
        contact: '',
        email: '',
        notes: '界'.repeat(40_000),
      });
    const raw = JSON.stringify(workspace);
    expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(MAX_WORKSPACE_BYTES);
    expect(() => serializeWorkspace(workspace)).toThrow('50 MiB');
    expect(() => parseBackup(raw)).toThrow('50 MiB');
    await expect(store.save(workspace, 0)).rejects.toThrow('50 MiB');
    expect(await store.load()).toEqual({ workspace: null, sequence: 0 });
  });
  it('rejects duplicate identities, invalid enums, excessive text, and unsupported schemas', () => {
    const duplicate = fixture();
    duplicate.changes.push(structuredClone(duplicate.changes[0]));
    expect(() => serializeWorkspace(duplicate)).toThrow('duplicate identity');
    const invalid = fixture();
    (invalid.changes[0] as unknown as Record<string, unknown>).route = 'Auto-bill';
    expect(() => serializeWorkspace(invalid)).toThrow('expected Quote');
    invalid.changes[0].route = 'Quote';
    invalid.changes[0].hours = '1'.repeat(1_001);
    expect(() => serializeWorkspace(invalid)).toThrow('1,000');
    expect(() => parseBackup('{"schemaVersion":99}')).toThrow('missing field');
    expect(() => parseBackup('null')).toThrow('expected an object');
  });
  it('rejects corrupt revision, approval, reconciliation, payment, and context relationships', () => {
    const workspace = fixture(),
      change = workspace.changes[0];
    change.status = 'Approved';
    change.includedAt = at;
    workspace.revisions.push({
      id: 'revision-1',
      projectId: change.projectId,
      changeId: change.id,
      revision: 1,
      at,
      reason: 'Approval',
      change: structuredClone(change),
      baseline: structuredClone(workspace.projects[0].baseline),
    });
    workspace.approvals.push({
      id: 'approval-1',
      projectId: change.projectId,
      changeId: change.id,
      revision: 1,
      approvedAt: at,
      recordedAt: at,
      evidence: 'Client email',
      invalidatedAt: null,
    });
    workspace.reconciliations.push({
      id: 'reconciliation-1',
      projectId: change.projectId,
      changeId: change.id,
      approvalId: 'approval-1',
      at,
      addedFee: '800',
      incurred: '0',
      remaining: '520',
      removedFuture: '0',
      before: structuredClone(workspace.projects[0].baseline),
      after: { ...workspace.projects[0].baseline, fee: '8800', remaining: '3720' },
    });
    workspace.documents.push({
      id: 'document-1',
      projectId: change.projectId,
      changeId: change.id,
      revision: 1,
      kind: 'invoice',
      createdAt: at,
    });
    workspace.payments.push({
      id: 'payment-1',
      projectId: change.projectId,
      documentId: 'document-1',
      amount: '800',
      receivedAt: at,
    });
    expect(parseBackup(serializeWorkspace(workspace))).toEqual(workspace);
    const badRevision = structuredClone(workspace);
    badRevision.revisions[0].change.id = 'other';
    expect(() => serializeWorkspace(badRevision)).toThrow('revision identity');
    const stale = structuredClone(workspace);
    stale.changes[0].revision = 2;
    expect(() => serializeWorkspace(stale)).toThrow('active approval is stale');
    const twice = structuredClone(workspace);
    twice.reconciliations.push({ ...twice.reconciliations[0], id: 'reconciliation-2' });
    expect(() => serializeWorkspace(twice)).toThrow('baseline twice');
    const badPayment = structuredClone(workspace);
    badPayment.payments[0].documentId = 'missing';
    expect(() => serializeWorkspace(badPayment)).toThrow('missing or different project');
    const badContext = structuredClone(workspace);
    badContext.context.projectId = 'other';
    expect(() => serializeWorkspace(badContext)).toThrow('missing referenced project');
  });
});
